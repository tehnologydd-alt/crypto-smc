/**
 * Local research transcript archive. Independent of the 24-task Director queue.
 * Historical snapshots are observations, not verified model conclusions.
 * No inference, no network, no credentials. Bounded by records AND bytes.
 */
export const HISTORY_KEY='apex.research.transcripts.v1';
export const MAX_TRANSCRIPTS=400;
const MAX_BYTES=2400000, SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
const time=x=>Number.isSafeInteger(x)&&x>0;
const text=x=>typeof x==='string'&&x.trim().length>=15&&x.length<=2400;
function snapshots(value,asset){
 if(!Array.isArray(value)||value.length<1||value.length>5)return null;
 const seen=new Set(),out=[];
 for(const e of value){
  if(typeof e?.source_id!=='string'||e.source_id.length>100||
   !e.source_id.includes(':'+asset+':')||seen.has(e.source_id)||
   !time(e.observed_at)||typeof e.text!=='string'||!e.text.trim()||
   e.text.length>1500)return null;
  seen.add(e.source_id);
  out.push({source_id:e.source_id,observed_at:e.observed_at,text:e.text});
 }
 return out;
}
export function normalizeTranscript(s,now=Date.now()){
 if(!s||s.version!==1||!SYMBOL.test(s.asset||'')||!time(s.startedAt)||
  s.startedAt>now+120000||!['ANALYST_READY','COMPLETE'].includes(s.stage)||
  !text(s.analystText))return null;
 const evidence=snapshots(s.evidence,s.asset);
 if(!evidence||evidence.some(e=>e.observed_at>s.startedAt+120000)||
  JSON.stringify(s.sourceIds)!==JSON.stringify(evidence.map(e=>e.source_id)))return null;
 const row={version:1,id:s.asset+':'+s.startedAt,asset:s.asset,
  startedAt:s.startedAt,stage:s.stage,evidence,
  sourceIds:evidence.map(e=>e.source_id),analystText:s.analystText};
 if(s.stage==='COMPLETE'){
  const recent=snapshots(s.criticEvidence,s.asset);
  if(!recent||!text(s.criticText)||!time(s.criticAt)||
   s.criticAt<s.startedAt||s.criticAt>now+120000||
   recent.some(e=>e.observed_at>s.criticAt+120000))return null;
  Object.assign(row,{criticAt:s.criticAt,criticText:s.criticText,criticEvidence:recent});
 }
 return row;
}
export function batchTranscripts(batch){
 if(batch?.version!==1||!Array.isArray(batch.items)||
    batch.items.length<2||batch.items.length>3||
    new Set(batch.items.map(x=>x?.asset)).size!==batch.items.length)return [];
 return batch.items.map(x=>({...x,version:1,stage:batch.stage,startedAt:batch.startedAt}));
}
export function mergeTranscripts(previous,incoming,now=Date.now()){
 const byId=new Map();
 for(const raw of [...previous,...incoming]){
  const next=normalizeTranscript(raw,now);
  if(!next)continue;
  const old=byId.get(next.id);
  if(!old){byId.set(next.id,next);continue;}
  // Same run must retain the same analyst and input snapshots.
  if(old.analystText!==next.analystText||
     JSON.stringify(old.evidence)!==JSON.stringify(next.evidence))continue;
  if(old.stage==='COMPLETE')continue;
  if(next.stage==='COMPLETE')byId.set(next.id,next);
 }
 const rows=[...byId.values()].sort((a,b)=>b.startedAt-a.startedAt||a.asset.localeCompare(b.asset));
 const out=[];let bytes=30;
 for(const row of rows){
  const size=new TextEncoder().encode(JSON.stringify(row)).length+1;
  if(out.length>=MAX_TRANSCRIPTS||bytes+size>MAX_BYTES)break;
  out.push(row);bytes+=size;
 }
 return out;
}
export function readTranscripts(store,now=Date.now()){
 try{
  const raw=store?.getItem(HISTORY_KEY);
  if(!raw)return [];
  if(new TextEncoder().encode(raw).length>MAX_BYTES)return [];
  const parsed=JSON.parse(raw);
  if(parsed.version!==1||!Array.isArray(parsed.rows)||parsed.rows.length>MAX_TRANSCRIPTS)return [];
  return mergeTranscripts([],parsed.rows,now);
 }catch{return [];}
}
export function writeTranscripts(store,rows){
 try{
  const data=JSON.stringify({version:1,rows});
  if(!store||new TextEncoder().encode(data).length>MAX_BYTES)return false;
  store.setItem(HISTORY_KEY,data);
  return store.getItem(HISTORY_KEY)===data;
 }catch{return false;}
}
/** Import only historical records, without restoring a live model session. */
/** Do not evict archived history or publish an uncommitted candidate. */
export function appendResearchArchive(store,previous,incoming,now=Date.now()){
 const added=incoming.map(x=>normalizeTranscript(x,now));
 if(added.some(x=>!x))return {ok:false,reason:'INVALID_TRANSCRIPT',rows:previous};
 const merged=mergeTranscripts(previous,added,now);
 const expected=new Set([...previous,...added].map(x=>x.id)).size;
 if(merged.length<expected)return {ok:false,reason:'ARCHIVE_CAPACITY',rows:previous};
 for(const candidate of added){
  const retained=merged.find(x=>x.id===candidate.id);
  if(!retained||retained.analystText!==candidate.analystText||
   JSON.stringify(retained.evidence)!==JSON.stringify(candidate.evidence)||
   candidate.stage==='COMPLETE'&&(retained.stage!=='COMPLETE'||
    retained.criticAt!==candidate.criticAt||retained.criticText!==candidate.criticText||
    JSON.stringify(retained.criticEvidence)!==JSON.stringify(candidate.criticEvidence)))
   return {ok:false,reason:'ARCHIVE_CONFLICT',rows:previous};
 }
 if(JSON.stringify(previous)===JSON.stringify(merged))return {ok:true,rows:previous};
 if(!writeTranscripts(store,merged))return {ok:false,reason:'LOCAL_STORAGE',rows:previous};
 return {ok:true,rows:merged};
}
export function validateTranscriptArchive(archive,now=Date.now()){
 if(archive?.version!==1||!Array.isArray(archive.rows)||
    archive.rows.length>MAX_TRANSCRIPTS)return null;
 try{if(new TextEncoder().encode(JSON.stringify({version:archive.version,rows:archive.rows})).length>MAX_BYTES)return null;}catch{return null;}
 const rows=archive.rows.map(x=>normalizeTranscript(x,now));
 if(rows.some(x=>!x)||new Set(rows.map(x=>x.id)).size!==rows.length)return null;
 return {version:1,rows};
}
/** Descriptive archive metrics only. Completion is not agreement, correctness
 * or a forecast. Different snapshots from one exchange are not independent
 * sources. Repeated evidence IDs are counted once across the selection.
 */
/** Compare source identity and chronology, not semantic agreement or forecasts. */
export function auditResearchEvidence(row){
 const original=Array.isArray(row?.evidence)?row.evidence:[];
 const recent=Array.isArray(row?.criticEvidence)?row.criticEvidence:[];
 const index=new Map(original.map(e=>[e.source_id,e]));
 const conflicts=[],shared=[],later=[],other=[];
 for(const e of recent){
  const old=index.get(e.source_id);
  if(old){
   if(old.observed_at!==e.observed_at||old.text!==e.text)
    conflicts.push(e.source_id);
   else shared.push(e.source_id);
  }else if(e.observed_at>row.startedAt)later.push(e.source_id);
  else other.push(e.source_id);
 }
 return {conflicts,shared,later,other,
  status:conflicts.length?'SOURCE_CONFLICT':
   row?.stage==='COMPLETE'?'COMPARED':'AWAITING_REVIEW',
  semanticAgreement:null,conclusionAccuracy:null};
}
/**
 * Reconstruct typed historical facts solely from the exact evidence format
 * emitted by the local snapshot builder. Unknown formats remain unknown.
 * Nothing here infers model agreement, predictions or validity of a venue.
 */
