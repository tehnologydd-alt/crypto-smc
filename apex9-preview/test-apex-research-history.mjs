import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTranscript,mergeTranscripts,batchTranscripts,readTranscripts,writeTranscripts,HISTORY_KEY,MAX_TRANSCRIPTS,validateTranscriptArchive,summarizeResearchHistory,auditResearchEvidence,extractHistoricalFacts,structuredResearchRecord,compareHistoricalClaims,findArchiveSourceConflicts} from './apex-research-history.mjs';
const now=1794650000000;
const run=(asset='BTCUSDT',startedAt=now-86400000)=>({
 version:1,asset,startedAt,stage:'ANALYST_READY',
 evidence:[{source_id:'binance:spot:24h:'+asset+':'+startedAt,observed_at:startedAt-1000,text:'Test public snapshot'}],
 sourceIds:['binance:spot:24h:'+asset+':'+startedAt],
 analystText:'Insufficient evidence to establish a causal claim.'
});
const complete=s=>({...s,stage:'COMPLETE',criticAt:s.startedAt+300000,criticText:'The analyst conclusion remains unverified.',criticEvidence:s.evidence});
test('old completed study is restored as history without becoming a live session',()=>{
 const a=run(),b=complete(a);
 assert.equal(normalizeTranscript(b,now).stage,'COMPLETE');
 assert.equal(mergeTranscripts([b],[a],now).length,1);
 assert.equal(mergeTranscripts([b],[a],now)[0].stage,'COMPLETE');
 assert.equal(mergeTranscripts([a],[b],now)[0].stage,'COMPLETE');
});
test('conflicting replay and cross-asset evidence are rejected',()=>{
 const a=run();
 assert.equal(normalizeTranscript({...a,evidence:run('ETHUSDT').evidence},now),null);
 const rows=mergeTranscripts([a],[complete({...a,analystText:'A conflicting replacement for original text.'})],now);
 assert.equal(rows[0].stage,'ANALYST_READY');
});
test('batch recovery and storage are bounded, per asset and replay-idempotent',()=>{
 const a=run(),b=run('ETHUSDT');
 const batch={version:1,stage:'COMPLETE',startedAt:a.startedAt,items:[complete(a),complete(b)]};
 const recovered=batchTranscripts(batch);
 const rows=mergeTranscripts([],recovered,now);
 assert.equal(rows.length,2);
 assert.equal(mergeTranscripts(rows,recovered,now).length,2);
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(writeTranscripts(store,rows),true);
 assert.deepEqual(readTranscripts(store,now),rows);
 assert.equal(writeTranscripts({setItem(){throw Error('quota');}},rows),false);
 const many=Array.from({length:MAX_TRANSCRIPTS+50},(_,i)=>run('BTCUSDT',now-86400000+i));
 assert.equal(mergeTranscripts([],many,now).length,MAX_TRANSCRIPTS);
 map.set(HISTORY_KEY,'broken');
 assert.deepEqual(readTranscripts(store,now),[]);
});

test('portable archive validation rejects duplicate, malformed and over-capacity records',()=>{
 const a=normalizeTranscript(complete(run()),now);
 assert.equal(validateTranscriptArchive({version:1,rows:[a]},now).rows.length,1);
 assert.equal(validateTranscriptArchive({version:1,rows:[a,a]},now),null);
 assert.equal(validateTranscriptArchive({version:1,rows:[{...a,asset:'ETHUSDT'}]},now),null);
 assert.equal(validateTranscriptArchive({version:1,rows:Array(MAX_TRANSCRIPTS+1).fill(a)},now),null);
});

test('research statistics distinguish finished reviews, source coverage and unknown accuracy',()=>{
 const a=run(),b=run('ETHUSDT',a.startedAt+1000);
 const newer={source_id:'binance:depth:BTCUSDT:'+(a.startedAt+1000),
  observed_at:a.startedAt+1000,text:'A later public observation.'};
 const done={...complete(a),criticEvidence:[newer]};
 const extra={source_id:'okx:depth:ETHUSDT:'+b.startedAt,
  observed_at:b.startedAt-2000,text:'Second exchange public observation.'};
 b.evidence.push(extra);b.sourceIds.push(extra.source_id);
 const s=summarizeResearchHistory([a,done,b,done],{now});
 assert.equal(s.total,2);assert.equal(s.completed,1);
 assert.equal(s.pending,1);assert.equal(s.completionPercent,50);
 assert.equal(s.multiVenue,1);assert.equal(s.reviewNewEvidence,1);
 assert.equal(s.distinctSnapshots,4);assert.equal(s.assets,2);
 assert.equal(s.medianReviewMs,300000);
 assert.equal(s.accuracy,null);assert.equal(s.agreement,null);
 const only=summarizeResearchHistory([done,b],{asset:'BTCUSDT',now});
 assert.equal(only.total,1);assert.equal(only.multiVenue,0);
 assert.equal(only.completionPercent,100);assert.equal(only.accuracy,null);
});
test('empty archive has no fabricated percentages or time metrics',()=>{
 const s=summarizeResearchHistory([],{now});
 assert.equal(s.total,0);assert.equal(s.completionPercent,null);
 assert.equal(s.medianReviewMs,null);assert.equal(s.medianInputAgeMs,null);
 assert.equal(s.accuracy,null);assert.equal(s.agreement,null);
});
test('repeated observations and a new snapshot on the same exchange do not count as two exchanges',()=>{
 const a=run();
 const b=complete(a);
 const c=summarizeResearchHistory([b,b],{now});
 assert.equal(c.distinctSnapshots,1);assert.equal(c.multiVenue,0);
 assert.equal(c.reviewNewEvidence,0);assert.equal(c.total,1);
});

