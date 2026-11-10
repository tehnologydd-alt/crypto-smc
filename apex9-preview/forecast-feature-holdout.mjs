/**
 * APEX Feature Holdout Lab v1 — observation-only, fixed temporal audit.
 * It DOES NOT fit a model, rank assets, recommend trades or claim accuracy.
 * One asset per run: horizons and overlapping events are never pooled.
 * Reference uses earlier 60% of PUBLISHED plans, not outcome-selected rows.
 * The reference is purged wherever its full horizon overlaps holdout start.
 */
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';
import {inspectEvidenceContext} from './forecast-evidence-context.mjs';

export const FEATURE_HOLDOUT_VERSION='APEX_FEATURE_HOLDOUT_V1';
export const FEATURE_HOLDOUT_RULES=Object.freeze({
 referenceFraction:.6,minPublished:30,minGroup:12,
 perAssetOnly:true,outcomes:['TP3','STOP'],
 partition:'CHRONOLOGICAL_60_40',
 embargo:'PURGE_REFERENCE_FULL_FORECAST_HORIZON',
 source:'COMPLETE_LOCAL_ROOM_ASSET_ARCHIVE'
});
export const FEATURE_DEFINITIONS=Object.freeze([
 {id:'sameRadar',label:'Радар своего ТФ · согласован'},
 {id:'higherRadar',label:'Радар старшего ТФ · согласован'},
 {id:'marketDay',label:'Изменение Spot 24ч · согласовано'},
 {id:'visibleDepth',label:'Видимый стакан · согласован'}
]);
const HIGHER=Object.freeze({'15m':'1h','1h':'4h','4h':'1d'});
const FRAMES=['15m','1h','4h'];
const stamp=x=>Number.isSafeInteger(x)&&x>0;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const emptyGroup=()=>({yes:{tp3:0,stop:0},no:{tp3:0,stop:0},
 unavailable:0});
