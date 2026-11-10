/**
 * APEX Feature Ablation V1: explanatory forward-only research.
 * All scoring recipes were FIXED before observing outcomes. This is
 * NOT a fitted learner, calibrated probability or trading decision.
 *
 * A feature adds descriptive value only if the FULL fixed ranking score
 * outperforms the same score WITHOUT that feature on exactly the same
 * independent TP3/STOP observations, in BOTH chronological windows.
 * Does not prove causation, profitability, significance or future accuracy.
 */
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';

export const FEATURE_ABLATION_VERSION='APEX_FROZEN_FEATURE_ABLATION_V1';
export const FEATURE_ABLATION_RULES=Object.freeze({
 split:0.60,minScored:80,minDecisivePerWindow:24,
 minPerClass:8,minVolumeAvailability:0.70,
 positiveDeltaAuc:0.03,negativeDeltaAuc:-0.03,
 event:'TP3_VS_STOP_CONDITIONAL_ON_TERMINAL_OUTCOMES',
 source:'COMPLETE_LOCAL_ROOM_AS_OF_PUBLICATION',
 automaticTraining:false,calibratedProbability:null
});
export const FROZEN_FEATURES=Object.freeze([
 Object.freeze({key:'efficiency',weight:.5,label:'Эффективность движения'}),
 Object.freeze({key:'travelNorm',weight:.3,label:'Сила импульса'}),
 Object.freeze({key:'volumeNorm',weight:.2,label:'Относительный объём'})
]);
const FRAMES=['15m','1h','4h'];
const time=x=>Number.isSafeInteger(x)&&x>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
export const featureFrameOf=row=>{
 if(multiFrameHypothesis(row)&&['15m','4h'].includes(row.interval))
  return row.interval;
 if(directionalHypothesis(row)&&row.interval==='1h')return '1h';
 return null;
};
const blank=()=>({published:0,eligible:0,nonoverlap:0,decisive:0,
 tp3:0,stop:0,other:0,awaiting:0,missingVolume:0,
 lateRecorded:0,purged:0,overlap:0,invalid:0,legacyH1:0,
 volumeCoverage:null});
const no=(state,reason,more={})=>({state,reason,features:[],...more});