test('evidence comparison separates repeated snapshots, later observations and same-ID conflicts',()=>{
 const a=run(),s=a.evidence[0];
 const newer={...s,source_id:'binance:spot:24h:'+a.asset+':'+(a.startedAt+1000),
  observed_at:a.startedAt+1000,text:'Different later observation'};
 const b={...complete(a),criticEvidence:[s,newer]};
 const good=auditResearchEvidence(b);
 assert.equal(good.status,'COMPARED');
 assert.equal(good.shared.length,1);assert.equal(good.later.length,1);
 assert.equal(good.conflicts.length,0);assert.equal(good.semanticAgreement,null);
 const bad={...b,criticEvidence:[{...s,text:'Changed same ID'}]};
 assert.equal(auditResearchEvidence(bad).status,'SOURCE_CONFLICT');
 assert.equal(summarizeResearchHistory([bad],{now}).sourceConflicts,1);
});
test('unreviewed evidence remains unreviewed and does not imply disagreement',()=>{
 const a=auditResearchEvidence(run());
 assert.equal(a.status,'AWAITING_REVIEW');
 assert.equal(a.semanticAgreement,null);assert.equal(a.conclusionAccuracy,null);
 assert.equal(a.conflicts.length,0);
});

test('only exact historical public ticker format becomes typed observations',()=>{
 const a=run(),e=a.evidence[0],at=e.observed_at;
 e.source_id='binance:spot:24h:'+a.asset+':'+at;
 a.sourceIds=[e.source_id];
 e.text='Asset '+a.asset+'; source Binance public spot 24h ticker; observed '+
  new Date(at).toISOString()+'; last price 1.234e-2 USDT; last 24h change -1.2%; last 24h quote volume 10 USDT. This is past-market context, not a prediction.';
 const parsed=extractHistoricalFacts(e,a.asset);
 assert.deepEqual(parsed.map(x=>x.field),['PRICE_USDT','CHANGE_24H_PCT','VOLUME_24H_USDT']);
 assert.equal(parsed[0].value,.01234);
 assert.equal(parsed[1].value,-1.2);
 assert.equal(extractHistoricalFacts({...e,text:e.text+' extra text'},a.asset).length,0);
 assert.equal(extractHistoricalFacts({...e,observed_at:at+1},a.asset).length,0);
 assert.equal(extractHistoricalFacts(e,'ETHUSDT').length,0);
 const row=complete(a);
 assert.equal(structuredResearchRecord(row).facts.length,3);
 assert.equal(structuredResearchRecord(row).agreement,null);
 assert.equal(summarizeResearchHistory([row,row],{now}).structuredFacts,3);
 const conflict={...row,criticEvidence:[{...e,text:e.text.replace('volume 10','volume 11')}]};
 assert.equal(structuredResearchRecord(conflict).facts.length,0);
 assert.equal(summarizeResearchHistory([conflict],{now}).structuredFacts,0);
});
test('depth facts enforce numeric bounds, source identity and timestamp',()=>{
 const a=run(),at=a.evidence[0].observed_at;
 const e={source_id:'okx:spot:depth:'+a.asset+':'+at,observed_at:at,
  text:'Asset '+a.asset+'; source okx:spot:depth public visible spot order book; observed '+
   new Date(at).toISOString()+'; best bid 100; best ask 101; spread 99.5 bps; visible depth imbalance -0.25. Visible levels are partial and can change rapidly; no inferred whale intent.'};
 assert.equal(extractHistoricalFacts(e,a.asset).length,4);
 assert.equal(extractHistoricalFacts({...e,text:e.text.replace('ask 101','ask 99')},a.asset).length,0);
 assert.equal(extractHistoricalFacts({...e,text:e.text.replace('-0.25','2')},a.asset).length,0);
 assert.equal(extractHistoricalFacts({...e,text:e.text.replace('spread 99.5','spread -1')},a.asset).length,0);
 assert.equal(structuredResearchRecord(a).unknown.length,1);
});