const sampleCount=group=>group.tp3+group.stop;
const rate=group=>sampleCount(group)?group.tp3/sampleCount(group):null;
function directionOf(radar,frame){
 const item=radar?.[frame];
 if(item?.state!=='OBSERVED'||item.mode!=='DIRECTIONAL'||
  !['UP','DOWN'].includes(item.direction))return null;
 return item.direction;
}
export function observedFeatureMatch(evidence,frame,side,id){
 if(evidence?.state!=='VERIFIED'||!FRAMES.includes(frame)||
  !['UP','DOWN'].includes(side))return null;
 if(id==='sameRadar'||id==='higherRadar'){
  const timeframe=id==='sameRadar'?frame:HIGHER[frame];
  const direction=directionOf(evidence.radar,timeframe);
  return direction===null?null:direction===side;
 }
 if(id==='marketDay'){
  const market=evidence.feeds?.market;
  if(market?.state!=='OBSERVED')return null;
  const change=market.features?.changePercent24h;
  if(typeof change!=='number'||!Number.isFinite(change)||change===0)return null;
  return (change>0)===(side==='UP');
 }
 if(id==='visibleDepth'){
  const depth=evidence.feeds?.liquidity;
  if(depth?.state!=='OBSERVED')return null;
  const value=depth.features?.visibleDepthImbalance;
  // A 10% imbalance is a PREDECLARED descriptive cutoff, not fitted.
  if(typeof value!=='number'||!Number.isFinite(value)||
   Math.abs(value)<.1)return null;
  return (value>0)===(side==='UP');
 }
 return null;
}
function oneFrame(row){
 if(multiFrameHypothesis(row)&&['15m','4h'].includes(row.interval))
  return row.interval;
 if(directionalHypothesis(row)&&row.interval==='1h')return '1h';
 return null;
}
function verified(row,frame,now){
 return frame==='1h'?verifiedDirectionalEvidence(row,{now}):
  multiFrameEvidence(row,{now});
}
function segment(rows,{now,referenceCutoff=null}={}){
 const counters={candidates:rows.length,nonoverlap:0,
  overlapExcluded:0,invalid:0,awaiting:0,other:0,decisive:0,
  legacy:0,contextInvalid:0,lateReference:0};
 const features=Object.fromEntries(FEATURE_DEFINITIONS.map(f=>
  [f.id,emptyGroup()]));
 let blockedUntil=-Infinity;
 for(const row of rows){
  const frame=oneFrame(row);
  const result=verified(row,frame,now);
  const plan=result.plan;
  if(result.state!=='OBSERVED'||!plan||
    !stamp(plan.targetCloseAt)||plan.targetCloseAt<=row.publishedAt){
   counters.invalid++;continue;
  }
  if(row.publishedAt<=blockedUntil){
   counters.overlapExcluded++;continue;
  }
  // Selection is decided before checking outcomes or feature availability.
  blockedUntil=plan.targetCloseAt;
  counters.nonoverlap++;
  if(!result.finished){counters.awaiting++;continue;}
  if(referenceCutoff!==null&&
    (!stamp(row.evaluation?.evaluatedAt)||
     row.evaluation.evaluatedAt>=referenceCutoff)){
   counters.lateReference++;continue;
  }
  if(result.outcome!=='TP3'&&result.outcome!=='STOP'){
   counters.other++;continue;
  }
  counters.decisive++;
  const evidence=inspectEvidenceContext(row);
  if(evidence.state==='LEGACY'){counters.legacy++;continue;}
  if(evidence.state!=='VERIFIED'){counters.contextInvalid++;continue;}
  for(const definition of FEATURE_DEFINITIONS){
   const observed=observedFeatureMatch(evidence,frame,result.plan.side,definition.id);
   const cohort=features[definition.id];
   if(observed===null){cohort.unavailable++;continue;}
   const arm=observed?cohort.yes:cohort.no;
   arm[result.outcome==='TP3'?'tp3':'stop']++;
  }
 }
 return {counters,features};
}
function compareFeature(def,reference,holdout){
 const a=reference.features[def.id],b=holdout.features[def.id];
 const result={id:def.id,label:def.label,reference:a,holdout:b,
  state:'INSUFFICIENT',referenceGapPp:null,holdoutGapPp:null,
  note:'Нет достаточных раздельных групп. Нельзя делать выводы.'};
 const n=[sampleCount(a.yes),sampleCount(a.no),
  sampleCount(b.yes),sampleCount(b.no)];
 if(n.some(x=>x<FEATURE_HOLDOUT_RULES.minGroup))return result;
 const refGap=100*(rate(a.yes)-rate(a.no));
 const testGap=100*(rate(b.yes)-rate(b.no));
 return {...result,state:'DESCRIPTIVE',
  referenceGapPp:refGap,holdoutGapPp:testGap,
  note:'Разница долей исхода TP3 среди TP3/SL. '+ 
   'Не означает причинность, статистическую независимость или прибыль.'};
}
function resultFrame(rows,frame,{now}){
 const ordered=rows.filter(x=>oneFrame(x)===frame)
  .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
 const all={frame,published:ordered.length,state:'INSUFFICIENT',
  reason:null,reference:null,holdout:null,splitAt:null,purged:0,
  features:[],minGroup:FEATURE_HOLDOUT_RULES.minGroup};
 if(ordered.length<FEATURE_HOLDOUT_RULES.minPublished)
  return {...all,reason:'Менее 30 опубликованных прогнозов этого ТФ'};
 const splitIndex=Math.floor(ordered.length*FEATURE_HOLDOUT_RULES.referenceFraction);
 const splitAt=ordered[splitIndex]?.publishedAt;
 if(!stamp(splitAt)||splitAt<=ordered[splitIndex-1].publishedAt)
  return {...all,state:'INVALID',reason:'Нет строгой временной границы между участками'};
 const older=ordered.slice(0,splitIndex);
 // Purge is based solely on IMMUTABLE published target horizon, not outcome.
 const eligible=[],purged=[];
 for(const row of older){
  let h;
  try{h=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
  catch{h=null;}
  if(!stamp(h?.targetCloseAt)||h.targetCloseAt>=splitAt)purged.push(row);
  else eligible.push(row);
 }
 const reference=segment(eligible,{now,referenceCutoff:splitAt});
 const holdout=segment(ordered.slice(splitIndex),{now});
 const features=FEATURE_DEFINITIONS.map(d=>compareFeature(d,reference,holdout));
 const viable=features.filter(x=>x.state==='DESCRIPTIVE').length;
 return {...all,state:viable?'DESCRIPTIVE':'INSUFFICIENT',
  reason:viable?null:'Нужны минимум 12 TP3/SL в каждой группе в обоих периодах',
  splitAt,purged:purged.length,reference,holdout,features};
}
/**
 * Accepts ONLY a complete, source-checked Room archive for ONE selected asset.
 * Refuses to count truncated recent-75 journals, changed pagination and mocks
 * that do not match the source-reported archive size.
 */
export function analyzeForecastFeatureHoldout(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const blocked=(state,reason)=>({version:FEATURE_HOLDOUT_VERSION,
  state,reason,asset,frames:null,rules:FEATURE_HOLDOUT_RULES});
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset)||
  !stamp(now)||!Array.isArray(rows)||
  rows.some(row=>row?.asset!==asset||typeof row?.id!=='string'||
   !row.id||!stamp(row.publishedAt)||row.publishedAt>now+60000))
  return blocked('INVALID','Некорректный актив или временные отметки журнала');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return blocked('INCOMPLETE','Нужен полный постраничный архив Room');
 if(new Set(rows.map(x=>x.id)).size!==rows.length)
  return blocked('INVALID','Дублирующиеся идентификаторы в журнале');
 const frames=Object.fromEntries(FRAMES.map(tf=>[tf,
  resultFrame(rows,tf,{now})]));
 const ready=Object.values(frames).filter(x=>x.state==='DESCRIPTIVE').length;
 return {version:FEATURE_HOLDOUT_VERSION,
  state:ready?'DESCRIPTIVE':'INSUFFICIENT',
  reason:ready?null:'Недостаточно сопоставимых завершённых наблюдений',
  asset,archiveRows:rows.length,frames,readyFrames:ready,
  note:'Историческое сопоставление, а не обучение или доказанный прирост точности. '+
   'TP3 и SL не являются доходностью сделок. Разные источники рынка зависимы. '+
   'Нельзя использовать показатели как уверенность или торговую рекомендацию.',
  rules:FEATURE_HOLDOUT_RULES};
}