export function extractHistoricalFacts(e,asset){
 if(!e||!SYMBOL.test(asset||'')||!time(e.observed_at)||
    typeof e.source_id!=='string'||typeof e.text!=='string')return [];
 const when=new Date(e.observed_at);
 if(!Number.isFinite(when.getTime()))return [];
 const stamp=when.toISOString(),n='([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)';
 const make=(fields,values)=>fields.map((field,i)=>({
  field,value:values[i],sourceId:e.source_id,observedAt:e.observed_at
 }));
 if(e.source_id==='binance:spot:24h:'+asset+':'+e.observed_at){
  const prefix='Asset '+asset+'; source Binance public spot 24h ticker; observed '+stamp+
   '; last price ';
  if(!e.text.startsWith(prefix))return [];
  const body=e.text.slice(prefix.length);
  const m=new RegExp('^'+n+' USDT; last 24h change '+n+'%; last 24h quote volume '+n+
   ' USDT\\. This is past-market context, not a prediction\\.$').exec(body);
  if(!m)return [];
  const v=m.slice(1).map(Number);
  if(!v.every(Number.isFinite)||v[0]<=0||v[2]<0)return [];
  return make(['PRICE_USDT','CHANGE_24H_PCT','VOLUME_24H_USDT'],v);
 }
 const m=/^(binance|okx|bybit):spot:depth:([A-Z0-9]{2,16}USDT):(\d+)$/.exec(e.source_id);
 if(!m||m[2]!==asset||m[3]!==String(e.observed_at))return [];
 const prefix='Asset '+asset+'; source '+m[1]+':spot:depth public visible spot order book; observed '+stamp+
  '; best bid ';
 if(!e.text.startsWith(prefix))return [];
 const tail=e.text.slice(prefix.length);
 const match=new RegExp('^'+n+'; best ask '+n+'; spread '+n+' bps; visible depth imbalance '+n+
  '\\. Visible levels are partial and can change rapidly; no inferred whale intent\\.$').exec(tail);
 if(!match)return [];
 const v=match.slice(1).map(Number);
 if(!v.every(Number.isFinite)||v[0]<=0||v[1]<=0||v[0]>v[1]||v[2]<0||Math.abs(v[3])>1)return [];
 return make(['BEST_BID','BEST_ASK','SPREAD_BPS','VISIBLE_DEPTH_IMBALANCE'],v);
}
export function structuredResearchRecord(row){
 const audit=auditResearchEvidence(row);
 const seen=new Set(),facts=[],unknown=[];
 const blocked=new Set(audit.conflicts);
 for(const e of [...(row.evidence||[]),...(row.criticEvidence||[])]){
  if(seen.has(e.source_id))continue;
  seen.add(e.source_id);
  if(blocked.has(e.source_id))continue;
  const list=extractHistoricalFacts(e,row.asset);
  if(list.length)facts.push(...list);else unknown.push(e.source_id);
 }
 return {facts,unknown,conflicts:audit.conflicts,
  analyst:{state:'UNVERIFIED_MODEL_TEXT'},
  critic:{state:row.stage==='COMPLETE'?'UNVERIFIED_MODEL_TEXT':'NOT_REVIEWED'},
  agreement:null,accuracy:null};
}
/**
 * Optional explicit historical factual assertion protocol, version 1.
 * One complete line: APEX_FACT|source_id|field|number
 * Only exact source-bound literals count. No extraction from prose or causal
 * claims, and no interpretation of forecasts. Existing free-text archives
 * stay unassessed. This is a local comparator, not an additional AI call.
 */