function claimFixture(){
 const a=run(),e=a.evidence[0],at=e.observed_at;
 e.source_id='binance:spot:24h:'+a.asset+':'+at;a.sourceIds=[e.source_id];
 e.text='Asset '+a.asset+'; source Binance public spot 24h ticker; observed '+
  new Date(at).toISOString()+'; last price 17.25 USDT; last 24h change -2%; last 24h quote volume 500 USDT. This is past-market context, not a prediction.';
 return a;
}
test('explicit source-bound lines are compared exactly and ambiguous duplicates stay unknown',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 const line=(field,value)=>'APEX_FACT|'+id+'|'+field+'|'+value;
 a.analystText=[line('PRICE_USDT',17.25),line('PRICE_USDT',17.25),
  line('CHANGE_24H_PCT',-2.1),line('VOLUME_24H_USDT',500),
  line('VOLUME_24H_USDT',520)].join('\n');
 const result=compareHistoricalClaims(a);
 assert.equal(result.checked,2);assert.equal(result.matches,1);
 assert.equal(result.differences,1);assert.equal(result.unresolved,1);
 assert.equal(result.results[2].state,'AMBIGUOUS_CLAIMS');
 const stats=summarizeResearchHistory([a],{now});
 assert.equal(stats.claimStudies,1);assert.equal(stats.claimsChecked,2);
 assert.equal(stats.claimsMatched,1);assert.equal(stats.accuracy,null);
});
test('prose, unknown fields, other-asset citations, future evidence, and source conflicts are not scored',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 assert.equal(compareHistoricalClaims(a).status,'NO_EXPLICIT_CLAIMS');
 const recent={...a.evidence[0],source_id:id.replace(/:\d+$/,':'+(a.startedAt+1000)),
  observed_at:a.startedAt+1000,text:a.evidence[0].text.replace(new Date(a.evidence[0].observed_at).toISOString(),new Date(a.startedAt+1000).toISOString())};
 a.analystText=['APEX_FACT|'+id.replace('BTCUSDT','ETHUSDT')+'|PRICE_USDT|17.25',
  'APEX_FACT|'+id+'|UNKNOWN_FIELD|17.25',
  'APEX_FACT|'+recent.source_id+'|PRICE_USDT|17.25',
  'APEX_FACT|'+id+'|PRICE_USDT|1e999'].join('\n');
 const b={...complete(a),criticEvidence:[recent]};
 assert.equal(compareHistoricalClaims(b).checked,0);
 assert.equal(compareHistoricalClaims(b).unresolved,4);
 const c=claimFixture();c.analystText='APEX_FACT|'+c.sourceIds[0]+'|PRICE_USDT|17.25';
 const bad={...complete(c),criticEvidence:[{...c.evidence[0],text:'Different snapshot'}]};
 assert.equal(compareHistoricalClaims(bad).results[0].state,'SOURCE_CONFLICT');
 assert.equal(compareHistoricalClaims(bad).checked,0);
});


test('GLM and Qwen independently transcribe the same historical observation',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 a.analystText='Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.25';
 const b={...complete(a),criticText:'Independent description.\nAPEX_FACT|'+id+'|PRICE_USDT|17.26'};
 const result=compareHistoricalClaims(b);
 assert.equal(result.checked,2);
 assert.equal(result.matches,1);
 assert.equal(result.differences,1);
 assert.equal(result.results[0].role,'GLM');
 assert.equal(result.results[1].role,'Qwen');
 assert.equal(result.interpretationAccuracy,null);
});


test('per-role factual transcription separates coverage, differences and missing claims',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 a.analystText='Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.25';
 const reviewed={...complete(a),criticText:'Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.26'};
 const plain=run('ETHUSDT',a.startedAt+1000);
 const stats=summarizeResearchHistory([reviewed,plain,reviewed],{now});
 const [g,q]=stats.models;
 assert.equal(g.responses,2);assert.equal(g.withClaims,1);
 assert.equal(g.withoutClaims,1);assert.equal(g.coveragePercent,50);
 assert.equal(g.checked,1);assert.equal(g.exactMatchPercent,100);
 assert.equal(q.responses,1);assert.equal(q.differences,1);
 assert.equal(q.exactMatchPercent,0);assert.equal(q.coveragePercent,100);
 assert.equal(stats.accuracy,null);
 const empty=summarizeResearchHistory([],{now}).models;
 assert.ok(empty.every(m=>m.coveragePercent===null&&m.exactMatchPercent===null));
 const missing=summarizeResearchHistory([plain],{now}).models;
 assert.equal(missing[0].exactMatchPercent,null);
 assert.equal(missing[1].responses,0);
});
test('conflicting snapshot identity across sessions excludes all matching claims from numeric comparison',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 a.analystText='Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.25';
 const b={...a,startedAt:a.startedAt+60000,
  evidence:[{...a.evidence[0],text:a.evidence[0].text.replace('17.25 USDT','17.26 USDT')}]};
 assert.deepEqual(findArchiveSourceConflicts([a,b]),[id]);
 const s=summarizeResearchHistory([a,b],{now});
 assert.deepEqual(s.archiveConflicts,[id]);
 assert.equal(s.claimsChecked,0);assert.equal(s.structuredFacts,0);
 assert.equal(s.models[0].unresolved,2);assert.equal(s.models[0].sourceIssues,2);
 assert.equal(s.models[0].exactMatchPercent,null);
});


