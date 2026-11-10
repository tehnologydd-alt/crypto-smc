/**
 * Stage 4/5: SHADOW-ONLY calibration reliability audit.
 * Fit unmodified stage-3 model on first 120 frozen samples; fit monotone
 * Platt calibrator on the following 40 validation samples; evaluate on
 * subsequent 40 + 40 untouched samples. Validate all as-published evidence.
 * No live probabilities, automatic fitting, trading or model promotion.
 */
import {featureFrameOf,featureWindowAudit,rankingAuc}
 from './forecast-feature-ablation.mjs';
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {inspectPublishedRegime,SHADOW_REGIMES_RULES}
 from './forecast-shadow-regimes.mjs';
import {SHADOW_LEARNER_RULES,fitShadowLogistic,
 predictShadowLogistic,evaluateShadowLogistic}
 from './forecast-shadow-probability-learner.mjs';

export const SHADOW_CALIBRATION_VERSION='APEX_SHADOW_CALIBRATION_V1';
export const SHADOW_CALIBRATION_RULES=Object.freeze({
 blockSizes:Object.freeze([120,40,40,40]),
 epochs:240,learningRate:.12,slopeRidge:.12,interceptRidge:.05,
 minModeCoverage:.70,minModeObserved:20,minModeShift:.25,
 maxECE:.15,minBrierGain:.005,brierLoss:.02,eceRise:.12,
 manualOnly:true,automaticPromotion:false,modelChanged:false,
 calibratedProbability:null
});
export const SHADOW_CALIBRATION_VERDICTS=Object.freeze([
 'AWAITING_RADAR','REGIME_SHIFT','CALIBRATION_WORSE',
 'RELIABILITY_DRIFT','REPEATED_GAIN','NO_CONFIRMED_GAIN'
]);
const frames=['15m','1h','4h'];
const num=x=>typeof x==='number'&&Number.isFinite(x);
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const rate=x=>num(x)&&x>=0&&x<=1;
const round=x=>Math.round(x*100000)/100000;
const logistic=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const logit=p=>{const v=Math.max(1e-6,Math.min(1-1e-6,p));
 return Math.log(v/(1-v))};
