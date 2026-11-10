/**
 * APEX Shadow Challengers V1 — three FROZEN alternative rankers versus the
 * existing frozen strength benchmark on the SAME forward-only scenarios.
 *
 * Recipes are registered on 2026-11-11 00:00 UTC. Historical outcomes or
 * pre-registration rows NEVER participate. No search for optimal weights,
 * model selection, retraining, confidence claim, orders or TP/SL updates.
 * AUC is conditional on verified terminal TP3/STOP and is NOT a probability.
 */
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {
 featureFrameOf,featureWindowAudit,rankingAuc
} from './forecast-feature-ablation.mjs';

export const SHADOW_CHALLENGER_VERSION='APEX_SHADOW_CHALLENGERS_V1';
export const SHADOW_CHALLENGER_REGISTRATION=Date.UTC(2026,10,11,0,0,0);
export const SHADOW_CHALLENGER_RECIPES=Object.freeze([
 Object.freeze({id:'CURRENT_V1',name:'Действующий балл',
  weights:Object.freeze({efficiency:.50,travelNorm:.30,volumeNorm:.20}),
  role:'REFERENCE'}),
 Object.freeze({id:'STRUCTURE_V1',name:'Структура движения',
  weights:Object.freeze({efficiency:.70,travelNorm:.30,volumeNorm:0}),
  role:'CHALLENGER'}),
 Object.freeze({id:'IMPULSE_V1',name:'Акцент на импульсе',
  weights:Object.freeze({efficiency:.25,travelNorm:.65,volumeNorm:.10}),
  role:'CHALLENGER'}),
 Object.freeze({id:'VOLUME_V1',name:'Акцент на объёме',
  weights:Object.freeze({efficiency:.25,travelNorm:.15,volumeNorm:.60}),
  role:'CHALLENGER'})
]);
export const SHADOW_CHALLENGER_RULES=Object.freeze({
 registrationUtc:'2026-11-11T00:00:00.000Z',
 minPostRegistrationScores:120,windowSize:40,minScoreCoverage:.80,
 minDecisivePerWindow:20,minTp3PerWindow:6,minStopPerWindow:6,
 minVolumeCoverage:.70,minimumDeltaAuc:.03,
 lastThreeWindows:true,strictlyPostRegistration:true,
 autoPromotion:false,modelChanged:false,
 calibratedProbability:null,
 source:'LOCAL_COMPLETE_ROOM_ARCHIVE_FROZEN_PREOUTCOME_FEATURES'
});
const time=x=>Number.isSafeInteger(x)&&x>0;
const number=x=>typeof x==='number'&&Number.isFinite(x);
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const empty=(state,reason)=>({version:SHADOW_CHALLENGER_VERSION,
 state,reason,frames:null,autoPromoted:false,modelChanged:false,
 calibratedProbability:null,rules:SHADOW_CHALLENGER_RULES});