test('available fact coverage counts omissions and separates repeated checks from unique facts',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 a.analystText='Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.25';
 const b={...a,startedAt:a.startedAt+60000,
  analystText:'Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.26'};
 const s=summarizeResearchHistory([a,b],{now});
 const g=s.models[0];
 assert.equal(g.usableFactOpportunities,6);
 assert.equal(g.coveredFactOpportunities,2);
 assert.equal(g.factCoveragePercent,33);
 assert.equal(g.uniqueChecked,1);
 assert.equal(g.uniqueMixed,1);
 assert.equal(g.uniqueExact,0);
 assert.equal(g.uniqueDifferent,0);
 assert.equal(s.models[1].factCoveragePercent,null);
});
test('paired comparison only compares checked same-source facts in one session',()=>{
 const a=claimFixture(),id=a.sourceIds[0];
 const line=(field,value)=>'APEX_FACT|'+id+'|'+field+'|'+value;
 a.analystText=[line('PRICE_USDT',17.25),line('CHANGE_24H_PCT',-2),line('VOLUME_24H_USDT',501)].join('\n');
 const b={...complete(a),criticText:[line('PRICE_USDT',17.25),line('CHANGE_24H_PCT',-3),line('VOLUME_24H_USDT',502)].join('\n')};
 const s=summarizeResearchHistory([b,b],{now});
 assert.deepEqual(s.pairStats,{compared:3,bothExact:1,oneExact:1,bothDifferent:1,distinctFacts:3});
 assert.equal(s.accuracy,null);assert.equal(s.agreement,null);
 const conflict={...b,criticEvidence:[{...a.evidence[0],text:'Changed observation'}]};
 const bad=summarizeResearchHistory([conflict],{now});
 assert.equal(bad.pairStats.compared,0);
 assert.equal(bad.models[0].factCoveragePercent,null);
});
test('empty archive and free prose never produce a fake factual accuracy score',()=>{
 const empty=summarizeResearchHistory([],{now});
 assert.equal(empty.models[0].factCoveragePercent,null);
 assert.equal(empty.pairStats.compared,0);
 const s=summarizeResearchHistory([claimFixture()],{now});
 assert.equal(s.models[0].factCoveragePercent,0);
 assert.equal(s.models[0].exactMatchPercent,null);
 assert.equal(s.models[0].uniqueChecked,0);
});

test('research visualization ratios distinguish no data from observed zero',async()=>{
 const {researchRatio}=await import('./apex-research-history.mjs');
 assert.equal(researchRatio(0,0),null);
 assert.equal(researchRatio(0,5),0);
 assert.equal(researchRatio(2,3),67);
 assert.equal(researchRatio(6,5),null);
 assert.equal(researchRatio(null,5),null);
});

test('knowledge catalogue merges identical observations, preserves dates and counts model checks separately',async()=>{
 const {buildResearchKnowledge}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 a.analystText='Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.25';
 const b={...a,startedAt:a.startedAt+60000};
 const v=buildResearchKnowledge([a,b],{now});
 assert.equal(v.total,1);assert.equal(v.uniqueFacts,3);assert.equal(v.matchedFacts,1);
 assert.equal(v.records[0].sessions,2);assert.equal(v.records[0].at,a.evidence[0].observed_at);
 assert.equal(v.records[0].facts[0].checks.GLM.matches,2);
 assert.equal(buildResearchKnowledge([a,b],{now,asset:'ETHUSDT'}).total,0);
 assert.equal(buildResearchKnowledge([a,b],{now,source:'okx:depth'}).total,0);
 assert.equal(buildResearchKnowledge([a,b],{now,source:'binance:24h'}).total,1);
});
test('knowledge quarantines repeated identity with changed contents, not newer timestamps',async()=>{
 const {buildResearchKnowledge}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 const bad={...a,startedAt:a.startedAt+60000,evidence:[{...a.evidence[0],text:a.evidence[0].text.replace('17.25','17.26')}]};
 const at=a.evidence[0].observed_at+120000;
 const next={...a,startedAt:a.startedAt+120000,evidence:[{...a.evidence[0],source_id:id.replace(/:\d+$/,':'+at),observed_at:at,text:a.evidence[0].text.replace(new Date(a.evidence[0].observed_at).toISOString(),new Date(at).toISOString()).replace('17.25','17.29')}]};
 next.sourceIds=next.evidence.map(e=>e.source_id);
 const v=buildResearchKnowledge([a,bad,next,run('ETHUSDT')],{now});
 assert.equal(v.total,3);assert.equal(v.parsed,1);assert.equal(v.unknown,1);assert.equal(v.quarantined,1);
 assert.equal(v.uniqueFacts,3);
 assert.equal(v.records.find(r=>r.id===id).at,null);
 assert.deepEqual(v.records.find(r=>r.id===id).facts,[]);
});

