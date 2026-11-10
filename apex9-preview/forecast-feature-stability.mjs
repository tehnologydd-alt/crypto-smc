/**
 * APEX Feature Stability v1 — descriptive-only three-period quality gate.
 * Fixed chronological partitions: reference 60%, validation 20%, confirmation
 * 20%; purge boundary-crossing forecast horizons. No learning or auto-weights.
 *
 * Every status is observational. Even REPEATED remains BLOCKED from production
 * forecasting: overlapping assets, multiple hypotheses and market changes
 * prevent translating descriptive comparisons into trading performance.
 */
import {FEATURE_HOLDOUT_VERSION,FEATURE_DEFINITIONS}
 from './forecast-feature-holdout.mjs';

export const STABILITY_VERSION='APEX_FEATURE_STABILITY_V1';
export const STABILITY_RULES=Object.freeze({
 minReferenceArm:12,minValidationArm:8,minConfirmationArm:8,
 minDecisivePerPeriod:20,minCoverage:.70,
 minimumAbsoluteDifferencePp:8,maxValidationConfirmationDriftPp:20,
 autoPromotion:false,calibratedProbability:false,
 split:'60% REFERENCE / 20% VALIDATION / 20% CONFIRMATION',
 eligibility:'SAME_ASSET_COMPLETE_ROOM_ARCHIVE'
});
const FRAMES=['15m','1h','4h'];
const safeNumber=n=>typeof n==='number'&&Number.isFinite(n);
const N=arm=>arm&&Number.isSafeInteger(arm.tp3)&&arm.tp3>=0&&
 Number.isSafeInteger(arm.stop)&&arm.stop>=0?arm.tp3+arm.stop:null;
const EMPTY=(reason)=>({state:'INSUFFICIENT',reason,reference:null,
 validation:null,confirmation:null,association:null,approvedForForecast:false});

function period(segment,featureId){
 const f=segment?.features?.[featureId];
 const yes=N(f?.yes),no=N(f?.no),decisive=segment?.counters?.decisive;
 if(yes===null||no===null||
  !Number.isSafeInteger(decisive)||decisive<0||
  !Number.isSafeInteger(f.unavailable)||f.unavailable<0||
  yes+no+f.unavailable>decisive)
  return null;
 const covered=yes+no;
 const difference=yes&&no?
  (f.yes.tp3/yes-f.no.tp3/no)*100:null;
 return {yes, no, decisive,covered,
  unavailable:f.unavailable,
  coverage:decisive?covered/decisive:null,
  tp3Yes:yes?f.yes.tp3/yes:null,
  tp3No:no?f.no.tp3/no:null,
  differencePp:difference};
}
const sign=n=>n>0?1:n<0?-1:0;
function inspectFeature(frame,definition){
 const ref=period(frame.reference,definition.id);
 const val=period(frame.validation,definition.id);
 const confirm=period(frame.confirmation,definition.id);
 const original=frame.features?.find(f=>f.id===definition.id);
 const base={id:definition.id,label:definition.label,
  ...EMPTY('Недостаточно проверенных временных данных')};
 if(!ref||!val||!confirm||original?.state!=='DESCRIPTIVE')
  return base;
 const result={...base,reference:ref,validation:val,confirmation:confirm};
 if([ref,val,confirm].some(p=>p.decisive<STABILITY_RULES.minDecisivePerPeriod||
    p.coverage===null||p.coverage<STABILITY_RULES.minCoverage)){
  return {...result,state:'LOW_COVERAGE',
   reason:'Недостаточная полнота исходов или сохранённых источников'};
 }
 if(ref.yes<STABILITY_RULES.minReferenceArm||
  ref.no<STABILITY_RULES.minReferenceArm||
  val.yes<STABILITY_RULES.minValidationArm||
  val.no<STABILITY_RULES.minValidationArm||
  confirm.yes<STABILITY_RULES.minConfirmationArm||
  confirm.no<STABILITY_RULES.minConfirmationArm){
  return {...result,state:'INSUFFICIENT',
   reason:'В одной из групп слишком мало TP3/SL'};
 }
 const gaps=[ref,val,confirm].map(p=>p.differencePp);
 if(gaps.some(v=>!safeNumber(v)))
  return {...result,state:'INSUFFICIENT',reason:'Невозможно рассчитать доли'};
 const strong=gaps.every(g=>Math.abs(g)>=STABILITY_RULES.minimumAbsoluteDifferencePp);
 const signs=gaps.map(sign);
 if(signs[0]!==signs[1]||signs[1]!==signs[2]){
  return {...result,state:'CONFLICTING',
   reason:'Связь меняет знак между временными периодами'};
 }
 if(!strong){
  return {...result,state:'WEAK',
   reason:'Связь слишком мала хотя бы на одном временном периоде'};
 }
 if(Math.abs(gaps[1]-gaps[2])>
    STABILITY_RULES.maxValidationConfirmationDriftPp){
  return {...result,state:'DRIFTING',
   reason:'Сила связи заметно меняется между контрольными периодами'};
 }
 return {...result,state:'REPEATED',
  association:signs[0]>0?'MATCH_MORE_TP3':'MISMATCH_MORE_TP3',
  reason:'Повторяющееся историческое различие; требуется новая независимая проверка',
  approvedForForecast:false};
}
export function assessFeatureStability(report){
 const unavailable=(state,reason)=>({version:STABILITY_VERSION,
  state,reason,asset:report?.asset??null,frames:null,
  repeated:0,approvedForForecast:false,rules:STABILITY_RULES});
 if(report?.version!==FEATURE_HOLDOUT_VERSION||
    typeof report?.asset!=='string'||
    !/^[A-Z0-9]{5,20}$/.test(report.asset)||
    !Number.isSafeInteger(report.archiveRows)||report.archiveRows<0||
    !report.frames)
  return unavailable('INVALID','Нужен полный проверенный журнал исследования');
 const frames={};
 let repeated=0;
 for(const tf of FRAMES){
  const frame=report.frames[tf];
  if(!frame||frame.frame!==tf||frame.state==='INVALID'){
   frames[tf]={state:'INVALID',reason:'Неверная временная выборка',features:[]};
   continue;
  }
  if(!frame.reference||!frame.validation||!frame.confirmation||
   !Number.isSafeInteger(frame.confirmationAt)||
   frame.confirmationAt<=frame.splitAt){
   frames[tf]={state:'INSUFFICIENT',
    reason:'Нет трёх независимых по времени участков',features:[]};
   continue;
  }
  const features=FEATURE_DEFINITIONS.map(d=>inspectFeature(frame,d));
  const n=features.filter(f=>f.state==='REPEATED').length;
  repeated+=n;
  frames[tf]={state:n?'DESCRIPTIVE':'INSUFFICIENT',
   reason:n?'Обнаружены повторяющиеся описательные различия':
    'Ни один признак не прошёл все проверки устойчивости',
   published:frame.published,
   validationAt:frame.splitAt,confirmationAt:frame.confirmationAt,
   purgedAtFirstBoundary:frame.purged,
   purgedAtSecondBoundary:frame.purgedValidation,
   features};
 }
 return {version:STABILITY_VERSION,asset:report.asset,
  state:repeated?'DESCRIPTIVE':'INSUFFICIENT',
  frames,repeated,approvedForForecast:false,
  note:'Повторение направления исторического эффекта не доказывает '+
   'улучшение прогноза. Результаты зависят от выборки, '+
   'не учитывают исполнение ордеров, комиссии и множество проверяемых гипотез. '+
   'Автоматическое применение признаков заблокировано.',
  rules:STABILITY_RULES};
}
