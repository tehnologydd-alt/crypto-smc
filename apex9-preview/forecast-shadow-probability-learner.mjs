/**
 * Stage 3/5 — offline SHADOW-only learned probability research.
 *
 * The recipe (3 frozen features, ridge penalty, epochs, chronological
 * boundaries and gates) was registered BEFORE the evaluation cohort.
 * The model is fitted ONLY to training observations. Validation and TWO
 * forward holdouts are untouched by fitting, hyperparameter search or
 * post-hoc reweighting. The first 240 post-registration scored forecasts
 * are frozen as the experiment cohort (never slide after audit).
 *
 * Probabilities are conditional on observed decisive TP3/STOP scenarios
 * and exclude unresolved/timeout; they are not calibrated success odds,
 * investment guidance, a trading signal or live production predictions.
 * No fitted coefficients are ever saved or used to change APEX forecasts.
 */
import {inspectPreOutcomeStrength}
 from './forecast-preoutcome-strength.mjs';
import {featureFrameOf,featureWindowAudit,rankingAuc}
 from './forecast-feature-ablation.mjs';
import {SHADOW_CHALLENGER_REGISTRATION}
 from './forecast-shadow-challengers.mjs';
export const SHADOW_LEARNER_VERSION='APEX_SHADOW_LOGISTIC_RESEARCH_V1';
export const SHADOW_LEARNER_RULES=Object.freeze({
 registeredAt:SHADOW_CHALLENGER_REGISTRATION,
 featureKeys:Object.freeze(['efficiency','travelNorm','volumeNorm']),
 blockSizes:Object.freeze([120,40,40,40]),
 minScoreCoverage:.80,minVolumeCoverage:.70,
 minDecisive:Object.freeze([70,20,20,20]),
 minClass:Object.freeze([20,6,6,6]),
 epochs:360,learningRate:.42,ridge:.08,
 minRepeatedBrierGain:.015,
 source:'FULL_LOCAL_ROOM_FROZEN_PREOUTCOME_FEATURES',
 manualOnly:true,autoTraining:false,autoPromotion:false,
 productionModelChanged:false,calibratedProbability:null,
 outcome:'TP3_VS_STOP_CONDITIONAL_ON_TERMINAL_OUTCOMES'
});
const TFS=['15m','1h','4h'];
const count=x=>Number.isSafeInteger(x)&&x>=0;
const stamp=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const num=x=>typeof x==='number'&&Number.isFinite(x);
const unit=x=>num(x)&&x>=0&&x<=1;
const rounded=x=>Math.round(x*1e5)/1e5;
const logistic=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
const score=(model,f)=>{
 const x=SHADOW_LEARNER_RULES.featureKeys;
 return logistic(model.intercept+model.weights.reduce((sum,w,i)=>
  sum+w*(f[x[i]]-.5),0));
};
const safeSample=x=>x&&['TP3','STOP'].includes(x.outcome)&&
 SHADOW_LEARNER_RULES.featureKeys.every(k=>unit(x.features?.[k]));
/** Fixed deterministic training on the first, purged chronological block.
 * No random initialization, external ML library, localStorage or network.
 */
export function fitShadowLogistic(samples){
 if(!Array.isArray(samples)||samples.length<2||
  samples.some(s=>!safeSample(s)))return null;
 const positives=samples.filter(x=>x.outcome==='TP3').length;
 if(!positives||positives===samples.length)return null;
 const prevalence=positives/samples.length;
 let intercept=Math.log(prevalence/(1-prevalence)),
  weights=[0,0,0];
 const {featureKeys,epochs,learningRate,ridge}=SHADOW_LEARNER_RULES;
 for(let epoch=0;epoch<epochs;epoch++){
  let gb=0,gw=[0,0,0];
  for(const s of samples){
   const predicted=logistic(intercept+weights.reduce((sum,w,i)=>
    sum+w*(s.features[featureKeys[i]]-.5),0));
   const error=predicted-(s.outcome==='TP3'?1:0);
   gb+=error;
   for(let i=0;i<3;i++)
    gw[i]+=error*(s.features[featureKeys[i]]-.5);
  }
  const lr=learningRate;
  intercept-=lr*gb/samples.length;
  for(let i=0;i<3;i++)
   weights[i]-=lr*(gw[i]/samples.length+ridge*weights[i]);
 }
 if(!num(intercept)||weights.some(w=>!num(w)||Math.abs(w)>40))
  return null;
 return {intercept,weights,trainPrevalence:prevalence,
  samples:samples.length,recipe:SHADOW_LEARNER_VERSION,
  usedOnlyTraining:true,production:false};
}
/** Proper scoring, discrimination and basic reliability diagnostics.
 * Baseline is the TRAIN-ONLY prevalence, not test-label prevalence.
 */