test('weekly quality distinguishes repeated and mixed observations and actual review week',async()=>{
 const {researchQualityTimeline}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 const start=Date.parse('2026-11-02T00:00:00Z');
 const at=start-1000;
 // Rebuild exact source identity with a timestamp at the preceding week.
 a.startedAt=at;
 const e=a.evidence[0],old=e.observed_at;
 e.observed_at=at-1000;e.source_id=id.replace(/:\d+$/,':'+e.observed_at);
 e.text=e.text.replace(new Date(old).toISOString(),new Date(e.observed_at).toISOString());
 a.sourceIds=[e.source_id];
 const line=value=>'Historical observation.\nAPEX_FACT|'+e.source_id+'|PRICE_USDT|'+value;
 a.analystText=line(17.25);
 const b={...a,startedAt:at-500,analystText:line(17.26)};
 const c={...complete(a),criticAt:start+1000,criticText:line(17.25)};
 const v=researchQualityTimeline([a,b,c,c],{now:start+86400000});
 assert.equal(v.length,2);
 assert.equal(v[0].partial,true);
 assert.equal(v[0].models[0].exactPercent,null);
 assert.equal(v[0].models[1].exactPercent,100);
 assert.equal(v[1].models[0].responses,2);
 assert.equal(v[1].models[0].unique,1);
 assert.equal(v[1].models[0].mixed,1);
 assert.equal(v[1].models[0].exactPercent,0);
 assert.equal(v[1].models[1].exactPercent,null);
 const conflict={...a,startedAt:start+120000,evidence:[{...e,text:e.text.replace('17.25 USDT','17.26 USDT')}]};
 const blocked=researchQualityTimeline([a,b,c,conflict],{now:start+86400000});
 assert.ok(blocked.every(w=>w.models.every(m=>m.unique===0)));
});
test('storage capacity uses UTF-8 bytes and existing portable limits',async()=>{
 const {researchStorageUsage}=await import('./apex-research-history.mjs');
 const rows=[{...run(),analystText:'Исторические сведения из источника.'}];
 const u=researchStorageUsage(rows);
 assert.equal(u.records,1);assert.equal(u.recordLimit,MAX_TRANSCRIPTS);
 assert.equal(u.byteLimit,2400000);
 assert.equal(u.bytes,new TextEncoder().encode(JSON.stringify({version:1,rows})).length);
 assert.ok(u.bytes>JSON.stringify({version:1,rows}).length);
});

test('expanded capacity accepts legacy and expanded archives without format migration',()=>{
 const many=Array.from({length:401},(_,i)=>run('BTCUSDT',now-86400000+i));
 const rows=mergeTranscripts([],many,now);
 assert.equal(rows.length,400);
 assert.equal(validateTranscriptArchive({version:1,rows:rows.slice(0,200)},now).rows.length,200);
 assert.equal(validateTranscriptArchive({version:1,rows},now).rows.length,400);
});
test('full archive and storage failure preserve prior records and bytes',async()=>{
 const {appendResearchArchive}=await import('./apex-research-history.mjs');
 const previous=mergeTranscripts([],Array.from({length:400},(_,i)=>run('BTCUSDT',now-86400000+i)),now);
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(writeTranscripts(store,previous),true);
 const original=map.get(HISTORY_KEY);
 const full=appendResearchArchive(store,previous,[run('ETHUSDT')],now);
 assert.equal(full.ok,false);assert.equal(full.reason,'ARCHIVE_CAPACITY');
 assert.equal(full.rows,previous);assert.equal(map.get(HISTORY_KEY),original);
 const failure=appendResearchArchive({setItem(){throw Error('quota')}},previous.slice(0,1),[run('ETHUSDT')],now);
 assert.equal(failure.ok,false);assert.equal(failure.reason,'LOCAL_STORAGE');
 assert.equal(failure.rows.length,1);
 const upgraded=appendResearchArchive(store,previous,[complete(previous[0])],now);
 assert.equal(upgraded.ok,true);assert.equal(upgraded.rows.length,400);
 assert.equal(upgraded.rows[0].stage,'COMPLETE');
});