/** Mann–Whitney / ROC AUC with exact score ties; ranks, not probabilities. */
export function rankingAuc(rows,score){
 if(!Array.isArray(rows)||rows.length<2||
  rows.some(x=>x?.outcome!=='TP3'&&x?.outcome!=='STOP'))return null;
 const sorted=rows.map(x=>({y:x.outcome==='TP3'?1:0,v:score(x)}));
 if(sorted.some(x=>!finite(x.v)))return null;
 const positive=sorted.filter(x=>x.y).length;
 const negative=sorted.length-positive;
 if(!positive||!negative)return null;
 sorted.sort((a,b)=>a.v-b.v);
 let wins=0,negativeBelow=0;
 for(let i=0;i<sorted.length;){
  let j=i,groupPositive=0,groupNegative=0;
  while(j<sorted.length&&sorted[j].v===sorted[i].v){
   if(sorted[j].y)groupPositive++;
   else groupNegative++;
   j++;
  }
  wins+=groupPositive*negativeBelow+
   .5*groupPositive*groupNegative;
  negativeBelow+=groupNegative;i=j;
 }
 return wins/(positive*negative);
}
export function frozenRankScore(features,omitted=null){
 if(!features||typeof features!=='object')return null;
 let sum=0,weights=0;
 for(const feature of FROZEN_FEATURES){
  if(feature.key===omitted)continue;
  const value=features[feature.key];
  if(!finite(value)||value<0||value>1)return null;
  sum+=value*feature.weight;weights+=feature.weight;
 }
 return weights>0?sum/weights:null;
}
export function featureWindowAudit(rows,{now,cutAt=null}){
 const metrics=blank(),samples=[];
 let occupied=-Infinity,validVolume=0;
 const sorted=rows.slice().sort((a,b)=>a.publishedAt-b.publishedAt||
  a.id.localeCompare(b.id));
 metrics.published=sorted.length;
 for(const row of sorted){
  const frozen=inspectPreOutcomeStrength(row);
  if(frozen.state!=='VERIFIED'){metrics.invalid++;continue;}
  const source=featureFrameOf(row)==='1h'?
   verifiedDirectionalEvidence(row,{now}):multiFrameEvidence(row,{now});
  if(source.state!=='OBSERVED'||!source.plan){
   metrics.invalid++;continue;
  }
  if(featureFrameOf(row)==='1h'&&source.source!=='M5'){
   metrics.legacyH1++;continue;
  }
  const target=source.plan.targetCloseAt;
  if(!time(target)||target<=row.publishedAt){
   metrics.invalid++;continue;
  }
  // Select only by precommitted publication and horizon, never by outcome.
  if(row.publishedAt<=occupied){metrics.overlap++;continue;}
  occupied=target;
  if(cutAt!==null&&target>=cutAt){metrics.purged++;continue;}
  metrics.eligible++;
  if(frozen.features.volumeAvailable)validVolume++;
  if(!source.finished){metrics.awaiting++;continue;}
  const recorded=row.evaluation?.evaluatedAt;
  if(!time(recorded)||recorded>now+60_000||
   !Array.isArray(row.stageEvents)){
   metrics.invalid++;continue;
  }
  if(cutAt!==null&&(recorded>=cutAt||
   row.stageEvents.some(e=>e?.recordedAt>=cutAt))){
   metrics.lateRecorded++;continue;
  }
  if(source.outcome!=='TP3'&&source.outcome!=='STOP'){
   metrics.other++;continue;
  }
  if(!frozen.features.volumeAvailable){
   metrics.missingVolume++;continue;
  }
  metrics.decisive++;
  if(source.outcome==='TP3')metrics.tp3++;
  else metrics.stop++;
  samples.push({id:row.id,publishedAt:row.publishedAt,
   outcome:source.outcome,features:frozen.features});
 }
 metrics.volumeCoverage=metrics.eligible?
  validVolume/metrics.eligible:null;
 return {metrics,samples};
}
function examine(reference,recent){
 const pre=reference.metrics,post=recent.metrics;
 if(pre.invalid||post.invalid)
  return no('INVALID_EVIDENCE',
   'Непроверенные опубликованные признаки или события Room: сравнение заблокировано.');
 if(pre.volumeCoverage<FEATURE_ABLATION_RULES.minVolumeAvailability||
  post.volumeCoverage<FEATURE_ABLATION_RULES.minVolumeAvailability)
  return no('LOW_COVERAGE',
   'Недостаточно наблюдений с достоверным объёмом в обоих периодах.');
 if([pre,post].some(x=>x.decisive<FEATURE_ABLATION_RULES.minDecisivePerWindow||
   x.tp3<FEATURE_ABLATION_RULES.minPerClass||
   x.stop<FEATURE_ABLATION_RULES.minPerClass))
  return no('COLLECTING',
   'Нужно ≥24 TP3/SL и ≥8 каждого исхода в каждом периоде.');
 const score=x=>frozenRankScore(x.features);
 const fullRef=rankingAuc(reference.samples,score);
 const fullLate=rankingAuc(recent.samples,score);
 if(fullRef===null||fullLate===null)
  return no('COLLECTING','Нет сопоставимых исходов в обоих периодах.');
 const features=FROZEN_FEATURES.map(def=>{
  const without=x=>frozenRankScore(x.features,def.key);
  const isolated=x=>x.features[def.key];
  const onlyRef=rankingAuc(reference.samples,isolated);
  const onlyLate=rankingAuc(recent.samples,isolated);
  const baseRef=rankingAuc(reference.samples,without);
  const baseLate=rankingAuc(recent.samples,without);
  const deltaRef=fullRef-baseRef,deltaLate=fullLate-baseLate;
  // Predeclared *descriptive* signs, never a test-time weight search.
  const positive=FEATURE_ABLATION_RULES.positiveDeltaAuc;
  const negative=FEATURE_ABLATION_RULES.negativeDeltaAuc;
  const state=deltaLate<=negative?'POSSIBLE_HARM':
   deltaRef>=positive&&deltaLate>=positive?'REPEATED_ADDED_VALUE':
   deltaRef>=positive&&deltaLate<positive?'NOT_REPEATED':
   deltaLate>=positive?'LATE_ONLY':'NO_ADDED_VALUE';
  return {
   key:def.key,label:def.label,weight:def.weight,state,
   isolatedAuc:{reference:onlyRef,late:onlyLate},
   withoutAuc:{reference:baseRef,late:baseLate},
   fullAuc:{reference:fullRef,late:fullLate},
   deltaAuc:{reference:deltaRef,late:deltaLate},
   note:'ΔAUC полного фиксированного балла против балла без признака '+
    'на ТЕХ ЖЕ наблюдениях. Это описательная зависимость, не значимость.'
  };
 });
 return {state:'DESCRIPTIVE',
  reason:'Сравнены фиксированные модели с признаком и без него на одинаковых исходах.',
  features,referenceFullAuc:fullRef,lateFullAuc:fullLate};
}
export function auditFeatureContribution(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const fail=(state,reason)=>({
  version:FEATURE_ABLATION_VERSION,state,reason,asset,
  frames:null,trained:false,calibratedProbability:null});
 if(!validAsset(asset)||!time(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||!x.id||
   !time(x.publishedAt)||x.publishedAt>now+60_000))
  return fail('INVALID','Некорректные записи или выбранный актив.');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return fail('INCOMPLETE','Требуется полный архив Room одного избранного актива.');
 if(new Set(rows.map(x=>x.id)).size!==rows.length)
  return fail('INVALID','Повторяющиеся идентификаторы Room.');
 const frames={};
 for(const tf of FRAMES){
  const items=rows.filter(x=>featureFrameOf(x)===tf)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  const eligible=items.filter(x=>
   inspectPreOutcomeStrength(x).state==='VERIFIED');
  const invalidScores=items.filter(x=>
   inspectPreOutcomeStrength(x).state==='INVALID').length;
  const base={
   interval:tf,oldWithoutScores:items.length-eligible.length-invalidScores,
   invalidScores,newScores:eligible.length,reference:null,recent:null,
   features:[],state:'COLLECTING',cutAt:null,
   reason:'Нужно не менее 80 новых прогнозов с заранее зафиксированными признаками.',
   calibratedProbability:null,modelChanged:false
  };
  if(invalidScores){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'В Room обнаружены несогласованные баллы: анализ приостановлен.'};
   continue;
  }
  if(eligible.length<FEATURE_ABLATION_RULES.minScored){
   frames[tf]=base;continue;
  }
  const split=Math.floor(eligible.length*FEATURE_ABLATION_RULES.split);
  const cutAt=eligible[split]?.publishedAt;
  if(!time(cutAt)||cutAt<=eligible[split-1].publishedAt){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Не удалось разбить публикации на непересекающиеся временные выборки.'};
   continue;
  }
  const reference=featureWindowAudit(eligible.slice(0,split),{now,cutAt});
  const recent=featureWindowAudit(eligible.slice(split),{now});
  const result=examine(reference,recent);
  frames[tf]={...base,...result,cutAt,
   reference:reference.metrics,recent:recent.metrics,
   calibratedProbability:null,modelChanged:false};
 }
 return {
  version:FEATURE_ABLATION_VERSION,state:Object.values(frames).some(x=>
   x.state==='DESCRIPTIVE')?'DESCRIPTIVE':'COLLECTING',
  asset,frames,rules:FEATURE_ABLATION_RULES,
  trained:false,calibratedProbability:null,
  note:'Рейтинг AUC проверяет только различение TP3/SL и не является '+
   'вероятностью успеха. Ограниченные выборки и корреляция цен могут '+
   'искажать сравнение; эффект нельзя считать причинным. '+
   'Никакие веса, прогнозы и ордера не изменяются.'
 };
}
