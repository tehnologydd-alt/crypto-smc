/**
 * Local research transcript archive. Independent of the 24-task Director queue.
 * Historical snapshots are observations, not verified model conclusions.
 * No inference, no network, no credentials. Bounded by records AND bytes.
 */
export const HISTORY_KEY='apex.research.transcripts.v1';
export const MAX_TRANSCRIPTS=200;
const MAX_BYTES=1800000, SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
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
  if(raw.length>MAX_BYTES)return [];
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
export function validateTranscriptArchive(archive,now=Date.now()){
 if(archive?.version!==1||!Array.isArray(archive.rows)||
    archive.rows.length>MAX_TRANSCRIPTS)return null;
 try{if(new TextEncoder().encode(JSON.stringify(archive)).length>MAX_BYTES)return null;}catch{return null;}
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
 let statsSignature='';
 let rows=readTranscripts(store,now()),visible=8,signature='',saved=true;
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
   (saved?'':' · ошибка локальной записи');
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
  rows=mergeTranscripts(rows,sessions,now());
  saved=writeTranscripts(store,rows);
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
 knowledgeSource?.addEventListener('change',()=>{knowledgeVisible=12;renderKnowledge();});
 knowledgeMore?.addEventListener('click',()=>{knowledgeVisible+=12;renderKnowledge();});
 limit.addEventListener('click',()=>{visible+=8;render();});
 recover();
 return {ingest,render,getRows:()=>rows.slice(),
  exportArchive:()=>({version:1,rows:rows.slice()}),
  importArchive:archive=>{
   const valid=validateTranscriptArchive(archive,now());
   if(!valid)return {ok:false,reason:'INVALID_TRANSCRIPT_ARCHIVE'};
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
   rows=merged;saved=true;render();
   return {ok:true,count:rows.length};
  }};
}