test('source-field audit counts distinct facts, mixed repeats, and missing claims separately',async()=>{
 const {buildResearchKnowledge,researchDiscrepancyPatterns}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 const line=value=>'Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|'+value;
 a.analystText=line(17.25);
 const first={...complete(a),criticText:line(17.25)};
 const repeat={...a,startedAt:a.startedAt+60000,analystText:line(17.26)};
 const patterns=researchDiscrepancyPatterns(buildResearchKnowledge([first,repeat,first],{now}));
 const p=patterns.find(x=>x.field==='PRICE_USDT');
 assert.equal(p.available,1);assert.equal(p.models[0].checked,1);
 assert.equal(p.models[0].attempts,2);assert.equal(p.models[0].mixed,1);
 assert.equal(p.models[0].exactPercent,0);assert.equal(p.models[1].exactPercent,100);
 assert.equal(p.paired,1);assert.equal(p.pairedMixed,1);assert.equal(p.bothExact,0);
 const missing=patterns.find(x=>x.field==='VOLUME_24H_USDT');
 assert.equal(missing.models[0].unchecked,1);
 assert.equal(missing.models[0].exactPercent,null);assert.equal(missing.paired,0);
 assert.deepEqual(researchDiscrepancyPatterns(buildResearchKnowledge([],{now})),[]);
 const conflict={...a,startedAt:a.startedAt+120000,evidence:[{...a.evidence[0],text:a.evidence[0].text.replace('17.25 USDT','17.26 USDT')}]};
 assert.deepEqual(researchDiscrepancyPatterns(buildResearchKnowledge([first,conflict],{now})),[]);
});

test('feedback engine requires distinct observations and separates missing coverage from errors',async()=>{
 const {buildResearchFeedback,buildResearchKnowledge}=await import('./apex-research-history.mjs');
 const a=claimFixture();
 const single={...a,analystText:'Historical observation.\nAPEX_FACT|'+a.sourceIds[0]+'|PRICE_USDT|17.26'};
 const repeats=Array.from({length:10},(_,i)=>({...single,startedAt:a.startedAt+i*1000}));
 assert.equal(buildResearchFeedback(buildResearchKnowledge(repeats,{now})).items.length,0);
 const rows=Array.from({length:10},(_,i)=>{
  const at=a.evidence[0].observed_at+i*60000;
  const e={...a.evidence[0],source_id:a.sourceIds[0].replace(/:\d+$/,':'+at),observed_at:at,
   text:a.evidence[0].text.replace(new Date(a.evidence[0].observed_at).toISOString(),new Date(at).toISOString())};
  return {...a,startedAt:at+1000,evidence:[e],sourceIds:[e.source_id],
   analystText:i<5?'Historical observation.\nAPEX_FACT|'+e.source_id+'|PRICE_USDT|'+(i<3?'17.26':'17.25'):'Historical source, no explicit claim.'};
 });
 const r=buildResearchFeedback(buildResearchKnowledge(rows,{now}));
 const item=r.items.find(x=>x.kind==='REPEATED_NUMERIC_DIFFERENCE');
 assert.equal(item.role,'GLM');assert.equal(item.affected,3);assert.equal(item.total,5);
 assert.equal(item.percent,60);assert.equal(item.evidenceIds.length,3);
 assert.ok(r.items.some(x=>x.kind==='LOW_EXPLICIT_COVERAGE'&&x.role==='Qwen'));
 assert.equal(r.automaticModelCalls,0);
 const bad={...rows[0],startedAt:rows[0].startedAt+1000,evidence:[{...rows[0].evidence[0],text:'Conflicting contents'}]};
 const conflicted=buildResearchFeedback(buildResearchKnowledge([...rows,bad],{now}));
 assert.equal(conflicted.items[0].kind,'SOURCE_ID_CONFLICT');
 assert.ok(!conflicted.items.some(x=>x.kind==='REPEATED_NUMERIC_DIFFERENCE'));
 assert.equal(buildResearchFeedback(buildResearchKnowledge([],{now})).total,0);
});

test('manual feedback journal persists a baseline, avoids duplicate marks and never claims resolution',async()=>{
 const {recordFeedbackReview,readFeedbackJournal,compareFeedbackReview,FEEDBACK_JOURNAL_KEY}=await import('./apex-research-history.mjs');
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const item={id:JSON.stringify(['REPEATED_NUMERIC_DIFFERENCE','binance:24h','PRICE_USDT','GLM']),affected:3,total:5,evidenceIds:['binance:spot:24h:BTCUSDT:1','binance:spot:24h:BTCUSDT:2']};
 assert.deepEqual(readFeedbackJournal(store),[]);
 const first=recordFeedbackReview(store,item,'REQUIRES_REVIEW',now);
 assert.equal(first.ok,true);
 assert.equal(recordFeedbackReview(store,item,'REQUIRES_REVIEW',now+1).duplicate,true);
 assert.equal(readFeedbackJournal(store).length,1);
 assert.equal(compareFeedbackReview(first.reviews[0],{items:[item]}).state,'UNCHANGED');
 const changed=compareFeedbackReview(first.reviews[0],{items:[{...item,total:8}]});
 assert.equal(changed.state,'CHANGED');assert.equal(changed.before,60);assert.equal(changed.after,38);
 const absent=compareFeedbackReview(first.reviews[0],{items:[]});
 assert.equal(absent.state,'NOT_CURRENTLY_FLAGGED');assert.equal(absent.after,null);
 assert.equal(recordFeedbackReview(store,item,'ROUNDING_OR_FORMAT',now+2).ok,true);
 assert.equal(readFeedbackJournal(store).length,2);
 const filled=Array.from({length:100},(_,i)=>({...first.reviews[0],at:now-i}));
 map.set(FEEDBACK_JOURNAL_KEY,JSON.stringify({version:1,reviews:filled}));
 const raw=map.get(FEEDBACK_JOURNAL_KEY);
 assert.equal(recordFeedbackReview(store,item,'INSUFFICIENT_EVIDENCE',now+3).reason,'JOURNAL_FULL');
 assert.equal(map.get(FEEDBACK_JOURNAL_KEY),raw);
 map.set(FEEDBACK_JOURNAL_KEY,'broken');
 assert.equal(recordFeedbackReview(store,item,'INSUFFICIENT_EVIDENCE',now+4).ok,false);
 assert.equal(map.get(FEEDBACK_JOURNAL_KEY),'broken');
});