export function compareHistoricalClaims(row,{archiveConflicts=[]}={}){
 const structured=structuredResearchRecord(row);
 const blocked=new Set([...structured.conflicts,...archiveConflicts]);
 const results=[];
 for(const [role,text,available] of [
  ['GLM',row.analystText,row.evidence||[]],
  ['Qwen',row.stage==='COMPLETE'?row.criticText:'',[
    ...(row.evidence||[]),...(row.criticEvidence||[])]]
 ]){
  if(typeof text!=='string')continue;
  const allowed=new Set(available.map(e=>e.source_id));
  const seen=new Map();
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();
   if(!line.startsWith('APEX_FACT|'))continue;
   const match=/^APEX_FACT\|([a-zA-Z0-9_.:-]{4,100})\|([A-Z0-9_]{1,40})\|([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(line);
   if(!match||match[3].length>40||!Number.isFinite(Number(match[3]))){
    results.push({role,state:'INVALID_FORMAT'});continue;
   }
   const [,sourceId,field,literal]=match,claimed=Number(literal);
   const key=JSON.stringify([sourceId,field]);
   if(seen.has(key)){
    const previous=seen.get(key);
    if(previous.claimed!==claimed)previous.state='AMBIGUOUS_CLAIMS';
    continue;
   }
   const result={role,sourceId,field,claimed,state:'UNKNOWN_SOURCE_OR_FIELD'};
   seen.set(key,result);results.push(result);
   if(!allowed.has(sourceId))continue;
   if(blocked.has(sourceId)){result.state='SOURCE_CONFLICT';continue;}
   const fact=structured.facts.find(f=>f.sourceId===sourceId&&f.field===field);
   if(!fact)continue;
   result.observed=fact.value;
   result.state=claimed===fact.value?'EXACT_MATCH':'NUMERIC_DIFFERENCE';
  }
 }
 const checked=results.filter(r=>['EXACT_MATCH','NUMERIC_DIFFERENCE'].includes(r.state));
 return {results,checked:checked.length,
  matches:checked.filter(r=>r.state==='EXACT_MATCH').length,
  differences:checked.filter(r=>r.state==='NUMERIC_DIFFERENCE').length,
  unresolved:results.length-checked.length,
  status:results.length?'EXPLICIT_LINES_FOUND':'NO_EXPLICIT_CLAIMS',
  interpretationAccuracy:null};
}
/** Spot conflicting copies of the same observation across archived sessions.
 * Exact identity only; do not compare values from distinct timestamps. */
export function findArchiveSourceConflicts(rows){
 const seen=new Map(),conflicts=new Set();
 for(const row of rows){
  for(const e of [...row.evidence,...(row.criticEvidence||[])]){
   const old=seen.get(e.source_id);
   if(old&&(old.observed_at!==e.observed_at||old.text!==e.text))
    conflicts.add(e.source_id);
   else if(!old)seen.set(e.source_id,e);
  }
 }
 return [...conflicts].sort();
}
/**
 * Derived, read-only catalogue of unique historical observations.
 * One ID with different content is quarantined across the entire archive.
 * A new timestamp is a different observation, never a contradiction by itself.
 * Model transcription is not independent verification of the source.
 */
export function buildResearchKnowledge(rawRows,{asset='',source='',now=Date.now()}={}){
 const rows=mergeTranscripts([],Array.isArray(rawRows)?rawRows:[],now);
 const conflicts=new Set(findArchiveSourceConflicts(rows));
 const observations=new Map();
 const claimsByFact=new Map();
 const key=(id,field)=>JSON.stringify([id,field]);
 for(const row of rows){
  if(asset&&row.asset!==asset)continue;
  for(const e of [...row.evidence,...(row.criticEvidence||[])]){
   const group=/^(binance|okx|bybit):spot:(24h|depth):/.exec(e.source_id);
   const channel=group?group[1]+':'+group[2]:'unknown';
   if(source&&channel!==source)continue;
   const old=observations.get(e.source_id);
   if(old){old.sessions.add(row.id);continue;}
   const facts=conflicts.has(e.source_id)?[]:extractHistoricalFacts(e,row.asset);
   observations.set(e.source_id,{id:e.source_id,asset:row.asset,source:channel,
    at:e.observed_at,sessions:new Set([row.id]),facts,
    state:conflicts.has(e.source_id)?'CONFLICT':facts.length?'PARSED':'UNKNOWN_FORMAT'});
  }
  for(const c of compareHistoricalClaims(row,{archiveConflicts:[...conflicts]}).results){
   if(!['EXACT_MATCH','NUMERIC_DIFFERENCE'].includes(c.state))continue;
   const k=key(c.sourceId,c.field);
   const counts=claimsByFact.get(k)||{GLM:{matches:0,differences:0},Qwen:{matches:0,differences:0}};
   counts[c.role][c.state==='EXACT_MATCH'?'matches':'differences']++;
   claimsByFact.set(k,counts);
  }
 }
 const groups=new Map(),records=[];
 let parsed=0,unknown=0,quarantined=0,uniqueFacts=0,matchedFacts=0;
 for(const o of observations.values()){
  const group=groups.get(o.source)||{source:o.source,total:0,parsed:0,unknown:0,conflicts:0,facts:0};
  group.total++;
  if(o.state==='CONFLICT'){quarantined++;group.conflicts++;}
  else if(o.state==='UNKNOWN_FORMAT'){unknown++;group.unknown++;}
  else{parsed++;group.parsed++;}
  const facts=o.facts.map(f=>{
   const checks=claimsByFact.get(key(f.sourceId,f.field))||null;
   if(checks&&(checks.GLM.matches||checks.Qwen.matches))matchedFacts++;
   return {field:f.field,value:f.value,checks};
  });
  uniqueFacts+=facts.length;group.facts+=facts.length;
  groups.set(o.source,group);
  records.push({id:o.id,asset:o.asset,source:o.source,at:o.state==='CONFLICT'?null:o.at,
   sessions:o.sessions.size,state:o.state,facts});
 }
 records.sort((a,b)=>(b.at||0)-(a.at||0)||a.id.localeCompare(b.id));
 return {total:records.length,parsed,unknown,quarantined,uniqueFacts,matchedFacts,
  groups:[...groups.values()].sort((a,b)=>a.source.localeCompare(b.source)),records};
}
/**
 * Weekly UTC cohorts of archived numeric transcriptions. A fact is counted
 * once per model/week; mixed observations are not credited as exact.
 * Conflicts are detected before time grouping. No predictions or inference.
 */
export function researchQualityTimeline(rawRows,{asset='',now=Date.now()}={}){
 const rows=mergeTranscripts([],Array.isArray(rawRows)?rawRows:[],now);
 const conflicts=findArchiveSourceConflicts(rows);
 const weeks=new Map(),day=86400000;
 const weekStart=t=>{
  const d=new Date(t),mid=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  return mid-((d.getUTCDay()+6)%7)*day;
 };
 for(const row of rows){
  if(asset&&row.asset!==asset)continue;
  const claims=compareHistoricalClaims(row,{archiveConflicts:conflicts}).results;
  for(const [role,at] of [['GLM',row.startedAt],['Qwen',row.stage==='COMPLETE'?row.criticAt:null]]){
   if(at===null)continue;
   const start=weekStart(at);
   if(!weeks.has(start))weeks.set(start,{start,end:start+7*day,models:new Map()});
   const week=weeks.get(start);
   if(!week.models.has(role))week.models.set(role,{responses:0,withClaims:0,unresolved:0,checked:new Map()});
   const m=week.models.get(role);m.responses++;
   const selected=claims.filter(c=>c.role===role);
   if(selected.length)m.withClaims++;
   for(const c of selected){
    if(!['EXACT_MATCH','NUMERIC_DIFFERENCE'].includes(c.state)){m.unresolved++;continue;}
    const key=JSON.stringify([c.sourceId,c.field]);
    const states=m.checked.get(key)||new Set();
    states.add(c.state);m.checked.set(key,states);
   }
  }
 }
 return [...weeks.values()].sort((a,b)=>b.start-a.start).map(w=>({
  start:w.start,end:w.end,partial:now<w.end,
  models:['GLM','Qwen'].map(role=>{
   const m=w.models.get(role);
   let exact=0,different=0,mixed=0;
   for(const states of m?.checked.values()||[]){
    if(states.size>1)mixed++;else if(states.has('EXACT_MATCH'))exact++;else different++;
   }
   const unique=exact+different+mixed;
   return {role,responses:m?.responses||0,withClaims:m?.withClaims||0,
    unresolved:m?.unresolved||0,unique,exact,different,mixed,
    exactPercent:unique?Math.round(100*exact/unique):null};
  })
 }));
}
/**
 * Source/field-specific transcription audit. Counts unique saved facts rather
 * than response volume. Missing claims, mixed repeats and exact checks stay
 * separate; this is not causal inference, source validation or model ranking.
 */
export function researchDiscrepancyPatterns(knowledge){
 const groups=new Map();
 const roles=['GLM','Qwen'];
 for(const row of knowledge?.records||[]){
  if(row.state!=='PARSED')continue;
  for(const fact of row.facts){
   const key=JSON.stringify([row.source,fact.field]);
   if(!groups.has(key))groups.set(key,{source:row.source,field:fact.field,available:0,
    paired:0,bothExact:0,oneExact:0,neitherExact:0,pairedMixed:0,
    models:roles.map(role=>({role,exact:0,different:0,mixed:0,unchecked:0,attempts:0}))});
   const g=groups.get(key);g.available++;
   const states=[];
   for(const m of g.models){
    const c=fact.checks?.[m.role];
    const matches=c?.matches||0,differences=c?.differences||0;
    const state=matches&&differences?'mixed':matches?'exact':differences?'different':'unchecked';
    m[state]++;m.attempts+=matches+differences;states.push(state);
   }
   if(states.includes('unchecked'))continue;
   g.paired++;
   if(states.includes('mixed'))g.pairedMixed++;
   else if(states.every(x=>x==='exact'))g.bothExact++;
   else if(states.includes('exact'))g.oneExact++;
   else g.neitherExact++;
  }
 }
 return [...groups.values()].map(g=>({...g,models:g.models.map(m=>{
  const checked=g.available-m.unchecked;
  return {...m,checked,coveragePercent:researchRatio(checked,g.available),
   exactPercent:researchRatio(m.exact,checked)};
 })})).sort((a,b)=>a.source.localeCompare(b.source)||a.field.localeCompare(b.field));
}
/**
 * Feedback engine v1: deterministic local audit worklist, derived from the
 * preserved research archive. Thresholds are review heuristics, not evidence
 * of statistical significance. Nothing is sent to a model or used to rank it.
 */
export const RESEARCH_FEEDBACK_POLICY=Object.freeze({minChecked:5,minAffected:3,minRatio:.3,minCoverageSample:10,minMissingRatio:.7});
export function buildResearchFeedback(knowledge){
 const policy=RESEARCH_FEEDBACK_POLICY,items=[];
 const add=(kind,source,field,role,affected,total,ids)=>{
  items.push({id:JSON.stringify([kind,source,field,role]),kind,source,field,role,
   affected,total,percent:researchRatio(affected,total),
   evidenceIds:[...new Set(ids)].sort().slice(0,8)});
 };
 const records=knowledge?.records||[];
 for(const g of knowledge?.groups||[]){
  const bad=records.filter(r=>r.source===g.source&&r.state==='CONFLICT');
  if(bad.length)add('SOURCE_ID_CONFLICT',g.source,null,null,bad.length,g.total,bad.map(r=>r.id));
  const unknown=records.filter(r=>r.source===g.source&&r.state==='UNKNOWN_FORMAT');
  if(unknown.length)add('UNRECOGNIZED_FORMAT',g.source,null,null,unknown.length,g.total,unknown.map(r=>r.id));
 }
 for(const p of researchDiscrepancyPatterns(knowledge)){
  const pool=records.filter(r=>r.source===p.source&&r.state==='PARSED'&&r.facts.some(f=>f.field===p.field));
  for(const m of p.models){
   const counts=r=>r.facts.find(f=>f.field===p.field)?.checks?.[m.role];
   const affected=m.different+m.mixed;
   if(m.checked>=policy.minChecked&&affected>=policy.minAffected&&affected/m.checked>=policy.minRatio){
    const ids=pool.filter(r=>(counts(r)?.differences||0)>0).map(r=>r.id);
    add('REPEATED_NUMERIC_DIFFERENCE',p.source,p.field,m.role,affected,m.checked,ids);
   }
   if(p.available>=policy.minCoverageSample&&m.unchecked/p.available>=policy.minMissingRatio){
    const ids=pool.filter(r=>!counts(r)?.matches&&!counts(r)?.differences).map(r=>r.id);
    add('LOW_EXPLICIT_COVERAGE',p.source,p.field,m.role,m.unchecked,p.available,ids);
   }
  }
 }
 const priority={SOURCE_ID_CONFLICT:0,UNRECOGNIZED_FORMAT:1,REPEATED_NUMERIC_DIFFERENCE:2,LOW_EXPLICIT_COVERAGE:3};
 items.sort((a,b)=>priority[a.kind]-priority[b.kind]||b.affected-a.affected||a.id.localeCompare(b.id));
 return {items,total:items.length,observations:knowledge?.total||0,
  policy:{...policy},automaticModelCalls:0};
}
/** Manual audit journal: evidence metadata only, no model calls or learning. */
export const FEEDBACK_JOURNAL_KEY='apex.research.feedback.journal.v1';
const MAX_FEEDBACK_REVIEWS=100,MAX_FEEDBACK_BYTES=180000;
export const FEEDBACK_REVIEW_OUTCOMES=Object.freeze(['REQUIRES_REVIEW','ROUNDING_OR_FORMAT','SOURCE_INCONSISTENCY','INSUFFICIENT_EVIDENCE']);
function validFeedbackReview(r){
 if(!r||typeof r.taskId!=='string'||r.taskId.length>200||
  !Number.isSafeInteger(r.at)||r.at<=0||!FEEDBACK_REVIEW_OUTCOMES.includes(r.outcome)||
  !Number.isSafeInteger(r.affected)||!Number.isSafeInteger(r.total)||
  r.affected<1||r.total<r.affected||!Array.isArray(r.evidenceIds)||
  r.evidenceIds.length<1||r.evidenceIds.length>8||
  r.evidenceIds.some(id=>typeof id!=='string'||id.length<1||id.length>100)||
  new Set(r.evidenceIds).size!==r.evidenceIds.length)return false;
 try{
  const k=JSON.parse(r.taskId);
  return Array.isArray(k)&&k.length===4&&
   ['SOURCE_ID_CONFLICT','UNRECOGNIZED_FORMAT','REPEATED_NUMERIC_DIFFERENCE','LOW_EXPLICIT_COVERAGE'].includes(k[0])&&
   typeof k[1]==='string'&&k[1].length<=40&&
   (k[2]===null||typeof k[2]==='string'&&k[2].length<=40)&&
   [null,'GLM','Qwen'].includes(k[3])&&JSON.stringify(k)===r.taskId;
 }catch{return false;}
}
export function validateFeedbackArchive(data){
 try{
  if(data?.version!==1||Object.keys(data).length!==2||
   !Array.isArray(data.reviews)||data.reviews.length>MAX_FEEDBACK_REVIEWS||
   new TextEncoder().encode(JSON.stringify(data)).length>MAX_FEEDBACK_BYTES)return null;
  const ids=new Set(),reviews=[];
  for(const r of data.reviews){
   if(!validFeedbackReview(r)||Object.keys(r).length!==6)return null;
   const id=JSON.stringify([r.taskId,r.at]);
   if(ids.has(id))return null;
   ids.add(id);
   reviews.push({taskId:r.taskId,at:r.at,outcome:r.outcome,affected:r.affected,total:r.total,
    evidenceIds:[...r.evidenceIds].sort()});
  }
  return {version:1,reviews};
 }catch{return null;}
}
export function mergeFeedbackArchives(previous,incoming){
 const a=validateFeedbackArchive({version:1,reviews:previous}),b=validateFeedbackArchive(incoming);
 if(!a||!b)return {ok:false,reason:'INVALID_FEEDBACK_ARCHIVE'};
 const byId=new Map();
 for(const row of [...a.reviews,...b.reviews]){
  const id=JSON.stringify([row.taskId,row.at]),old=byId.get(id);
  if(old&&JSON.stringify(old)!==JSON.stringify(row))return {ok:false,reason:'FEEDBACK_CONFLICT'};
  byId.set(id,row);
 }
 const merged={version:1,reviews:[...byId.values()].sort((a,b)=>b.at-a.at||a.taskId.localeCompare(b.taskId))};
 if(!validateFeedbackArchive(merged))return {ok:false,reason:'FEEDBACK_CAPACITY'};
 return {ok:true,archive:merged};
}
export function readFeedbackJournal(store){
 try{
  if(!store)return null;
  const raw=store.getItem(FEEDBACK_JOURNAL_KEY);
  if(raw===null||raw===undefined)return [];
  if(new TextEncoder().encode(raw).length>MAX_FEEDBACK_BYTES)return null;
  const data=JSON.parse(raw);
  return validateFeedbackArchive(data)?.reviews??null;
 }catch{return null;}
}
export function recordFeedbackReview(store,item,outcome,at=Date.now()){
 const previous=readFeedbackJournal(store);
 if(previous===null)return {ok:false,reason:'LOCAL_STORAGE'};
 if(!item)return {ok:false,reason:'INVALID_REVIEW'};
 const review={taskId:item.id,at,outcome,affected:item.affected,total:item.total,
  evidenceIds:[...new Set(item.evidenceIds||[])].sort()};
 if(!validFeedbackReview(review))return {ok:false,reason:'INVALID_REVIEW'};
 const latest=previous.find(r=>r.taskId===review.taskId);
 if(previous.some(r=>r.taskId===review.taskId&&r.at===review.at&&
    JSON.stringify(r)!==JSON.stringify(review)))return {ok:false,reason:'ARCHIVE_CONFLICT'};
 const signature=r=>JSON.stringify([r.outcome,r.affected,r.total,r.evidenceIds]);
 if(latest&&signature(latest)===signature(review))return {ok:true,duplicate:true,reviews:previous};
 if(previous.length>=MAX_FEEDBACK_REVIEWS)return {ok:false,reason:'JOURNAL_FULL'};
 const reviews=[review,...previous],data=JSON.stringify({version:1,reviews});
 if(new TextEncoder().encode(data).length>MAX_FEEDBACK_BYTES)return {ok:false,reason:'JOURNAL_FULL'};
 try{
  store.setItem(FEEDBACK_JOURNAL_KEY,data);
  if(store.getItem(FEEDBACK_JOURNAL_KEY)!==data)return {ok:false,reason:'LOCAL_STORAGE'};
  return {ok:true,reviews};
 }catch{return {ok:false,reason:'LOCAL_STORAGE'};}
}
export function compareFeedbackReview(review,current){
 const item=current?.items?.find(i=>i.id===review.taskId);
 if(!item)return {state:'NOT_CURRENTLY_FLAGGED',before:researchRatio(review.affected,review.total),after:null};
 const before=researchRatio(review.affected,review.total),after=researchRatio(item.affected,item.total);
 const unchanged=review.affected===item.affected&&review.total===item.total&&
  JSON.stringify(review.evidenceIds)===JSON.stringify([...item.evidenceIds].sort());
 return {state:unchanged?'UNCHANGED':'CHANGED',before,after,
  beforeCount:review.affected,beforeTotal:review.total,afterCount:item.affected,afterTotal:item.total};
}
/**
 * Research Lab v1: a paired descriptive sensitivity experiment.
 * Exact production matching stays unchanged. A fixed relative tolerance
 * is a counterfactual classification, not proof of correct rounding.
 */
export const RESEARCH_LAB_POLICY=Object.freeze({version:1,relativeTolerance:0.000001});
export function runResearchLab(rawRows,{asset='',now=Date.now()}={}){
 const rows=mergeTranscripts([],Array.isArray(rawRows)?rawRows:[],now);
 const conflicts=findArchiveSourceConflicts(rows);
 const maps={GLM:new Map(),Qwen:new Map()};
 let unresolved=0,checkedClaims=0;
 for(const row of rows){
  if(asset&&row.asset!==asset)continue;
  const result=compareHistoricalClaims(row,{archiveConflicts:conflicts});
  unresolved+=result.unresolved;
  for(const c of result.results){
   if(!['EXACT_MATCH','NUMERIC_DIFFERENCE'].includes(c.state))continue;
   const key=JSON.stringify([c.sourceId,c.field]);
   const map=maps[c.role];
   let f=map.get(key);
   if(!f){f={exact:true,within:true,hasDifference:false,attempts:0};map.set(key,f);}
   const exact=c.state==='EXACT_MATCH';
   // Zero has no relative tolerance; never use absolute floors across units.
   const within=exact||(c.observed!==0&&
    Math.abs((c.claimed-c.observed)/c.observed)<=RESEARCH_LAB_POLICY.relativeTolerance);
   f.exact=f.exact&&exact;f.within=f.within&&within;
   f.hasDifference=f.hasDifference||!exact;f.attempts++;checkedClaims++;
  }
 }
 const models=Object.entries(maps).map(([role,map])=>{
  const facts=[...map.values()],total=facts.length;
  const exact=facts.filter(f=>f.exact).length;
  const toleranceOnly=facts.filter(f=>!f.exact&&f.within).length;
  return {role,total,exact,toleranceOnly,outside:total-exact-toleranceOnly,
   exactPercent:researchRatio(exact,total),
   tolerancePercent:researchRatio(exact+toleranceOnly,total)};
 });
 return {policy:{...RESEARCH_LAB_POLICY},asset,models,checkedClaims,unresolved,
  archiveConflicts:conflicts.length,automaticModelCalls:0,productionRuleChanged:false};
}
export function researchStorageUsage(rows){
 const bytes=new TextEncoder().encode(JSON.stringify({version:1,rows})).length;
 return {records:rows.length,recordLimit:MAX_TRANSCRIPTS,bytes,byteLimit:MAX_BYTES,
  recordPercent:Math.min(100,Math.round(100*rows.length/MAX_TRANSCRIPTS)),
  bytePercent:Math.min(100,Math.round(100*bytes/MAX_BYTES))};
}
function emptyModelStats(role){
 return {role,responses:0,withClaims:0,withoutClaims:0,
  checked:0,matches:0,differences:0,unresolved:0,
  sourceIssues:0,formatIssues:0,ambiguous:0,
  coveragePercent:null,exactMatchPercent:null,
  usableFactOpportunities:0,coveredFactOpportunities:0,
  factCoveragePercent:null,uniqueChecked:0,uniqueExact:0,uniqueDifferent:0,uniqueMixed:0};
}
function addModelStats(model,claims,facts,unique){
 model.responses++;
 const keys=new Set(facts.map(f=>JSON.stringify([f.sourceId,f.field])));
 model.usableFactOpportunities+=keys.size;
 const checkedKeys=new Set();
 if(claims.length)model.withClaims++;else model.withoutClaims++;
 for(const c of claims){
  if(!['EXACT_MATCH','NUMERIC_DIFFERENCE'].includes(c.state))continue;
  const key=JSON.stringify([c.sourceId,c.field]);
  if(!keys.has(key))continue;
  checkedKeys.add(key);
  const prior=unique.get(key)||new Set();
  prior.add(c.state);unique.set(key,prior);
 }
 model.coveredFactOpportunities+=checkedKeys.size;
 for(const c of claims){
  switch(c.state){
   case 'EXACT_MATCH':model.checked++;model.matches++;break;
   case 'NUMERIC_DIFFERENCE':model.checked++;model.differences++;break;
   default:
    model.unresolved++;
    if(c.state==='SOURCE_CONFLICT'||c.state==='UNKNOWN_SOURCE_OR_FIELD')model.sourceIssues++;
    if(c.state==='INVALID_FORMAT')model.formatIssues++;
    if(c.state==='AMBIGUOUS_CLAIMS')model.ambiguous++;
  }
 }
}
export function summarizeResearchHistory(rawRows,{asset='',now=Date.now()}={}){
 const rows=mergeTranscripts([],Array.isArray(rawRows)?rawRows:[],now)
  .filter(row=>!asset||row.asset===asset);
 const allIds=new Set(),venues=new Set(),days=new Set(),assets=new Set();
 const perAsset=new Map(),delays=[],ages=[];
 let completed=0,multiVenue=0,reviewNewEvidence=0,unknownVenue=0;
 let sourceConflicts=0,sharedSnapshots=0,laterSnapshots=0;
 const archiveConflicts=findArchiveSourceConflicts(rows);
 const factIds=new Set(),unknownIds=new Set(),conflictingIds=new Set(archiveConflicts);
 const models=[emptyModelStats('GLM'),emptyModelStats('Qwen')];
 const uniqueByModel=[new Map(),new Map()];
 const pairStats={compared:0,bothExact:0,oneExact:0,bothDifferent:0,distinctFacts:0};
 const pairedKeys=new Set();
 let claimStudies=0,claimsChecked=0,claimsMatched=0,claimsDifferent=0,claimsUnresolved=0;
 const venue=e=>{
  const prefix=e.source_id.split(':')[0].toLowerCase();
  return ['binance','okx','bybit'].includes(prefix)?prefix:null;
 };
 for(const row of rows){
  assets.add(row.asset);days.add(new Date(row.startedAt).toISOString().slice(0,10));
  const original=new Set(row.sourceIds),rowVenues=new Set();
  const snapshots=[...row.evidence,...(row.criticEvidence||[])];
  for(const e of snapshots){
   allIds.add(e.source_id);
   const v=venue(e);if(v){venues.add(v);rowVenues.add(v);}else unknownVenue++;
  }
  const initialVenues=new Set(row.evidence.map(venue).filter(Boolean));
  const multi=initialVenues.size>=2;
  if(multi)multiVenue++;
  for(const e of row.evidence)ages.push(Math.max(0,row.startedAt-e.observed_at));
  const audit=auditResearchEvidence(row);
  const structured=structuredResearchRecord(row);
  const claims=compareHistoricalClaims(row,{archiveConflicts});
  const usable=structured.facts.filter(f=>!conflictingIds.has(f.sourceId));
  const glm=claims.results.filter(c=>c.role==='GLM');
  const qwen=claims.results.filter(c=>c.role==='Qwen');
  const allowed=new Set(row.sourceIds);
  addModelStats(models[0],glm,usable.filter(f=>allowed.has(f.sourceId)),uniqueByModel[0]);
  if(row.stage==='COMPLETE'){
   addModelStats(models[1],qwen,usable,uniqueByModel[1]);
   const checked=c=>['EXACT_MATCH','NUMERIC_DIFFERENCE'].includes(c.state);
   const key=c=>JSON.stringify([c.sourceId,c.field]);
   const qMap=new Map(qwen.filter(checked).map(c=>[key(c),c]));
   for(const g of glm.filter(checked)){
    const q=qMap.get(key(g));if(!q)continue;
    pairedKeys.add(key(g));pairStats.compared++;
    const exact=Number(g.state==='EXACT_MATCH')+Number(q.state==='EXACT_MATCH');
    if(exact===2)pairStats.bothExact++;
    else if(exact===1)pairStats.oneExact++;
    else pairStats.bothDifferent++;
   }
  }
  if(claims.status==='EXPLICIT_LINES_FOUND')claimStudies++;
  claimsChecked+=claims.checked;claimsMatched+=claims.matches;
  claimsDifferent+=claims.differences;claimsUnresolved+=claims.unresolved;
  for(const f of structured.facts)factIds.add(JSON.stringify([f.sourceId,f.field]));
  for(const id of structured.unknown)unknownIds.add(id);
  for(const id of structured.conflicts)conflictingIds.add(id);
  if(audit.conflicts.length)sourceConflicts++;
  sharedSnapshots+=audit.shared.length;
  laterSnapshots+=audit.later.length;
  const done=row.stage==='COMPLETE';
  if(done){
   completed++;delays.push(row.criticAt-row.startedAt);
   if(row.criticEvidence.some(e=>!original.has(e.source_id)&&
       e.observed_at>row.startedAt))reviewNewEvidence++;
  }
  const entry=perAsset.get(row.asset)||{asset:row.asset,total:0,completed:0,multiVenue:0};
  entry.total++;if(done)entry.completed++;if(multi)entry.multiVenue++;
  perAsset.set(row.asset,entry);
 }
 const median=values=>{
  if(!values.length)return null;
  const s=[...values].sort((a,b)=>a-b),mid=Math.floor(s.length/2);
  return s.length%2?s[mid]:(s[mid-1]+s[mid])/2;
 };
 for(const [i,m] of models.entries()){
  if(m.responses)m.coveragePercent=Math.round(100*m.withClaims/m.responses);
  if(m.checked)m.exactMatchPercent=Math.round(100*m.matches/m.checked);
  if(m.usableFactOpportunities)m.factCoveragePercent=Math.round(100*m.coveredFactOpportunities/m.usableFactOpportunities);
  m.uniqueChecked=uniqueByModel[i].size;
  for(const states of uniqueByModel[i].values()){
   if(states.size>1)m.uniqueMixed++;
   else if(states.has('EXACT_MATCH'))m.uniqueExact++;
   else m.uniqueDifferent++;
  }
 }
 pairStats.distinctFacts=pairedKeys.size;
 return {total:rows.length,completed,pending:rows.length-completed,
  models,pairStats,archiveConflicts,
  completionPercent:rows.length?Math.round(completed/rows.length*100):null,
  multiVenue,reviewNewEvidence,distinctSnapshots:allIds.size,
  venues:[...venues].sort(),unknownVenueReferences:unknownVenue,
  assets:assets.size,utcDays:days.size,medianReviewMs:median(delays),
  medianInputAgeMs:median(ages),
  perAsset:[...perAsset.values()].sort((a,b)=>a.asset.localeCompare(b.asset)),
  sourceConflicts,sharedSnapshots,laterSnapshots,
  structuredFacts:[...factIds].filter(key=>!conflictingIds.has(JSON.parse(key)[0])).length,
  unknownFormats:unknownIds.size,
  claimStudies,claimsChecked,claimsMatched,claimsDifferent,claimsUnresolved,
  agreement:null,accuracy:null};
}
/** Ratios are descriptive only and never invent denominators. */
export function researchRatio(numerator,denominator){
 if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||
    numerator<0||denominator<=0||numerator>denominator)return null;
 return Math.round(100*numerator/denominator);
}
function researchMeter(label,numerator,denominator){
 const root=document.createElement('div'),head=document.createElement('div'),
  title=document.createElement('span'),value=document.createElement('strong'),
  bar=document.createElement('div'),fill=document.createElement('span');
 root.className='apex-research-meter';head.className='apex-research-meter-head';
 const percent=researchRatio(numerator,denominator);
 title.textContent=label;
 value.textContent=percent===null?'—':percent+'% · '+numerator+'/'+denominator;
 bar.className='apex-research-meter-track';
 bar.dataset.known=String(percent!==null);
 bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',label);
 bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
 bar.setAttribute('aria-valuetext',percent===null?'Недостаточно данных':value.textContent);
 if(percent!==null)bar.setAttribute('aria-valuenow',String(percent));
 fill.style.width=(percent??0)+'%';
 head.append(title,value);bar.append(fill);root.append(head,bar);return root;
}
export function initResearchHistory({store,now=()=>Date.now()}={}){
 if(store===undefined){try{store=globalThis.localStorage;}catch{store=null;}}
 const node=id=>document.getElementById(id);
 const count=node('apex-history-count'),list=node('apex-history-list'),
 picker=node('apex-history-filter'),limit=node('apex-history-older');
 const stats=node('apex-history-stats'),statsRows=node('apex-history-stats-assets');
 const modelStats=node('apex-history-model-stats');
 const pairStats=node('apex-history-pair-stats');
 const knowledgeSummary=node('apex-knowledge-summary'),knowledgeList=node('apex-knowledge-list'),
  knowledgeSource=node('apex-knowledge-source'),knowledgeMore=node('apex-knowledge-more');
 let knowledgeVisible=12,knowledgeSignature='',knowledgeBaseSignature='',knowledgeBase=null;
 const renderKnowledge=()=>{
  if(!knowledgeSummary||!knowledgeList||!knowledgeSource||!knowledgeMore)return;
  const baseKey=JSON.stringify([rows,picker.value]);
  if(baseKey!==knowledgeBaseSignature){
   knowledgeBaseSignature=baseKey;
   knowledgeBase=buildResearchKnowledge(rows,{asset:picker.value,now:now()});
  }
  const all=knowledgeBase,previous=knowledgeSource.value;
  const sources=JSON.stringify(all.groups.map(x=>x.source));
  const names={'binance:24h':'Binance · 24ч','binance:depth':'Binance · глубина',
   'okx:depth':'OKX · глубина','bybit:depth':'Bybit · глубина','unknown':'Другой формат'};
  if(knowledgeSource.dataset.sources!==sources){
   knowledgeSource.replaceChildren();
   for(const value of ['',...all.groups.map(x=>x.source)]){
    const option=document.createElement('option');option.value=value;
    option.textContent=value?(names[value]||value):'Все источники';knowledgeSource.append(option);
   }
   if(all.groups.some(x=>x.source===previous))knowledgeSource.value=previous;
   knowledgeSource.dataset.sources=sources;
  }
  const records=all.records.filter(x=>!knowledgeSource.value||x.source===knowledgeSource.value);
  const key=JSON.stringify([records,knowledgeVisible]);
  if(key===knowledgeSignature)return;
  knowledgeSignature=key;
  const group=knowledgeSource.value?all.groups.find(x=>x.source===knowledgeSource.value):null;
  knowledgeSummary.textContent='Уникальных снимков: '+records.length+
   ' · распознано: '+(group?group.parsed:all.parsed)+
   ' · фактов: '+(group?group.facts:all.uniqueFacts)+
   ' · конфликт ID: '+(group?group.conflicts:all.quarantined)+
   ' · неизвестный формат: '+(group?group.unknown:all.unknown);
  knowledgeList.replaceChildren();
  if(!records.length){
   const p=document.createElement('p');p.textContent='Пока нет сохранённых наблюдений.';knowledgeList.append(p);
  }
  const labels={PRICE_USDT:'Цена (USDT)',CHANGE_24H_PCT:'Изменение за 24ч (%)',
   VOLUME_24H_USDT:'Объём за 24ч (USDT)',BEST_BID:'Лучшая покупка',
   BEST_ASK:'Лучшая продажа',SPREAD_BPS:'Спред (bps)',VISIBLE_DEPTH_IMBALANCE:'Дисбаланс видимой глубины'};
  for(const row of records.slice(0,knowledgeVisible)){
   const details=document.createElement('details'),title=document.createElement('summary'),meta=document.createElement('p');
   title.textContent=row.asset+' · '+(names[row.source]||row.source)+' · '+
    (row.state==='CONFLICT'?'Конфликт ID':row.at?new Date(row.at).toISOString():'—');
   meta.textContent='ID: '+row.id+' · сессий: '+row.sessions+
    (row.state==='CONFLICT'?' · исключён из сверки: содержимое или время различается':
     row.state==='UNKNOWN_FORMAT'?' · формат не распознан':' · чисел: '+row.facts.length);
   details.append(title,meta);
   for(const f of row.facts){
    const line=document.createElement('p');line.className='apex-evidence-audit';
    line.textContent=(labels[f.field]||f.field)+': '+f.value+
     (f.checks?'\nGLM: '+f.checks.GLM.matches+' совп. / '+f.checks.GLM.differences+' различ. · Qwen: '+
      f.checks.Qwen.matches+' совп. / '+f.checks.Qwen.differences+' различ.':'\nНет явной числовой сверки модели');
    details.append(line);
   }
   knowledgeList.append(details);
  }
  knowledgeMore.disabled=records.length<=knowledgeVisible;
 };
 let statsSignature='',qualitySignature='';
 let rows=readTranscripts(store,now()),visible=8,signature='',saved=true,saveIssue='';
 const archiveWarning=()=>saved?'':saveIssue==='ARCHIVE_CAPACITY'?
  ' · архив заполнен: новая запись не сохранена, старые сохранены. Сделайте резервную копию.':
  saveIssue==='ARCHIVE_CONFLICT'?' · конфликт с сохранённой сессией: запись не заменена':
  ' · новая запись не подтверждена, старый архив сохранён';
 const qualityTimeline=node('apex-quality-timeline'),qualitySources=node('apex-quality-sources'),
  storageUsage=node('apex-history-capacity'),patternsNode=node('apex-quality-patterns');
 const feedbackSummary=node('apex-feedback-summary'),feedbackList=node('apex-feedback-list'),
  feedbackMore=node('apex-feedback-more');
 const labRun=node('apex-lab-run'),labOutput=node('apex-lab-output');
 let labSnapshot=null;
 function renderLab(){
  if(!labOutput||!labSnapshot)return;
  const {result,at,signature}=labSnapshot;
  const stale=signature!==JSON.stringify([rows,picker.value]);
  labOutput.replaceChildren();
  const info=document.createElement('p');
  info.textContent='Эксперимент '+new Date(at).toISOString()+' · '+(result.asset||'Все активы')+
   ' · сверок: '+result.checkedClaims+' · неразрешённых: '+result.unresolved+
   (stale?' · архив или фильтр изменился: запустите эксперимент заново.':'');
  labOutput.append(info);
  for(const m of result.models){
   const card=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small');
   card.className='apex-quality-period';title.textContent=m.role;
   note.textContent='Уникальных фактов: '+m.total+' · только допуск: '+m.toleranceOnly+
    ' · за пределами допуска: '+m.outside;
   card.append(title,researchMeter('Строгое совпадение',m.exact,m.total),
    researchMeter('Экспериментальный допуск',m.exact+m.toleranceOnly,m.total),note);
   labOutput.append(card);
  }
 }
 labRun?.addEventListener('click',()=>{
  const at=now();
  labSnapshot={at,signature:JSON.stringify([rows,picker.value]),
   result:runResearchLab(rows,{asset:picker.value,now:at})};
  renderLab();
 });
 const reviewList=node('apex-feedback-reviews'),reviewStatus=node('apex-feedback-review-status'),
  reviewMore=node('apex-feedback-review-more');
 let feedbackVisible=8,feedbackSignature='',reviewVisible=8;
 const reviewNames={REQUIRES_REVIEW:'Требуется повторная проверка',ROUNDING_OR_FORMAT:'Возможное округление / формат',SOURCE_INCONSISTENCY:'Замечено несоответствие источника',INSUFFICIENT_EVIDENCE:'Недостаточно доказательств'};
 function renderReviewJournal(result){
  if(!reviewList||!reviewMore)return;
  const reviews=readFeedbackJournal(store);
  reviewList.replaceChildren();
  if(!reviews?.length){
   const p=document.createElement('p');p.textContent=reviews===null?'Журнал недоступен; записи не изменены.':'Пока нет ручных проверок.';reviewList.append(p);
  }
  for(const r of (reviews||[]).slice(0,reviewVisible)){
   const details=document.createElement('details'),title=document.createElement('summary'),
    text=document.createElement('p'),ids=document.createElement('p');
   details.className='apex-quality-pattern';
   title.textContent=new Date(r.at).toISOString().slice(0,16).replace('T',' ')+' UTC · '+reviewNames[r.outcome];
   const comparison=compareFeedbackReview(r,result);
   text.textContent=JSON.parse(r.taskId).filter(Boolean).join(' · ')+'\nПри проверке: '+r.affected+'/'+r.total+
    (comparison.after===null?' · сейчас порог не достигнут или данных нет; устранение не подтверждено':
     ' · сейчас: '+comparison.afterCount+'/'+comparison.afterTotal+
     (comparison.state==='CHANGED'?' · состав/доля изменились':' · без изменений'));
   ids.className='apex-evidence-audit';ids.textContent=r.evidenceIds.join('\n');
   details.append(title,text,ids);reviewList.append(details);
  }
  reviewMore.disabled=!reviews||reviews.length<=reviewVisible;
 }
 function renderFeedback(){
  if(!feedbackSummary||!feedbackList||!feedbackMore)return;
  // Director worklist describes the complete archive, not the current asset filter.
  const knowledge=buildResearchKnowledge(rows,{now:now()});
  const result=buildResearchFeedback(knowledge);
  const key=JSON.stringify([result,feedbackVisible,reviewVisible,readFeedbackJournal(store)]);
  if(key===feedbackSignature)return;
  feedbackSignature=key;
  feedbackSummary.textContent='Наблюдений: '+result.observations+' · задач проверки: '+result.total+
   ' · автоматических обращений к ИИ: 0';
  feedbackList.replaceChildren();
  const labels={
   SOURCE_ID_CONFLICT:['Конфликт исходного ID','Сопоставьте оригиналы записей; не используйте конфликтующее наблюдение для числовой сверки.'],
   UNRECOGNIZED_FORMAT:['Неизвестный формат','Проверьте схему сохранённого наблюдения; не извлекайте числа догадкой.'],
   REPEATED_NUMERIC_DIFFERENCE:['Повторяющиеся числовые различия','Сверьте указанные числа и единицы с исходным текстом. Различие может быть округлением.'],
   LOW_EXPLICIT_COVERAGE:['Мало явных сверок','Изучите, какие доступные числа не представлены в формализованном виде. Это не ошибка модели.']
  };
  if(!result.items.length){
   const p=document.createElement('p');p.textContent='Нет задач по текущим порогам. Это не подтверждение качества моделей.';feedbackList.append(p);
  }
  for(const item of result.items.slice(0,feedbackVisible)){
   const details=document.createElement('details'),title=document.createElement('summary'),
    meta=document.createElement('p'),action=document.createElement('p'),ids=document.createElement('p');
   details.className='apex-quality-pattern';
   const [label,instruction]=labels[item.kind];
   title.textContent=label+' · '+item.source+(item.field?' · '+item.field:'')+(item.role?' · '+item.role:'');
   meta.textContent='Наблюдений: '+item.affected+' / '+item.total+' · '+(item.percent===null?'—':item.percent+'%');
   action.textContent=instruction;
   ids.className='apex-evidence-audit';ids.textContent='ID для ручной сверки (до 8):\n'+item.evidenceIds.join('\n');
   details.append(title,meta,action,ids);
   if(reviewList&&reviewStatus){
    const select=document.createElement('select'),button=document.createElement('button');
    select.setAttribute('aria-label','Результат ручной проверки');
    for(const [value,label] of Object.entries(reviewNames)){
     const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
    }
    button.type='button';button.className='ghost';button.textContent='Записать результат проверки';
    button.addEventListener('click',()=>{
     const current=buildResearchFeedback(buildResearchKnowledge(rows,{now:now()}));
     const live=current.items.find(i=>i.id===item.id);
     if(!live||JSON.stringify(live)!==JSON.stringify(item)){
      reviewStatus.textContent='Данные задачи изменились; откройте актуальную карточку.';
      feedbackSignature='';renderFeedback();return;
     }
     const recorded=recordFeedbackReview(store,live,select.value,now());
     reviewStatus.textContent=recorded.ok?(recorded.duplicate?'Такая проверка уже сохранена.':'Ручная отметка сохранена; устранение проблемы не подтверждено.'):
      recorded.reason==='JOURNAL_FULL'?'Журнал заполнен; прежние записи сохранены.':'Не удалось подтвердить запись журнала.';
     feedbackSignature='';renderFeedback();
    });
    details.append(select,button);
   }
   feedbackList.append(details);
  }
  feedbackMore.disabled=result.items.length<=feedbackVisible;
  renderReviewJournal(result);
 }
 function renderQuality(){
  if(!qualityTimeline||!qualitySources||!storageUsage)return;
  const current=now();
  const key=JSON.stringify([rows,picker.value,Math.floor(current/86400000),saved,saveIssue]);
  if(key===qualitySignature)return;
  qualitySignature=key;
  const usage=researchStorageUsage(rows);
  storageUsage.textContent='Локальная память: '+usage.records+' / '+usage.recordLimit+
   ' записей · '+Math.round(usage.bytes/1024)+' / '+Math.round(usage.byteLimit/1024)+' КиБ'+
   (Math.max(usage.recordPercent,usage.bytePercent)>=80?' · близко к пределу, сохраните резервную копию':'')+
   archiveWarning();
  const sources=knowledgeBase||buildResearchKnowledge(rows,{asset:picker.value,now:current});
  qualitySources.replaceChildren();
  if(!sources.groups.length){
   const p=document.createElement('p');p.textContent='Нет сохранённых наблюдений для оценки.';qualitySources.append(p);
  }
  for(const g of sources.groups){
   const card=document.createElement('div'),name=document.createElement('strong'),note=document.createElement('small');
   card.className='apex-quality-period';name.textContent=g.source;
   note.textContent='Уникальных ID: '+g.total+' · конфликтов: '+g.conflicts+
    ' · неизвестный формат: '+g.unknown;
   card.append(name,researchMeter('Распознано без конфликта',g.parsed,g.total),note);
   qualitySources.append(card);
  }
  if(patternsNode){
   patternsNode.replaceChildren();
   const patterns=researchDiscrepancyPatterns(sources);
   const fields={PRICE_USDT:'Цена',CHANGE_24H_PCT:'Изменение 24ч',
    VOLUME_24H_USDT:'Объём 24ч',BEST_BID:'Лучшая покупка',BEST_ASK:'Лучшая продажа',
    SPREAD_BPS:'Спред',VISIBLE_DEPTH_IMBALANCE:'Дисбаланс видимой глубины'};
   if(!patterns.length){
    const p=document.createElement('p');p.textContent='Нет распознанных числовых наблюдений.';patternsNode.append(p);
   }
   for(const p of patterns){
    const details=document.createElement('details'),title=document.createElement('summary'),
     note=document.createElement('p');
    details.className='apex-quality-pattern';
    title.textContent=p.source+' · '+(fields[p.field]||p.field)+' · '+p.available+' фактов';
    const paired=document.createElement('p');
    paired.textContent='Обе модели проверяли: '+p.paired+'/'+p.available+
     ' · обе совпали: '+p.bothExact+' · одна совпала: '+p.oneExact+
     ' · обе отличаются: '+p.neitherExact+' · смешанные: '+p.pairedMixed;
    note.textContent='Проверки относятся к уникальным сохранённым фактам, а не к числу вызовов.';
    details.append(title,note);
    for(const m of p.models){
     const count=document.createElement('small');
     count.textContent=m.role+' · без сверки: '+m.unchecked+' · различия: '+m.different+
      ' · смешанные: '+m.mixed+' · повторных/первичных сверок всего: '+m.attempts;
     details.append(researchMeter(m.role+' · охват',m.checked,p.available),
      researchMeter(m.role+' · только точные',m.exact,m.checked),count);
    }
    details.append(paired);patternsNode.append(details);
   }
  }
  qualityTimeline.replaceChildren();
  const weeks=researchQualityTimeline(rows,{asset:picker.value,now:current});
  if(!weeks.length){
   const p=document.createElement('p');p.textContent='Недостаточно записей для недельного среза.';qualityTimeline.append(p);
  }
  for(const w of weeks.slice(0,8)){
   const card=document.createElement('div'),heading=document.createElement('strong');
   card.className='apex-quality-period';
   heading.textContent=new Date(w.start).toISOString().slice(0,10)+' — '+
    new Date(w.end-1).toISOString().slice(0,10)+(w.partial?' · текущая неделя':'');
   card.append(heading);
   for(const m of w.models){
    const note=document.createElement('small');
    note.textContent=m.role+' · ответов: '+m.responses+' · уникальных чисел: '+m.unique+
     ' · смешанных: '+m.mixed+' · без сверки: '+m.unresolved;
    card.append(researchMeter(m.role+' · только точные совпадения',m.exact,m.unique),note);
   }
   qualityTimeline.append(card);
  }
 }
 const render=()=>{
  const assets=[...new Set(rows.map(x=>x.asset))].sort();
  const prev=picker.value;
  const opts=JSON.stringify(assets);
  if(picker.dataset.assets!==opts){
   picker.replaceChildren();
   for(const asset of ['',...assets]){
    const option=document.createElement('option');option.value=asset;
    option.textContent=asset||'Все активы';picker.append(option);
   }
   if(assets.includes(prev))picker.value=prev;
   picker.dataset.assets=opts;
  }
  const shown=rows.filter(x=>!picker.value||x.asset===picker.value);
  count.textContent='Сохранено '+rows.length+' / '+MAX_TRANSCRIPTS+
   ' · завершено '+rows.filter(x=>x.stage==='COMPLETE').length+
   archiveWarning();
  if(stats&&statsRows){
   const view=summarizeResearchHistory(shown,{now:now()});
   const minutes=ms=>ms===null?'—':(ms/60000).toFixed(1)+' мин';
   const key=JSON.stringify(view);
   if(key!==statsSignature){
    statsSignature=key;
    const metrics=[
     ['Проверено Qwen',view.completed+' / '+view.total],
     ['Доля завершённых',view.completionPercent===null?'—':view.completionPercent+'%'],
     ['Начальные данные ≥ 2 бирж',view.multiVenue+' / '+view.total],
     ['Qwen получил новые снимки',view.reviewNewEvidence+' / '+view.completed],
     ['Уникальные снимки',String(view.distinctSnapshots)],
     ['Структурированные наблюдения',String(view.structuredFacts)],
     ['Нераспознанные форматы',String(view.unknownFormats)],
     ['Записей с явными утверждениями',view.claimStudies+' / '+view.total],
     ['Точно совпали с источником',view.claimsChecked?view.claimsMatched+' / '+view.claimsChecked:'—'],
     ['Числовые различия',view.claimsChecked?String(view.claimsDifferent):'—'],
     ['Утверждения без однозначной сверки',String(view.claimsUnresolved)],
     ['Конфликт содержимого одного ID',String(view.sourceConflicts)],
     ['Конфликтующие ID во всём выбранном архиве',String(view.archiveConflicts.length)],
     ['Повторные снимки при проверке',String(view.sharedSnapshots)],
     ['Новые снимки при проверке',String(view.laterSnapshots)],
     ['Дни наблюдений (UTC)',String(view.utcDays)],
     ['Медиана возраста данных GLM',minutes(view.medianInputAgeMs)],
     ['Медиана паузы GLM → Qwen',minutes(view.medianReviewMs)]
    ];
    stats.replaceChildren();
    for(const [name,value] of metrics){
     const row=document.createElement('div'),label=document.createElement('small'),
      number=document.createElement('strong');
     label.textContent=name;number.textContent=value;
     row.append(label,number);stats.append(row);
    }
    if(modelStats){
     modelStats.replaceChildren();
     for(const m of view.models){
      const card=document.createElement('div'),name=document.createElement('strong'),
       numbers=document.createElement('p'),note=document.createElement('small');
      name.textContent=m.role;
      numbers.className='apex-model-transcription-numbers';
      numbers.textContent='Ответы с явными фактами: '+m.withClaims+'/'+m.responses+
       ' · '+(m.coveragePercent===null?'—':m.coveragePercent+'%')+
       '\nТочные совпадения: '+m.matches+'/'+m.checked+
       ' · '+(m.exactMatchPercent===null?'—':m.exactMatchPercent+'%')+
       '\nРазличия: '+m.differences+' · без сверки: '+m.unresolved;
      note.textContent='Нет явных фактов: '+m.withoutClaims+
       ' · источник/поле: '+m.sourceIssues+' · формат: '+m.formatIssues+
       ' · неоднозначность: '+m.ambiguous;
      const coverage=document.createElement('p');
      coverage.className='apex-model-transcription-numbers';
      coverage.textContent='Охват доступных чисел: '+m.coveredFactOpportunities+'/'+m.usableFactOpportunities+
       ' · '+(m.factCoveragePercent===null?'—':m.factCoveragePercent+'%')+
       '\nУникальных проверенных фактов: '+m.uniqueChecked+
       '\nТолько совпадения: '+m.uniqueExact+' · только различия: '+m.uniqueDifferent+
       ' · смешанные результаты: '+m.uniqueMixed;
      card.dataset.role=m.role.toLowerCase();
      card.append(name,
       researchMeter('Охват доступных чисел',m.coveredFactOpportunities,m.usableFactOpportunities),
       researchMeter('Точные числовые совпадения',m.matches,m.checked),
       numbers,coverage,note);
      modelStats.append(card);
     }
    }
    if(pairStats){
     const p=view.pairStats;
     pairStats.textContent=p.compared?
      'Парных сверок одного факта: '+p.compared+' · уникальных фактов: '+p.distinctFacts+
      '\nОбе модели совпали с источником: '+p.bothExact+
      '\nОдна совпала: '+p.oneExact+'\nОбе отличаются от источника: '+p.bothDifferent:
      'Пока нет парных сверок одного исторического факта.';
     const distribution=node('apex-history-pair-meters');
     if(distribution){
      distribution.replaceChildren();
      for(const [label,count] of [['Обе совпали',p.bothExact],['Одна совпала',p.oneExact],['Обе отличаются',p.bothDifferent]])
       distribution.append(researchMeter(label,count,p.compared));
     }
    }
    statsRows.replaceChildren();
    for(const item of view.perAsset){
     const line=document.createElement('li');
     line.textContent=item.asset+' · проверено '+item.completed+'/'+item.total+
      ' · ≥ 2 бирж '+item.multiVenue;
     statsRows.append(line);
    }
   }
  }
  renderKnowledge();
  renderQuality();
  renderFeedback();
  renderLab();
  limit.disabled=shown.length<=visible;
  const archiveConflicts=findArchiveSourceConflicts(shown);
  const next=JSON.stringify([shown.slice(0,visible),archiveConflicts]);
  if(next===signature)return;
  signature=next;list.replaceChildren();
  for(const row of shown.slice(0,visible)){
   const details=document.createElement('details');
   const title=document.createElement('summary');
   title.textContent=row.asset+' · '+new Date(row.startedAt).toLocaleString('ru-RU')+
    (row.stage==='COMPLETE'?' · GLM + Qwen':' · только GLM');
   const body=document.createElement('pre');
   const evidence=row.evidence.map(e=>e.source_id+' · '+new Date(e.observed_at).toISOString()+'\n'+e.text).join('\n\n');
   const critic=row.criticEvidence?.map(e=>e.source_id+' · '+new Date(e.observed_at).toISOString()+'\n'+e.text).join('\n\n');
   body.textContent='GLM\n'+row.analystText+'\n\nИсходные наблюдения\n'+evidence+
    (row.stage==='COMPLETE'?'\n\nQwen\n'+row.criticText+'\n\nНовые наблюдения для Qwen\n'+critic:'');
   const audit=auditResearchEvidence(row);
   const note=document.createElement('p');
   note.className='apex-evidence-audit';
   const lines=[
    'Сверка наблюдений: '+(audit.status==='AWAITING_REVIEW'?'Qwen ещё не проверил':
     audit.status==='SOURCE_CONFLICT'?'конфликт содержимого одного ID':'выполнена'),
    'Повторные снимки: '+audit.shared.length+' · новые: '+audit.later.length+
    ' · другие: '+audit.other.length,
    'Совпадение выводов моделей: не определено'
   ];
   if(audit.conflicts.length)lines.push('Конфликтующие ID: '+audit.conflicts.join(', '));
   note.textContent=lines.join('\n');
   const structured=structuredResearchRecord(row);
   const facts=document.createElement('details');
   const factsTitle=document.createElement('summary');
   factsTitle.textContent='Структурированные наблюдения · '+structured.facts.filter(f=>!archiveConflicts.includes(f.sourceId)).length;
   facts.append(factsTitle);
   const labels={PRICE_USDT:'Цена (USDT)',CHANGE_24H_PCT:'Изменение за 24ч (%)',
    VOLUME_24H_USDT:'Объём за 24ч (USDT)',BEST_BID:'Лучшая покупка',
    BEST_ASK:'Лучшая продажа',SPREAD_BPS:'Спред (bps)',
    VISIBLE_DEPTH_IMBALANCE:'Дисбаланс видимой глубины'};
   for(const f of structured.facts.filter(f=>!archiveConflicts.includes(f.sourceId))){
    const block=document.createElement('p');
    block.className='apex-evidence-audit';
    block.textContent=(labels[f.field]||f.field)+': '+f.value+
     '\n'+new Date(f.observedAt).toISOString()+' · '+f.sourceId;
    facts.append(block);
   }
   const statusNote=document.createElement('p');
   statusNote.textContent='Нераспознанных снимков: '+structured.unknown.length+
    '. Конфликтующие записи исключены. Данные не подтверждают выводы моделей.';
   facts.append(statusNote);
   const claims=compareHistoricalClaims(row,{archiveConflicts});
   const claimBox=document.createElement('details');
   const claimTitle=document.createElement('summary');
   claimTitle.textContent='Сверка явных утверждений · '+claims.checked+' проверено';
   claimBox.append(claimTitle);
   const claimStatus=document.createElement('p');
   claimStatus.textContent=claims.status==='NO_EXPLICIT_CLAIMS'?
    'Нет утверждений в формализованном формате. Свободный текст автоматически не оценивается.':
    'Сопоставление чисел только с указанным историческим снимком. Различие может быть округлением; это не оценка общей точности модели.';
   claimBox.append(claimStatus);
   const states={EXACT_MATCH:'Точное совпадение',NUMERIC_DIFFERENCE:'Числовое различие',
    UNKNOWN_SOURCE_OR_FIELD:'Источник или поле не сопоставлены',
    AMBIGUOUS_CLAIMS:'Несовместимые значения в одном ответе',
    SOURCE_CONFLICT:'Конфликт исходного снимка',INVALID_FORMAT:'Неверный формат'};
   for(const claim of claims.results){
    const p=document.createElement('p');p.className='apex-evidence-audit';
    p.textContent=claim.role+' · '+states[claim.state]+
     (claim.sourceId?'\n'+claim.field+' · '+claim.sourceId+'\nУтверждение: '+claim.claimed:'')+
     (claim.observed!==undefined?'\nВ источнике: '+claim.observed:'');
    claimBox.append(p);
   }
   details.append(title,note,facts,claimBox,body);list.append(details);
  }
 };
 const ingest=sessions=>{
  const result=appendResearchArchive(store,rows,sessions,now());
  rows=result.rows;saved=result.ok;saveIssue=result.reason||'';
  render();return saved;
 };
 // Recover last on-device sessions, including older completed runs. They
 // remain history only: the live workflow's expiry and budget are unchanged.
 const recover=()=>{
  let sessions=[];
  try{const s=JSON.parse(store?.getItem('apex.collective.research.v1')||'null');if(s)sessions.push(s);}catch{}
  try{const b=JSON.parse(store?.getItem('apex.ai.batch.v1')||'null');sessions.push(...batchTranscripts(b));}catch{}
  if(sessions.length)ingest(sessions);else render();
 };
 picker.addEventListener('change',()=>{visible=8;knowledgeVisible=12;signature='';render();});
 feedbackMore?.addEventListener('click',()=>{feedbackVisible+=8;renderFeedback();});
 reviewMore?.addEventListener('click',()=>{reviewVisible+=8;renderFeedback();});
 knowledgeSource?.addEventListener('change',()=>{knowledgeVisible=12;renderKnowledge();});
 knowledgeMore?.addEventListener('click',()=>{knowledgeVisible+=12;renderKnowledge();});
 limit.addEventListener('click',()=>{visible+=8;render();});
 recover();
 return {ingest,render,getRows:()=>rows.slice(),
  exportArchive:()=>{
   const reviews=readFeedbackJournal(store);
   if(reviews===null)throw Error('Журнал проверок недоступен; экспорт остановлен, данные не изменены.');
   return {version:1,rows:rows.slice(),feedback:{version:1,reviews}};
  },
  importArchive:archive=>{
   const valid=validateTranscriptArchive(archive,now());
   if(!valid)return {ok:false,reason:'INVALID_TRANSCRIPT_ARCHIVE'};
   let feedback=null;
   if(Object.hasOwn(archive,'feedback')){
    const previous=readFeedbackJournal(store);
    if(previous===null)return {ok:false,reason:'FEEDBACK_STORAGE'};
    feedback=mergeFeedbackArchives(previous,archive.feedback);
    if(!feedback.ok)return feedback;
   }
   const merged=mergeTranscripts(rows,valid.rows,now());
   // Do not silently evict existing history during a restore. Ask the user
   // to keep the original file if combined storage exceeds the bounded archive.
   const expected=new Set([...rows,...valid.rows].map(x=>x.id)).size;
   if(merged.length<expected)return {ok:false,reason:'ARCHIVE_CAPACITY'};
   for(const incoming of valid.rows){
    const old=rows.find(x=>x.id===incoming.id);
    if(old&&(old.analystText!==incoming.analystText||
      JSON.stringify(old.evidence)!==JSON.stringify(incoming.evidence)||
      old.stage==='COMPLETE'&&incoming.stage==='COMPLETE'&&
      (old.criticText!==incoming.criticText||old.criticAt!==incoming.criticAt||
       JSON.stringify(old.criticEvidence)!==JSON.stringify(incoming.criticEvidence))))
      return {ok:false,reason:'ARCHIVE_CONFLICT'};
   }
   if(!writeTranscripts(store,merged))return {ok:false,reason:'LOCAL_STORAGE'};
   rows=merged;saved=true;saveIssue='';
   if(feedback){
    try{
     const raw=JSON.stringify(feedback.archive);
     store.setItem(FEEDBACK_JOURNAL_KEY,raw);
     if(store.getItem(FEEDBACK_JOURNAL_KEY)!==raw)throw Error('unconfirmed write');
    }catch{render();return {ok:false,reason:'FEEDBACK_STORAGE',partial:true};}
   }
   render();
   return {ok:true,count:rows.length,feedbackCount:feedback?.archive.reviews.length??null};
  }};
}