export function evaluateShadowLogistic(samples,model){
 if(!model||!Array.isArray(samples)||samples.length<2||
  samples.some(x=>!safeSample(x))||
  !unit(model.trainPrevalence))return null;
 const bins=Array.from({length:4},(_,i)=>({
  label:['0–25%','25–50%','50–75%','75–100%'][i],
  count:0,predictedTotal:0,tp3:0
 }));
 let brier=0,baselineBrier=0,loss=0;
 const predicted=[];
 for(const sample of samples){
  const p=score(model,sample.features),y=sample.outcome==='TP3'?1:0;
  if(!unit(p))return null;
  predicted.push({outcome:sample.outcome,p});
  brier+=(p-y)**2;
  baselineBrier+=(model.trainPrevalence-y)**2;
  const safe=Math.max(1e-9,Math.min(1-1e-9,p));
  loss-=y*Math.log(safe)+(1-y)*Math.log(1-safe);
  const bin=bins[Math.min(3,Math.floor(p*4))];
  bin.count++;bin.predictedTotal+=p;bin.tp3+=y;
 }
 const countSamples=samples.length;
 return {sampleCount:countSamples,
  tp3:predicted.filter(x=>x.outcome==='TP3').length,
  stop:predicted.filter(x=>x.outcome==='STOP').length,
  brier:rounded(brier/countSamples),
  baselineBrier:rounded(baselineBrier/countSamples),
  brierGain:rounded((baselineBrier-brier)/countSamples),
  logLoss:rounded(loss/countSamples),
  auc:rounded(rankingAuc(predicted,x=>x.p)??.5),
  reliability:bins.map(x=>({label:x.label,count:x.count,
   meanPredicted:x.count?rounded(x.predictedTotal/x.count):null,
   observedShare:x.count?rounded(x.tp3/x.count):null}))
 };
}
const blank=(state,reason,extra={})=>({
 state,reason,modelTrained:false,promoted:false,
 calibratedProbability:null,modelChanged:false,
 ...extra
});
export function auditShadowProbabilityLearner(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const fail=(state,reason)=>({
  version:SHADOW_LEARNER_VERSION,asset,state,reason,frames:null,
  automaticTraining:false,promoted:false,modelChanged:false,
  calibratedProbability:null
 });
 if(!validAsset(asset)||!stamp(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||!x.id||
   !stamp(x.publishedAt)||x.publishedAt>now+60000))
  return fail('INVALID','Исходные записи неполные либо принадлежат другому активу.');
 if(complete!==true||!count(publishedCount)||
  rows.length!==publishedCount)
  return fail('INCOMPLETE','Нужен полный локальный архив выбранного актива.');
 if(new Set(rows.map(x=>x.id)).size!==rows.length)
  return fail('INVALID','Дублируются идентификаторы Room.');
 const frames={};
 const total=SHADOW_LEARNER_RULES.blockSizes.reduce((a,b)=>a+b,0);
 for(const tf of TFS){
  const rowsTF=rows.filter(x=>featureFrameOf(x)===tf&&
   x.publishedAt>SHADOW_LEARNER_RULES.registeredAt)
   .sort((a,b)=>a.publishedAt-b.publishedAt||
    a.id.localeCompare(b.id));
  const inspected=rowsTF.map(row=>({
   row,checked:inspectPreOutcomeStrength(row)
  }));
  if(inspected.some(x=>x.checked.state==='INVALID')){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Повреждён хотя бы один балл, записанный до исхода.',{
     futurePublished:rowsTF.length,scored:0});
   continue;
  }
  const scored=inspected.filter(x=>x.checked.state==='VERIFIED')
   .map(x=>x.row);
  const base={futurePublished:rowsTF.length,scored:scored.length,
   required:total,registrationAt:SHADOW_LEARNER_RULES.registeredAt};
  // Data availability is tested on ALL eligible publications; missing
  // feature vectors are never counted as success or reconstructed later.
  if(scored.length<total){
   frames[tf]=blank('COLLECTING',
    'Нужно 240 публикаций с заранее сохранёнными признаками.',base);
   continue;
  }
  if(scored.length/rowsTF.length<
    SHADOW_LEARNER_RULES.minScoreCoverage){
   frames[tf]=blank('LOW_COVERAGE',
    'Менее 80% новых публикаций имеют подтверждённый балл.',base);
   continue;
  }
  // FIRST 240 post-registration scored forecasts, fixed permanently.
  // Re-auditing or receiving more forecasts cannot move the cohort.
  const first=scored.slice(0,total);
  const cuts=[120,160,200].map(i=>first[i].publishedAt);
  if(cuts.some((v,i)=>!stamp(v)||v<=first[[119,159,199][i]].publishedAt)||
   !(cuts[0]<cuts[1]&&cuts[1]<cuts[2])){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Невозможно разделить опубликованные прогнозы по времени.',base);
   continue;
  }
  const sizes=SHADOW_LEARNER_RULES.blockSizes;
  let cursor=0;
  const blocks=sizes.map((size,i)=>{
   const s=first.slice(cursor,cursor+size);cursor+=size;
   return featureWindowAudit(s,{now,cutAt:i<3?cuts[i]:null});
  });
  if(blocks.some(x=>x.metrics.invalid||x.metrics.legacyH1)){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Не прошла проверка событий исхода или M5 для H1.',base);
   continue;
  }
  // A training/validation result recorded AFTER the next block began
  // is never a valid past label. Refuse training even when minimum counts
  // would otherwise hide this leakage among many other observations.
  if(blocks.slice(0,3).some(x=>x.metrics.lateRecorded>0)){
   frames[tf]=blank('COLLECTING',
    'Часть ранних исходов записана после начала следующего периода.',base);
   continue;
  }
  if(blocks.some((x,i)=>x.metrics.volumeCoverage===null||
   x.metrics.volumeCoverage<SHADOW_LEARNER_RULES.minVolumeCoverage)){
   frames[tf]=blank('LOW_COVERAGE',
    'Недостаточное покрытие достоверного объёма в одном из периодов.',base);
   continue;
  }
  if(blocks.some((x,i)=>x.metrics.decisive<
     SHADOW_LEARNER_RULES.minDecisive[i]||
   x.metrics.tp3<SHADOW_LEARNER_RULES.minClass[i]||
   x.metrics.stop<SHADOW_LEARNER_RULES.minClass[i])){
   frames[tf]=blank('COLLECTING',
    'Недостаточно TP3/SL, подтверждённых до границы периода.',{
     ...base,counts:blocks.map(x=>({
      decisive:x.metrics.decisive,tp3:x.metrics.tp3,
      stop:x.metrics.stop,awaiting:x.metrics.awaiting,
      lateRecorded:x.metrics.lateRecorded}))
    });
   continue;
  }
  const trained=fitShadowLogistic(blocks[0].samples);
  if(!trained){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Не удалось обучить экспериментальную формулу на ранних данных.',base);
   continue;
  }
  const evaluations=blocks.slice(1).map(x=>
   evaluateShadowLogistic(x.samples,trained));
  if(evaluations.some(x=>x===null)){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Не удалось объективно проверить логистическую модель.',base);
   continue;
  }
  const [validation,holdout1,holdout2]=evaluations;
  const margin=SHADOW_LEARNER_RULES.minRepeatedBrierGain;
  const state=validation.brierGain>=margin&&
   holdout1.brierGain>=margin&&holdout2.brierGain>=margin?
    'REPEATED_BRIER_GAIN':
   holdout2.brierGain<=-margin?'LATEST_WORSE':
   validation.brierGain>=margin&&
    (holdout1.brierGain<0||holdout2.brierGain<0)?
    'UNSTABLE':'NO_REPEATED_GAIN';
  frames[tf]=blank('EVALUATED',
   'Модель обучена только на первом периоде. '+
    'Три следующие выборки использованы только для проверки.',{
    ...base,modelTrained:true,verdict:state,
    train:{count:trained.samples,tp3:blocks[0].metrics.tp3,
     stop:blocks[0].metrics.stop,
     prevalence:rounded(trained.trainPrevalence)},
    validation,holdouts:[holdout1,holdout2],
    cutAt:cuts,holdoutOverfitGuard:true,
    note:'Показатели для разделения TP3 и STOP только у завершённых сценариев. '+
     'Вероятности пока НЕ калиброваны и НЕ используются в прогнозах.'
   });
 }
 return {version:SHADOW_LEARNER_VERSION,asset,frames,
  state:Object.values(frames).some(f=>f.state==='EVALUATED')?
   'EVALUATED':'COLLECTING',
  automaticTraining:false,promoted:false,modelChanged:false,
  calibratedProbability:null,rules:SHADOW_LEARNER_RULES,
  note:'Экспериментальная логистическая модель обучается только по ручному '+
   'запросу полного архива, на фиксированной ранней выборке каждого '+
   'избранного актива и ТФ. Проверочные периоды не используются для '+
   'подбора коэффициентов. Показатели Brier, AUC, log-loss и график '+
   'надёжности — исследовательские; не означают калиброванной вероятности '+
   'успеха или прибыльности. Модель не применяется к действующим прогнозам.'
 };
}
