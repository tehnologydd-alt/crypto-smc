import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTranscript,mergeTranscripts,batchTranscripts,readTranscripts,writeTranscripts,HISTORY_KEY,MAX_TRANSCRIPTS,validateTranscriptArchive,summarizeResearchHistory,auditResearchEvidence,extractHistoricalFacts,structuredResearchRecord,compareHistoricalClaims} from './apex-research-history.mjs';
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
 const many=Array.from({length:250},(_,i)=>run('BTCUSDT',now-86400000+i));
 assert.equal(mergeTranscripts([],many,now).length,MAX_TRANSCRIPTS);
 map.set(HISTORY_KEY,'broken');
 assert.deepEqual(readTranscripts(store,now),[]);
});

test('portable archive validation rejects duplicate, malformed and over-capacity records',()=>{
 const a=normalizeTranscript(complete(run()),now);
 assert.equal(validateTranscriptArchive({version:1,rows:[a]},now).rows.length,1);
 assert.equal(validateTranscriptArchive({version:1,rows:[a,a]},now),null);
 assert.equal(validateTranscriptArchive({version:1,rows:[{...a,asset:'ETHUSDT'}]},now),null);
 assert.equal(validateTranscriptArchive({version:1,rows:Array(201).fill(a)},now),null);
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