test('portable feedback merge preserves old notes, rejects conflicts and is idempotent',async()=>{
 const {mergeFeedbackArchives,validateFeedbackArchive}=await import('./apex-research-history.mjs');
 const row={taskId:JSON.stringify(['SOURCE_ID_CONFLICT','binance:24h',null,null]),at:now,outcome:'REQUIRES_REVIEW',affected:1,total:2,evidenceIds:['binance:spot:24h:BTCUSDT:1']};
 const next={...row,at:now+1,outcome:'INSUFFICIENT_EVIDENCE'};
 const archive={version:1,reviews:[next,row]};
 assert.ok(validateFeedbackArchive(archive));
 assert.equal(validateFeedbackArchive({version:1,reviews:[row,row]}),null);
 const merged=mergeFeedbackArchives([row],archive);
 assert.equal(merged.ok,true);
 assert.equal(merged.archive.reviews.length,2);
 assert.deepEqual(mergeFeedbackArchives(merged.archive.reviews,archive).archive,merged.archive);
 assert.equal(mergeFeedbackArchives([row],{version:1,reviews:[{...row,outcome:'ROUNDING_OR_FORMAT'}]}).reason,'FEEDBACK_CONFLICT');
 assert.equal(mergeFeedbackArchives(Array.from({length:100},(_,i)=>({...row,at:now-i})),{version:1,reviews:[next]}).reason,'FEEDBACK_CAPACITY');
});

test('research lab compares the same unique facts without changing strict matching',async()=>{
 const {runResearchLab}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 const line=value=>'Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|'+value;
 a.analystText=line(17.25);
 const near={...a,startedAt:a.startedAt+1000,analystText:line(17.250001)};
 const far={...a,startedAt:a.startedAt+2000,analystText:line(17.26)};
 const r=runResearchLab([a,near,near],{now});
 assert.equal(r.models[0].total,1);
 assert.equal(r.models[0].exact,0);
 assert.equal(r.models[0].toleranceOnly,1);
 assert.equal(r.models[0].tolerancePercent,100);
 assert.equal(r.models[1].exactPercent,null);
 assert.equal(r.checkedClaims,2);
 assert.equal(r.productionRuleChanged,false);
 assert.equal(compareHistoricalClaims(near).differences,1);
 assert.equal(runResearchLab([a,near,far],{now}).models[0].outside,1);
 const conflict={...a,startedAt:a.startedAt+3000,evidence:[{...a.evidence[0],text:'Conflicting contents'}]};
 assert.equal(runResearchLab([a,conflict],{now}).models[0].total,0);
 assert.equal(runResearchLab([a],{now,asset:'ETHUSDT'}).models[0].total,0);
 assert.equal(runResearchLab([],{now}).checkedClaims,0);
});