const valid=x=>x&&rate(x.raw)&&['TP3','STOP'].includes(x.outcome);
/** Fit only frozen validation samples; no selection or threshold tuning. */
export function fitShadowCalibrator(rows){
 if(!Array.isArray(rows)||rows.length<20||rows.some(x=>!valid(x)))return null;
 const wins=rows.filter(x=>x.outcome==='TP3').length;
 if(wins<6||rows.length-wins<6)return null;
 let intercept=0,slope=1;
 const p=SHADOW_CALIBRATION_RULES;
 for(let epoch=0;epoch<p.epochs;epoch++){
  let di=0,ds=0;
  for(const row of rows){
   const z=logit(row.raw),error=
    logistic(intercept+slope*z)-(row.outcome==='TP3'?1:0);
   di+=error;ds+=error*z;
  }
  intercept-=p.learningRate*(di/rows.length+
   p.interceptRidge*intercept);
  slope-=p.learningRate*(ds/rows.length+
   p.slopeRidge*(slope-1));
  intercept=Math.max(-2.5,Math.min(2.5,intercept));
  slope=Math.max(.25,Math.min(2,slope));
 }
 return num(intercept)&&num(slope)?{
  intercept,slope,fitCount:rows.length,
  usedOnlyValidation:true,production:false}:null;
}
export function evaluateShadowCalibration(rows,model){
 if(!Array.isArray(rows)||rows.length<2||rows.some(x=>!valid(x))||
  !num(model?.intercept)||!num(model?.slope)||model.slope<=0)
  return null;
 const bins=Array.from({length:4},(_,i)=>({
  label:['0–25%','25–50%','50–75%','75–100%'][i],
  count:0,sum:0,wins:0}));
 let brier=0,rawBrier=0,loss=0;
 const samples=[];
 for(const row of rows){
  const probability=logistic(model.intercept+model.slope*logit(row.raw));
  const y=row.outcome==='TP3'?1:0;
  brier+=(probability-y)**2;rawBrier+=(row.raw-y)**2;
  const q=Math.max(1e-9,Math.min(1-1e-9,probability));
  loss-=y*Math.log(q)+(1-y)*Math.log(1-q);
  const b=bins[Math.min(3,Math.floor(probability*4))];
  b.count++;b.sum+=probability;b.wins+=y;
  samples.push({outcome:row.outcome,probability});
 }
 const n=rows.length;
 const reliability=bins.map(b=>({label:b.label,count:b.count,
  meanPredicted:b.count?round(b.sum/b.count):null,
  observedTP3:b.count?round(b.wins/b.count):null}));
 const ece=bins.reduce((sum,b)=>sum+(b.count?
  Math.abs(b.sum/b.count-b.wins/b.count)*b.count:0),0)/n;
 return {sampleCount:n,brier:round(brier/n),
  originalBrier:round(rawBrier/n),
  gainVsUncalibrated:round((rawBrier-brier)/n),
  logLoss:round(loss/n),ece:round(ece),
  auc:round(rankingAuc(samples,x=>x.probability)??.5),
  reliability};
}
const empty=(state,reason,more={})=>({
 state,reason,modelChanged:false,
 calibratedProbability:null,...more
});
const modes=SHADOW_REGIMES_RULES.modes;
function observeRadar(block,byId){
 const counts=Object.fromEntries(modes.map(m=>[m,0]));
 let observed=0,invalid=0;
 for(const s of block.eligibleRows){
  const row=byId.get(s.id);
  const evidence=row?inspectPublishedRegime(row):{state:'INVALID'};
  if(evidence.state==='INVALID')invalid++;
  if(evidence.state==='OBSERVED'){
   observed++;counts[evidence.mode]++;
  }
 }
 const eligible=block.eligibleRows.length;
 return {eligible,observed,invalid,modes:counts,
  coverage:eligible?round(observed/eligible):null};
}
export function assessModeShift(rows){
 if(!Array.isArray(rows)||rows.length!==3||rows.some(x=>
  !Number.isSafeInteger(x?.eligible)||!Number.isSafeInteger(x?.observed)||
  !Number.isSafeInteger(x?.invalid)||x.invalid>0))
  return {state:'CHECK_DATA',shift:null};
 if(rows.some(x=>x.eligible<SHADOW_CALIBRATION_RULES.minModeObserved||
  x.observed<SHADOW_CALIBRATION_RULES.minModeObserved||
  !rate(x.coverage)||x.coverage<SHADOW_CALIBRATION_RULES.minModeCoverage||
  modes.some(m=>!Number.isSafeInteger(x.modes?.[m]))))
  return {state:'AWAITING_RADAR',shift:null};
 const shift=Math.max(...modes.map(m=>Math.abs(
  rows[2].modes[m]/rows[2].observed-
  rows[0].modes[m]/rows[0].observed)));
 return {state:shift>=SHADOW_CALIBRATION_RULES.minModeShift?
  'REGIME_SHIFT':'STABLE',shift:round(shift)};
}
export function auditShadowCalibration(rows,{asset,complete=false,
 publishedCount=null,now=Date.now(),learner=null}={}){
 const fail=(state,reason)=>({
  version:SHADOW_CALIBRATION_VERSION,asset,state,reason,
  frames:null,modelChanged:false,calibratedProbability:null});
 if(!validAsset(asset)||!validTime(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||!x.id||
   !validTime(x.publishedAt)||x.publishedAt>now+60000))
  return fail('INVALID','Повреждён локальный архив.');
 if(!complete||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length||
  new Set(rows.map(x=>x.id)).size!==rows.length)
  return fail('INCOMPLETE','Требуется полный архив одного избранного актива.');
 if(learner?.asset!==asset||!learner.frames)
  return fail('INVALID','Несогласованная исходная теневая модель.');
 const results={},required=240;
 for(const tf of frames){
  const parent=learner.frames[tf];
  const base={scored:parent?.scored||0,required,
   trainCount:120,calibrationFitCount:40,holdoutSizes:[40,40]};
  if(parent?.state!=='EVALUATED'){
   results[tf]=empty(parent?.state==='INVALID_EVIDENCE'?
    'CHECK_DATA':'COLLECTING',
    parent?.reason||'Нужно завершить проверку теневой модели.',base);
   continue;
  }
  const timeline=rows.filter(x=>featureFrameOf(x)===tf&&
   x.publishedAt>SHADOW_LEARNER_RULES.registeredAt)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  if(timeline.some(x=>inspectPreOutcomeStrength(x).state==='INVALID')){
   results[tf]=empty('CHECK_DATA','Повреждены признаки при публикации.',base);
   continue;
  }
  const scored=timeline.filter(x=>inspectPreOutcomeStrength(x).state==='VERIFIED');
  if(scored.length<required){
   results[tf]=empty('COLLECTING','Недостаточно новых исходов.',base);
   continue;
  }
  const first=scored.slice(0,required);
  const cuts=[120,160,200].map(i=>first[i].publishedAt);
  if(!Array.isArray(parent.cutAt)||parent.cutAt.length!==3||
   cuts.some((x,i)=>x!==parent.cutAt[i])){
   results[tf]=empty('CHECK_DATA','Изменена граница контрольных периодов.',base);
   continue;
  }
  let cursor=0;
  const blocks=[120,40,40,40].map((size,i)=>{
   const sample=first.slice(cursor,cursor+size);cursor+=size;
   return featureWindowAudit(sample,{now,cutAt:i===3?null:cuts[i]});
  });
  if(blocks.some(b=>b.metrics.invalid||b.metrics.legacyH1)||
   blocks.slice(0,3).some(b=>b.metrics.lateRecorded>0)){
   results[tf]=empty('CHECK_DATA',
    'Будущие или поздно записанные исходы не участвуют.',base);
   continue;
  }
  if(blocks[0].metrics.decisive!==parent.train?.count||
   blocks[1].metrics.decisive!==parent.validation?.sampleCount||
   !Array.isArray(parent.holdouts)||parent.holdouts.length!==2||
   blocks[2].metrics.decisive!==parent.holdouts[0].sampleCount||
   blocks[3].metrics.decisive!==parent.holdouts[1].sampleCount){
   results[tf]=empty('CHECK_DATA','Итоги проверки не совпадают.',base);
   continue;
  }
  const core=fitShadowLogistic(blocks[0].samples);
  const uncalibrated=blocks.slice(1).map(b=>
   evaluateShadowLogistic(b.samples,core));
  if(!core||uncalibrated.some((x,i)=>!x||x.brier!==(
   i===0?parent.validation:parent.holdouts[i-1])?.brier)){
   results[tf]=empty('CHECK_DATA','Базовая модель не воспроизводится.',base);
   continue;
  }
  const attach=samples=>samples.map(s=>({
   outcome:s.outcome,raw:predictShadowLogistic(core,s.features)
  }));
  const validation=attach(blocks[1].samples);
  const fit=fitShadowCalibrator(validation);
  if(!fit){
   results[tf]=empty('COLLECTING',
    'Недостаточно TP3 и STOP в калибровочной выборке.',base);
   continue;
  }
  const holdouts=blocks.slice(2).map(b=>
   evaluateShadowCalibration(attach(b.samples),fit));
  if(holdouts.some(x=>!x)){
   results[tf]=empty('CHECK_DATA','Недоступна контрольная оценка.',base);
   continue;
  }
  const byId=new Map(first.map(x=>[x.id,x]));
  const radar=blocks.slice(1).map(b=>observeRadar(b,byId));
  if(radar.some(x=>x.invalid)){
   results[tf]=empty('CHECK_DATA',
    'Некорректное время Radar на момент прогноза.',base);
   continue;
  }
  const regime=assessModeShift(radar),r=SHADOW_CALIBRATION_RULES;
  const verdict=regime.state==='AWAITING_RADAR'?'AWAITING_RADAR':
   regime.state==='REGIME_SHIFT'?'REGIME_SHIFT':
   holdouts[1].gainVsUncalibrated<=-r.brierLoss?
    'CALIBRATION_WORSE':
   holdouts[1].ece-holdouts[0].ece>=r.eceRise?
    'RELIABILITY_DRIFT':
   holdouts.every(x=>x.gainVsUncalibrated>=r.minBrierGain&&
    x.ece<=r.maxECE)?'REPEATED_GAIN':'NO_CONFIRMED_GAIN';
  const state=verdict==='REPEATED_GAIN'?'RESEARCH_PASSED':
   verdict==='AWAITING_RADAR'?'NEED_RADAR':
   verdict==='REGIME_SHIFT'?'REVIEW_REGIME':'REVIEW';
  results[tf]=empty(state,
   'Оценено на двух нетронутых контрольных периодах.',{
    ...base,verdict,radarCoverage:radar.map(x=>x.coverage),
    regime,holdoutMetrics:holdouts,calibratedForProduction:false,
    reliabilityOnly:true});
 }
 return {version:SHADOW_CALIBRATION_VERSION,asset,frames:results,
  state:Object.values(results).some(x=>x.state==='RESEARCH_PASSED')?
   'RESEARCH_PASSED':Object.values(results).some(x=>x.holdoutMetrics)?
    'RESEARCH_REVIEW':'COLLECTING',
  modelChanged:false,calibratedProbability:null,promoted:false,
  rules:SHADOW_CALIBRATION_RULES,
  note:'Калибровка проверяется только среди завершённых TP3/SL. '+
   'Прочие исходы нельзя считать успешными. Изменение режима — '+
   'предупреждение, не автоматическая адаптация. Даже хорошие Brier '+
   'и ECE не доказывают будущую прибыль или возможность использовать '+
   'вероятность в настоящей торговле. Действующие модели не меняются.'};
}
