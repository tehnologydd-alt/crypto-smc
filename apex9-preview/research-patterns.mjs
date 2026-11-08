/**
 * APEX Research Patterns — comparison of real, forward-published 4H-H1
 * research outcomes. Never predicts prices, suggests orders or invents data.
 *
 * Categories are fixed before looking at observed outcomes, mutually
 * exclusive and based ONLY on original ranges and five real closed bars.
 */
import {inspectOutcomeRow} from './evidence-lab.mjs';
import {buildScenarioReplay} from './scenario-replay.mjs';
const H=3600000;
export const PATTERN_RULES=Object.freeze({
 minComparisons:36,folds:3,minPerFold:12,horizonHours:4
});
export const PATTERN_KINDS=Object.freeze([
 {id:'STAYED_INSIDE',label:'Все 4 закрытия внутри'},
 {id:'RETURNED_INSIDE',label:'Выход и возврат внутрь'},
 {id:'FINISHED_OUTSIDE',label:'Итоговое закрытие снаружи'}
]);
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const makeCounts=()=>Object.fromEntries(PATTERN_KINDS.map(p=>[p.id,0]));
const initial=(state,asset,reason)=>({
 state,asset,reason,loadedForAsset:0,totalPublished:null,truncated:false,
 counts:{evaluated:0,awaiting:0,dueMissing:0,invalid:0,
  missingCandles:0,conflictingSource:0,overlapping:0,accepted:0},
 overall:null,periods:[],patterns:[],firstAt:null,lastAt:null,
 rules:PATTERN_RULES
});
export function classifyResearchPath(replay){
 if(!replay||replay.state!=='COMPLETE'||replay.points?.length!==5||
  !replay.points.every(p=>p.state==='OBSERVED'||p.index===0&&p.state==='OBSERVED'))
  return null;
 const future=replay.points.slice(1);
 if(future.some(p=>typeof p.inside!=='boolean'))return null;
 if(future[3].inside===false)return 'FINISHED_OUTSIDE';
 if(future.slice(0,3).some(p=>p.inside===false))return 'RETURNED_INSIDE';
 return 'STAYED_INSIDE';
}
export function compareCompletedResearch(rows,candles,{
 asset,now=Date.now(),totalPublished=null
}={}){
 const response=initial('INVALID',asset,'Ошибка исходных параметров');
 if(!validAsset(asset)||!validTime(now)||!Array.isArray(rows)||
  !Array.isArray(candles))return response;
 const knownTotal=Number.isSafeInteger(totalPublished)&&totalPublished>=rows.length?
  totalPublished:null;
 const target=rows.filter(x=>x?.asset===asset);
 const result=initial('INSUFFICIENT',asset,'Недостаточно завершённых исследований');
 result.totalPublished=knownTotal;
 result.loadedForAsset=target.length;
 result.truncated=knownTotal!==null&&knownTotal>rows.length;
 const ids=new Set(),candidates=[];
 for(const row of [...target].sort((a,b)=>(a?.publishedAt||0)-(b?.publishedAt||0))){
  if(typeof row?.id!=='string'||ids.has(row.id)){
   result.counts.invalid++;continue;
  }
  ids.add(row.id);
  const checked=inspectOutcomeRow(row,{now});
  if(checked.state==='INVALID'){
   result.counts.invalid++;continue;
  }
  if(checked.state==='AWAITING'){
   result.counts.awaiting++;continue;
  }
  if(checked.state==='DUE_UNEVALUATED'){
   result.counts.dueMissing++;continue;
  }
  if(checked.state!=='EVALUATED'){
   result.counts.invalid++;continue;
  }
  result.counts.evaluated++;
  let h;
  try{h=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
  catch{result.counts.invalid++;continue;}
  const replay=buildScenarioReplay({
   id:row.id,asset,anchorCloseAt:h.anchorCloseAt,
   targetCloseAt:h.targetCloseAt,anchorClose:h.anchorClose,
   bandLow:h.bandLow,bandHigh:h.bandHigh,
   milestones:[],result:row.evaluation
  },candles,{now});
  if(replay.state==='RESULT_CONFLICT'||replay.state==='SOURCE_CONFLICT'||
   replay.state==='ANCHOR_MISMATCH'||replay.state==='INVALID'){
   result.counts.conflictingSource++;continue;
  }
  if(replay.state!=='COMPLETE'){
   result.counts.missingCandles++;continue;
  }
  // Explicitly cross-check the final actual price with immutable outcome:
  // a Room outcome alone is never sufficient to classify intrahorizon motion.
  const close=replay.points[4].close;
  const actual=row.evaluation.actualClose;
  if(!Number.isFinite(close)||!Number.isFinite(actual)||
    Math.abs(close-actual)/Math.max(close,actual)>1e-6){
   result.counts.conflictingSource++;continue;
  }
  const kind=classifyResearchPath(replay);
  if(!kind){result.counts.invalid++;continue;}
  candidates.push({
   kind,anchorCloseAt:h.anchorCloseAt,targetCloseAt:h.targetCloseAt,
   publishedAt:row.publishedAt,id:row.id
  });
 }
 candidates.sort((a,b)=>a.targetCloseAt-b.targetCloseAt||
  a.publishedAt-b.publishedAt);
 const accepted=[];let lastTarget=0;
 for(const sample of candidates){
  // One contribution per nonoverlapping four-hour observation horizon.
  if(sample.anchorCloseAt<lastTarget){
   result.counts.overlapping++;continue;
  }
  accepted.push(sample);lastTarget=sample.targetCloseAt;
 }
 result.counts.accepted=accepted.length;
 if(accepted.length){
  result.firstAt=accepted[0].targetCloseAt;
  result.lastAt=accepted.at(-1).targetCloseAt;
 }
 const tally=group=>{
  const counts=makeCounts();
  for(const row of group)counts[row.kind]++;
  return {samples:group.length,counts,
   firstAt:group[0]?.targetCloseAt??null,
   lastAt:group.at(-1)?.targetCloseAt??null};
 };
 result.overall=tally(accepted);
 const n=accepted.length;
 if(n<PATTERN_RULES.minComparisons){
  result.reason='Для сопоставления трёх периодов необходимо не менее '+
   PATTERN_RULES.minComparisons+' неперекрывающихся завершённых исследований';
 }else{
  const size=Math.floor(n/PATTERN_RULES.folds);
  result.periods=Array.from({length:3},(_,i)=>
   tally(accepted.slice(i*size,i===2?n:(i+1)*size)));
  if(result.periods.some(p=>p.samples<PATTERN_RULES.minPerFold))
   result.reason='В одном из периодов слишком мало реальных наблюдений';
 }
 // Never infer repeatability from a selective cache, overdue experiments,
 // malformed records or unknown global journal completeness.
 const biased=result.truncated||knownTotal===null||
  result.counts.dueMissing>0||result.counts.invalid>0||
  result.counts.missingCandles>0||result.counts.conflictingSource>0;
 result.state=biased?'INCOMPLETE_EVIDENCE':
  result.periods.length===3?'DESCRIPTIVE':'INSUFFICIENT';
 if(biased)result.reason=result.truncated?
  'Журнал Room загружен частично; доли скрыты во избежание смещения выборки':
  knownTotal===null?'Неизвестна полнота журнала; доли скрыты':
  'В истории есть непроверенные или противоречивые результаты; доли скрыты';
 result.patterns=PATTERN_KINDS.map(p=>{
  const counts=result.periods.map(f=>f.counts[p.id]);
  const rates=result.state==='DESCRIPTIVE'?
   result.periods.map(f=>f.counts[p.id]/f.samples):null;
  const spread=rates?
   Math.max(...rates)-Math.min(...rates):null;
  return {id:p.id,label:p.label,count:result.overall.counts[p.id],
   periodCounts:counts,periodRates:rates,spread};
 });
 return result;
}
