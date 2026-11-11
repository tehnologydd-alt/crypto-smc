/**
 * APEX M1-only post-publication research cohort.
 * Never relabels legacy M5 events, mixes H1/M15/H4 horizons, fits models,
 * publishes predictions or interprets TP3 touches as executed trades.
 * Selection/embargo precedes outcome inspection. Observation-only.
 */
import {featureFrameOf} from './forecast-feature-ablation.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameEvidence} from './forecast-multiframe.mjs';
import {inspectEvidenceContext} from './forecast-evidence-context.mjs';
import {FEATURE_DEFINITIONS,observedFeatureMatch}
 from './forecast-feature-holdout.mjs';

export const M1_COHORT_VERSION='APEX_M1_COHORT_V1';
export const M1_COHORT_RULES=Object.freeze({
 registeredAt:Date.UTC(2026,10,11,0,0,0),
 split:.6,minPublished:30,minPerArm:12,
 periods:Object.freeze(['reference','holdout']),
 frames:Object.freeze(['15m','1h','4h']),
 evaluation:'CLOSED_M1_ONLY',noBackfill:true,
 noTraining:true,calibratedProbability:null
});
const frames=M1_COHORT_RULES.frames;
const time=x=>Number.isSafeInteger(x)&&x>0;
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const outcomes=['TP3','STOP','AMBIGUOUS','HORIZON','NOT_ENTERED'];
const fresh=()=>({published:0,verified:0,overlap:0,purged:0,
  incomplete:0,invalid:0,late:0,awaiting:0,other:0,decisive:0,
  tp3:0,stop:0,observedContexts:0,legacyContexts:0,invalidContexts:0,
  features:Object.fromEntries(FEATURE_DEFINITIONS.map(f=>[
   f.id,{yes:{tp3:0,stop:0},no:{tp3:0,stop:0},missing:0}]))});
const count=arm=>arm.tp3+arm.stop;
const fail=(state,reason,asset)=>({version:M1_COHORT_VERSION,asset,
 state,reason,frames:null,legacyM5:null,rules:M1_COHORT_RULES});