/** A fixed rank; NEVER interpreted as a future TP3 probability. */
export function challengerScore(features,recipe){
 if(!features||!recipe?.weights)return null;
 const w=recipe.weights;
 const keys=['efficiency','travelNorm','volumeNorm'];
 if(keys.some(k=>!number(w[k])||w[k]<0||w[k]>1||
  !number(features[k])||features[k]<0||features[k]>1)||
  Math.abs(keys.reduce((s,k)=>s+w[k],0)-1)>1e-10)return null;
 return keys.reduce((s,k)=>s+features[k]*w[k],0);
}
function inspectWindows(windows){
 const counts=windows.map(w=>w.metrics);
 if(counts.some(x=>x.invalid||x.legacyH1))
  return {state:'INVALID_EVIDENCE',reason:
   'Проверка исходных событий или устаревшего H1-наблюдения не пройдена.',
   models:[]};
 if(counts.some(x=>x.volumeCoverage===null||
  x.volumeCoverage<SHADOW_CHALLENGER_RULES.minVolumeCoverage))
  return {state:'LOW_COVERAGE',
   reason:'Для честного сравнения требуется ≥70% достоверного объёма во всех периодах.',
   models:[]};
 if(counts.some(x=>x.decisive<SHADOW_CHALLENGER_RULES.minDecisivePerWindow||
  x.tp3<SHADOW_CHALLENGER_RULES.minTp3PerWindow||
  x.stop<SHADOW_CHALLENGER_RULES.minStopPerWindow))
  return {state:'COLLECTING',
   reason:'Нужно ≥20 TP3/SL, включая ≥6 каждого исхода в каждом периоде.',
   models:[]};
 const reference=SHADOW_CHALLENGER_RECIPES[0];
 const baseline=windows.map(w=>rankingAuc(w.samples,x=>
  challengerScore(x.features,reference)));
 if(baseline.some(x=>!number(x)))
  return {state:'COLLECTING',reason:'Недостаточно двух типов исходов для AUC.',
   models:[]};
 const models=SHADOW_CHALLENGER_RECIPES.slice(1).map(recipe=>{
  const auc=windows.map(w=>rankingAuc(w.samples,x=>
   challengerScore(x.features,recipe)));
  const improvement=auc.map((x,i)=>x-baseline[i]);
  const min=SHADOW_CHALLENGER_RULES.minimumDeltaAuc;
  const state=improvement[2]<=-min?'RECENTLY_WORSE':
   improvement.every(x=>x>=min)?'OBSERVED_THREE_TIMES':
   (improvement[0]>=min||improvement[1]>=min)&&
    improvement[2]<min?'NO_LONGER_BETTER':
   improvement[2]>=min?'LATE_ONLY':'NOT_BETTER';
  return {id:recipe.id,name:recipe.name,
   weights:recipe.weights,state,
   baselineAuc:baseline,challengerAuc:auc,deltaAuc:improvement,
   comparableObservations:counts.map(x=>x.decisive),
   trained:false,promoted:false,calibratedProbability:null};
 });
 return {state:'DESCRIPTIVE',
  reason:'Фиксированные альтернативы оценены на одинаковых новых исходах.',
  models};
}
export function auditShadowChallengers(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const fail=(state,reason)=>{
  const x=empty(state,reason);return {...x,asset};
 };
 if(!assetOK(asset)||!time(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||!x.id||
   !time(x.publishedAt)||x.publishedAt>now+60_000))
  return fail('INVALID','Некорректные записи или выбранный актив.');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return fail('INCOMPLETE','Требуется полный локальный Room-архив одного актива.');
 if(new Set(rows.map(x=>x.id)).size!==rows.length)
  return fail('INVALID','Повторяются идентификаторы Room.');
 const frames={};
 for(const tf of ['15m','1h','4h']){
  const history=rows.filter(row=>featureFrameOf(row)===tf)
   .sort((a,b)=>a.publishedAt-b.publishedAt||
    a.id.localeCompare(b.id));
  // Publication date is checked BEFORE score or outcome. Registrations are
  // frozen in source; future builds never backfill data before this point.
  const forward=history.filter(row=>
   row.publishedAt>SHADOW_CHALLENGER_REGISTRATION);
  const inspected=forward.map(row=>({
   row,result:inspectPreOutcomeStrength(row)
  }));
  const damaged=inspected.filter(x=>x.result.state==='INVALID').length;
  const scored=inspected.filter(x=>x.result.state==='VERIFIED')
   .map(x=>x.row);
  const base={interval:tf,registrationAt:SHADOW_CHALLENGER_REGISTRATION,
   historicalExcluded:history.length-forward.length,
   futurePublished:forward.length,newScored:scored.length,
   scoreCoverage:forward.length?scored.length/forward.length:null,
   missingStrength:forward.length-scored.length-damaged,
   invalidStrength:damaged,windows:null,models:[],cuts:null,
   state:'COLLECTING',
   reason:'Необходимо 120 опубликованных после регистрации баллов.',
   calibratedProbability:null,modelChanged:false};
  if(damaged){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Обнаружены повреждённые опубликованные баллы. Сравнение остановлено.'};
   continue;
  }
  if(scored.length<SHADOW_CHALLENGER_RULES.minPostRegistrationScores){
   frames[tf]=base;continue;
  }
  if(base.scoreCoverage<SHADOW_CHALLENGER_RULES.minScoreCoverage){
   frames[tf]={...base,state:'LOW_SCORE_COVERAGE',
    reason:'Менее 80% новых публикаций имеют проверенный балл до исхода. '+
     'Выборка может быть искажена пропусками источников.'};
   continue;
  }
  // Three consecutive equal-sized blocks of the LAST 120 preregistered
  // publications. All recipes use exactly the same fixed observations.
  const current=scored.slice(-SHADOW_CHALLENGER_RULES.minPostRegistrationScores);
  const n=SHADOW_CHALLENGER_RULES.windowSize;
  const cut1=current[n].publishedAt,cut2=current[n*2].publishedAt;
  if(!time(cut1)||!time(cut2)||cut1<=current[n-1].publishedAt||
   cut2<=current[n*2-1].publishedAt||cut2<=cut1){
   frames[tf]={...base,state:'INVALID_EVIDENCE',
    reason:'Нарушена последовательность публикаций.'};
   continue;
  }
  const windows=[
   featureWindowAudit(current.slice(0,n),{now,cutAt:cut1}),
   featureWindowAudit(current.slice(n,n*2),{now,cutAt:cut2}),
   featureWindowAudit(current.slice(n*2),{now})
  ];
  const verdict=inspectWindows(windows);
  frames[tf]={...base,...verdict,
   windows:windows.map(x=>x.metrics),cuts:[cut1,cut2],
   modelChanged:false,calibratedProbability:null};
 }
 return {version:SHADOW_CHALLENGER_VERSION,asset,
  registeredAt:SHADOW_CHALLENGER_REGISTRATION,
  state:Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  frames,autoPromoted:false,modelChanged:false,
  calibratedProbability:null,rules:SHADOW_CHALLENGER_RULES,
  note:'Три альтернативы заранее фиксированы и оцениваются лишь по '+
   'новым прогнозам. AUC измеряет ранжирование TP3 против SL, '+
   'не вероятность прибыли. Корреляция рынка, множественные сравнения '+
   'и малый размер выборок могут давать ложные улучшения. '+
   'Автоматическое обучение, выбор победителя и изменения прогнозов запрещены.'
 };
}
