/**
 * APEX Rolling Feature Evidence V1 — three chronological, independent
 * observation windows for FIXED, pre-published feature recipes.
 *
 * This is a read-only robustness screen. It is NOT a calibrated forecast,
 * statistical significance test, causality result, or permission to train.
 */
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {
 FROZEN_FEATURES,featureFrameOf,featureWindowAudit,
 frozenRankScore,rankingAuc
} from './forecast-feature-ablation.mjs';

export const ROLLING_FEATURE_VERSION='APEX_FEATURE_TRIPLE_WINDOW_V1';
export const ROLLING_FEATURE_RULES=Object.freeze({
 splits:'CHRONOLOGICAL_THIRDS_OF_PUBLISHED_SCORED_ROWS',
 minScored:120,minDecisivePerWindow:20,minClassPerWindow:6,
 minVolumeCoverage:.70,positiveDeltaAuc:.03,negativeDeltaAuc:-.03,
 forecastWeightsChanged:false,autoTraining:false,
 source:'COMPLETE_LOCAL_ROOM_FROZEN_PREOUTCOME_STRENGTH'
});
const time=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const summary=x=>x?.metrics??null;
function windowReady(w){
 const x=w?.metrics;
 return x&&x.decisive>=ROLLING_FEATURE_RULES.minDecisivePerWindow&&
  x.tp3>=ROLLING_FEATURE_RULES.minClassPerWindow&&
  x.stop>=ROLLING_FEATURE_RULES.minClassPerWindow;
}
function analyzeWindows(windows){
 const metrics=windows.map(summary);
 if(metrics.some(x=>!x||x.invalid>0))
  return {state:'INVALID_EVIDENCE',reason:
   'Исходный снимок или события Room не прошли проверку.',
   features:[]};
 if(metrics.some(x=>x.volumeCoverage===null||
   x.volumeCoverage<ROLLING_FEATURE_RULES.minVolumeCoverage))
  return {state:'LOW_COVERAGE',
   reason:'Требуется не менее 70% проверенного объёма в каждом из трёх периодов.',
   features:[]};
 if(!windows.every(windowReady))
  return {state:'COLLECTING',
   reason:'Нужно ≥20 TP3/SL, в том числе ≥6 TP3 и ≥6 SL, в каждом периоде.',
   features:[]};
 const fullScores=windows.map(w=>rankingAuc(
  w.samples,x=>frozenRankScore(x.features)));
 if(fullScores.some(x=>!finite(x)))
  return {state:'COLLECTING',
   reason:'Недостаточно однозначных исходов для сравнения AUC.',
   features:[]};
 const features=FROZEN_FEATURES.map(f=>{
  const withoutScores=windows.map(w=>rankingAuc(
   w.samples,x=>frozenRankScore(x.features,f.key)));
  const isolatedScores=windows.map(w=>rankingAuc(
   w.samples,x=>x.features[f.key]));
  const delta=fullScores.map((n,i)=>n-withoutScores[i]);
  const [early,middle,late]=delta;
  const above=x=>x>=ROLLING_FEATURE_RULES.positiveDeltaAuc;
  const below=x=>x<=ROLLING_FEATURE_RULES.negativeDeltaAuc;
  const state=below(late)?'RECENT_DETERIORATION':
   delta.every(above)?'OBSERVED_IN_ALL_THREE':
   (above(early)||above(middle))&&!above(late)?'EARLIER_ONLY':
   above(late)?'LATE_ONLY':'NO_REPEATED_VALUE';
  return {key:f.key,label:f.label,weight:f.weight,state,
   fullAuc:fullScores,withoutAuc:withoutScores,
   isolatedAuc:isolatedScores,deltaAuc:delta,
   descriptiveOnly:true};
 });
 return {state:'DESCRIPTIVE',
  reason:'Три последовательных периода проверены; результаты остаются описательными.',
  features};
}
export function auditRollingFeatureEvidence(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const fail=(state,reason)=>({version:ROLLING_FEATURE_VERSION,
  state,reason,asset,frames:null,trained:false,
  calibratedProbability:null,rules:ROLLING_FEATURE_RULES});
 if(!validAsset(asset)||!time(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||!x.id||
   !time(x.publishedAt)||x.publishedAt>now+60_000))
  return fail('INVALID','Некорректные исходные данные.');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return fail('INCOMPLETE','Для проверки нужен полный локальный Room-архив выбранного актива.');
 if(new Set(rows.map(x=>x.id)).size!==rows.length)
  return fail('INVALID','Повторяющиеся идентификаторы Room.');
 const frames={};
 for(const tf of ['15m','1h','4h']){
  const items=rows.filter(x=>featureFrameOf(x)===tf)
   .sort((a,b)=>a.publishedAt-b.publishedAt||
    a.id.localeCompare(b.id));
  const inspected=items.map(row=>({row,evidence:inspectPreOutcomeStrength(row)}));
  const invalidScores=inspected.filter(x=>x.evidence.state==='INVALID').length;
  const scored=inspected.filter(x=>x.evidence.state==='VERIFIED')
   .map(x=>x.row);
  const base={interval:tf,scored:scored.length,
   oldWithoutScore:items.length-scored.length-invalidScores,
   invalidScores,windows:null,cuts:[],features:[],
   state:'COLLECTING',
   reason:'Для трёх периодов нужно минимум 120 новых публикаций с фиксированным баллом.',
   modelChanged:false,calibratedProbability:null};
  if(invalidScores){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Найдены повреждённые опубликованные признаки. Вывод заблокирован.'};
   continue;
  }
  if(scored.length<ROLLING_FEATURE_RULES.minScored){
   frames[tf]=base;continue;
  }
  const index1=Math.floor(scored.length/3);
  const index2=Math.floor(scored.length*2/3);
  const cut1=scored[index1]?.publishedAt;
  const cut2=scored[index2]?.publishedAt;
  if(!time(cut1)||!time(cut2)||
   cut1<=scored[index1-1].publishedAt||
   cut2<=scored[index2-1].publishedAt||cut1>=cut2){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Не удалось разделить уникальные публикации по времени.'};
   continue;
  }
  // Window 1 and 2 purge any horizon or retrospectively recorded event
  // that touches the next window. Hence no late evidence enters an early set.
  const windows=[
   featureWindowAudit(scored.slice(0,index1),{now,cutAt:cut1}),
   featureWindowAudit(scored.slice(index1,index2),{now,cutAt:cut2}),
   featureWindowAudit(scored.slice(index2),{now})
  ];
  const verdict=analyzeWindows(windows);
  frames[tf]={...base,...verdict,cuts:[cut1,cut2],
   windows:windows.map(x=>x.metrics),
   modelChanged:false,calibratedProbability:null};
 }
 return {version:ROLLING_FEATURE_VERSION,
  state:Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  asset,frames,trained:false,calibratedProbability:null,
  rules:ROLLING_FEATURE_RULES,
  note:'Повторение улучшения AUC на трёх периодах НЕ доказывает причинность, '+
   'статистическую значимость, доходность или вероятность TP3. '+
   'Корреляция рыночных исходов сохраняется. '+
   'Прогнозы и веса модели автоматически не изменяются.'};
}