function parse(row){
 try{return typeof row?.hypothesis==='string'?
  JSON.parse(row.hypothesis):row?.hypothesis;}catch{return null;}
}
const methodOf=row=>{
 const h=parse(row);
 return h?.evaluationInterval==='1m'?'M1':
  h?.evaluationInterval==='5m'?'M5':
  h?.evaluationInterval==='1h'?'H1_LEGACY':'OTHER';
};
function evaluate(row,tf,now){
 return tf==='1h'?verifiedDirectionalEvidence(row,{now}):
  multiFrameEvidence(row,{now});
}
function scan(rows,tf,{now,cutAt=null}){
 const out=fresh();
 let occupied=-Infinity;
 for(const row of rows){
  out.published++;
  const result=evaluate(row,tf,now);
  if(result.state!=='OBSERVED'||!result.plan){
   out.invalid++;continue;
  }
  if(tf==='1h'&&result.source!=='M1'||
    result.plan.evaluationInterval!=='1m'){
   out.invalid++;continue;
  }
  const target=result.plan.targetCloseAt;
  if(!time(target)||target<=row.publishedAt){
   out.invalid++;continue;
  }
  if(row.publishedAt<=occupied){out.overlap++;continue;}
  occupied=target;
  if(cutAt!==null&&target>=cutAt){out.purged++;continue;}
  out.verified++;
  const evidence=inspectEvidenceContext(row);
  if(evidence.state==='VERIFIED')out.observedContexts++;
  else if(evidence.state==='LEGACY')out.legacyContexts++;
  else out.invalidContexts++;
  if(!result.finished){out.awaiting++;continue;}
  if(cutAt!==null&&
    (!time(row.evaluation?.evaluatedAt)||
     row.evaluation.evaluatedAt>=cutAt||
     row.stageEvents?.some(x=>x?.recordedAt>=cutAt))){
    out.late++;continue;
  }
  if(!outcomes.includes(result.outcome)){out.invalid++;continue;}
  if(!['TP3','STOP'].includes(result.outcome)){out.other++;continue;}
  out.decisive++;
  if(result.outcome==='TP3')out.tp3++;else out.stop++;
  for(const f of FEATURE_DEFINITIONS){
   const match=observedFeatureMatch(evidence,tf,result.plan.side,f.id);
   const group=out.features[f.id];
   if(match===null){group.missing++;continue;}
   group[match?'yes':'no'][result.outcome==='TP3'?'tp3':'stop']++;
  }
 }
 return out;
}
function compare(early,late){
 return FEATURE_DEFINITIONS.map(f=>{
  const a=early.features[f.id],b=late.features[f.id];
  const counts=[count(a.yes),count(a.no),count(b.yes),count(b.no)];
  if(counts.some(n=>n<M1_COHORT_RULES.minPerArm))
   return {id:f.id,label:f.label,state:'COLLECTING',
    sampleSizes:counts,referenceGapPp:null,holdoutGapPp:null};
  const gap=x=>100*(x.yes.tp3/count(x.yes)-x.no.tp3/count(x.no));
  return {id:f.id,label:f.label,state:'DESCRIPTIVE',
   sampleSizes:counts,referenceGapPp:gap(a),holdoutGapPp:gap(b)};
 });
}
export function auditM1Cohort(archive,{asset,now=Date.now()}={}){
 if(!assetOK(asset)||!time(now))return fail('INVALID','Неверный актив/время',asset);
 if(archive?.complete!==true||!Array.isArray(archive.forecasts)||
    !Number.isSafeInteger(archive.publishedCount)||
    archive.publishedCount!==archive.forecasts.length||
    archive.forecasts.length>1500)
  return fail('INCOMPLETE','Требуется полный Room-архив',asset);
 const ids=new Set();
 for(const row of archive.forecasts){
  if(row?.asset!==asset||typeof row.id!=='string'||!row.id||
    ids.has(row.id)||!time(row.publishedAt)||row.publishedAt>now+60000)
   return fail('INVALID','Повторяющаяся или повреждённая публикация',asset);
  ids.add(row.id);
 }
 const legacyM5={};
 const result={};
 for(const frame of frames){
  const entries=archive.forecasts.filter(row=>featureFrameOf(row)===frame);
  legacyM5[frame]=entries.filter(row=>methodOf(row)==='M5').length;
  const m1=entries.filter(row=>methodOf(row)==='M1');
  const forward=m1.filter(row=>row.publishedAt>M1_COHORT_RULES.registeredAt)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  const excluded=m1.length-forward.length;
  const baseline={state:'COLLECTING',publishedM1:m1.length,
   publishedForward:forward.length,preRegistrationExcluded:excluded,
   comparison:null,reference:null,holdout:null,cutAt:null,
   reason:'Требуется минимум 30 новых M1-публикаций и раздельные группы.'};
  if(forward.length<M1_COHORT_RULES.minPublished){
   result[frame]=baseline;continue;
  }
  const pivot=Math.floor(forward.length*M1_COHORT_RULES.split);
  const cutAt=forward[pivot]?.publishedAt;
  if(!time(cutAt)||cutAt<=forward[pivot-1]?.publishedAt){
   result[frame]={...baseline,state:'CHECK_DATA',
    reason:'Невозможно разделить M1 по времени'};continue;
  }
  const reference=scan(forward.slice(0,pivot),frame,{now,cutAt});
  const holdout=scan(forward.slice(pivot),frame,{now});
  const comparison=compare(reference,holdout);
  const state=reference.invalid||holdout.invalid?'CHECK_DATA':
   comparison.some(f=>f.state==='DESCRIPTIVE')?'DESCRIPTIVE':'COLLECTING';
  result[frame]={...baseline,state,reference,holdout,comparison,cutAt,
   reason:state==='DESCRIPTIVE'?
    'Независимые по времени выборки; описательная связь не причинна':
    'Недостаточно непересекающихся проверенных M1-исходов'};
 }
 return {version:M1_COHORT_VERSION,asset,archiveRows:archive.forecasts.length,
  state:Object.values(result).some(f=>f.state==='CHECK_DATA')?'CHECK_DATA':
   Object.values(result).some(f=>f.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  frames:result,legacyM5,
  note:'TP3 и STOP — исходы исследовательских уровней, не сделки. '+
   'M5 и M1 никогда не объединяются. Ассоциация не доказывает точность API.',
  rules:M1_COHORT_RULES};
}