test('research lab source partition is stable and all cohort counts reconcile',async()=>{
 const {runResearchLab,researchLabPartition}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 a.analystText='Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|17.25';
 const b={...complete(a),criticText:a.analystText};
 const result=runResearchLab([a,b,b],{now});
 const partition=researchLabPartition(id);
 assert.equal(result.cohorts.find(c=>c.partition===partition).models[0].total,1);
 assert.equal(result.cohorts.find(c=>c.partition===partition).models[1].total,1);
 assert.equal(result.cohorts.find(c=>c.partition!==partition).models[0].total,0);
 assert.equal(result.cohorts.find(c=>c.partition!==partition).models[1].exactPercent,null);
 assert.equal(new Set(Array.from({length:100},(_,i)=>researchLabPartition('source:'+i))).size,2);
});
test('lab journal verifies reproducibility per digest, preserves earlier entries',async()=>{
 const {runResearchLab,researchLabDigest,recordLabExperiment,readLabJournal}=await import('./apex-research-history.mjs');
 const {webcrypto}=await import('node:crypto');
 const a=claimFixture(),result=runResearchLab([a],{now});
 const digest=await researchLabDigest([a],'',now,webcrypto);
 assert.match(digest,/^[a-f0-9]{64}$/);
 assert.equal(await researchLabDigest([a,a],'',now,webcrypto),digest);
 assert.notEqual(await researchLabDigest([{...a,analystText:'Different historical observation.'}],'',now,webcrypto),digest);
 const data=new Map(),store={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const entry={at:now,digest,result};
 assert.equal(recordLabExperiment(store,entry).ok,true);
 assert.equal(recordLabExperiment(store,{...entry,at:now+1}).repeated,true);
 assert.equal(readLabJournal(store).length,1);
 assert.equal(recordLabExperiment(store,{...entry,result:{...result,unresolved:result.unresolved+1}}).reason,'REPRODUCIBILITY_MISMATCH');
 assert.equal(readLabJournal(store).length,1);
});

test('hypothesis gates never automatically adopt a rule',async()=>{
 const {assessLabHypothesis}=await import('./apex-research-history.mjs');
 const a={sources:10,affectedSources:2},b={sources:5,affectedSources:2};
 assert.equal(assessLabHypothesis(a,b),'MANUAL_REVIEW_ONLY');
 assert.equal(assessLabHypothesis(a,{...b,sources:4}),'INSUFFICIENT_SAMPLE');
 assert.equal(assessLabHypothesis({...a,affectedSources:0},{...b,affectedSources:0}),'NO_OBSERVED_EFFECT');
 assert.equal(assessLabHypothesis(a,{...b,affectedSources:1}),'DEFER_REVIEW');
});
test('fixed sensitivity hypotheses use identical facts and the worst repeated difference',async()=>{
 const {compareLabHypotheses}=await import('./apex-research-history.mjs');
 const a=claimFixture(),id=a.sourceIds[0];
 const line=value=>'Historical observation.\nAPEX_FACT|'+id+'|PRICE_USDT|'+value;
 a.analystText=line(17.250005);
 const r=compareLabHypotheses([a,a],{now});
 const sum=(hyp,key)=>hyp.models[0].cohorts.reduce((n,c)=>n+c[key],0);
 assert.equal(sum(r.hypotheses[0],'total'),1);
 assert.equal(sum(r.hypotheses[0],'affected'),0);
 assert.equal(sum(r.hypotheses[1],'affected'),1);
 assert.equal(r.hypotheses[1].models[0].decision,'INSUFFICIENT_SAMPLE');
 const far={...a,startedAt:a.startedAt+1000,analystText:line(17.26)};
 const repeat=compareLabHypotheses([a,far],{now});
 assert.equal(sum(repeat.hypotheses[1],'total'),1);
 assert.equal(sum(repeat.hypotheses[1],'affected'),0);
 assert.equal(sum(repeat.hypotheses[1],'outside'),1);
 assert.equal(repeat.productionRuleChanged,false);
 assert.equal(repeat.automaticModelCalls,0);
});

test('knowledge registry separates implementation, review status and activation',async()=>{
 const {knowledgeRuleRegistry,recordKnowledgeReview,readKnowledgeReviews,KNOWLEDGE_REVIEW_KEY}=await import('./apex-research-history.mjs');
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const digest='a'.repeat(64),row={ruleId:'REL_1E7',ruleVersion:1,role:'GLM',digest,at:now,outcome:'NEEDS_MORE_EVIDENCE'};
 assert.equal(knowledgeRuleRegistry([]).rules.length,7);
 assert.equal(knowledgeRuleRegistry([]).automaticActivation,false);
 assert.equal(recordKnowledgeReview(store,{...row,ruleId:'EXACT_NUMERIC'}).ok,false);
 assert.equal(recordKnowledgeReview(store,row).ok,true);
 assert.equal(recordKnowledgeReview(store,{...row,at:now+1}).repeated,true);
 const reviews=readKnowledgeReviews(store);
 const status=(d,t)=>knowledgeRuleRegistry(reviews,{digest:d,now:t}).rules.find(r=>r.id===row.ruleId&&r.role===row.role).status;
 assert.equal(status(digest,now),'REVIEW_RECORDED');
 assert.equal(status(null,now),'INPUT_NOT_VERIFIED');
 assert.equal(status('b'.repeat(64),now),'INPUT_NOT_VERIFIED');
 assert.equal(status(digest,now+30*86400000),'REVIEW_STALE');
 assert.equal(readKnowledgeReviews(store).length,1);
 map.set(KNOWLEDGE_REVIEW_KEY,'broken');
 assert.equal(recordKnowledgeReview(store,row).ok,false);
 assert.equal(map.get(KNOWLEDGE_REVIEW_KEY),'broken');
});
