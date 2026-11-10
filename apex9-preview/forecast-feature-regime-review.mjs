/**
 * APEX stage-2 closure: pair-feature replication by AS-PUBLISHED Radar mode.
 *
 * This reuses the same last 120 registered Shadow scenarios and the same
 * three purged, non-overlapping outcome cohorts as the main pair comparison.
 * Regime is read ONLY from immutable before-forecast evidence (never inferred
 * from later candles or the eventual TP3/SL). Sample membership is fixed
 * before looking at outcomes. All conclusions are descriptive, not causal,
 * significant, calibrated, learned or suitable for automatic promotion.
 */
import {featureFrameOf,featureWindowAudit}
 from './forecast-feature-ablation.mjs';
import {inspectPreOutcomeStrength} from './forecast-preoutcome-strength.mjs';
import {inspectPublishedRegime,SHADOW_REGIMES_RULES}
 from './forecast-shadow-regimes.mjs';
import {SHADOW_CHALLENGER_REGISTRATION,SHADOW_CHALLENGER_RULES}
 from './forecast-shadow-challengers.mjs';
import {FEATURE_PAIRS,comparePairWindows}
 from './forecast-feature-pairs.mjs';

export const FEATURE_REGIME_REVIEW_VERSION='APEX_FEATURE_REGIME_REVIEW_V1';
export const FEATURE_REGIME_STATES=Object.freeze([
 'REPEATED_TWO_MODES','CONFLICTING_REGIMES','LIMITED_SUPPORT',
 'NO_REPEATED_GAIN','NEED_TWO_MODES'
]);
const TFS=['15m','1h','4h'];
const assetOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const stamp=x=>Number.isSafeInteger(x)&&x>0;
const blank=(state,reason)=>({
 state,reason,availableModes:0,modeResults:{},pairs:[],
 modelChanged:false,calibratedProbability:null
});
const reportOK=(report,asset)=>report?.asset===asset&&report.frames;
const countGroup=samples=>({
 decisive:samples.length,tp3:samples.filter(x=>x.outcome==='TP3').length,
 stop:samples.filter(x=>x.outcome==='STOP').length
});
export function assessRegimePairReplication(globalPairs,perMode){
 if(!Array.isArray(globalPairs)||globalPairs.length!==FEATURE_PAIRS.length||
  !Array.isArray(perMode))return null;
 return FEATURE_PAIRS.map(ref=>{
  const prior=globalPairs.find(x=>x?.id===ref.id);
  if(!prior)return null;
  const available=perMode.filter(x=>x?.pairs?.some(p=>p.id===ref.id));
  const supporters=available.filter(x=>x.pairs.find(p=>p.id===ref.id)
   ?.state==='REPEATED_ADDITION').map(x=>x.mode);
  const setbacks=available.filter(x=>x.pairs.find(p=>p.id===ref.id)
   ?.state==='RECENT_SETBACK').map(x=>x.mode);
  const state=available.length<2?'NEED_TWO_MODES':
   setbacks.length?'CONFLICTING_REGIMES':
   prior.state==='REPEATED_ADDITION'&&supporters.length>=2?
    'REPEATED_TWO_MODES':
   supporters.length?'LIMITED_SUPPORT':'NO_REPEATED_GAIN';
  return {id:ref.id,label:ref.label,state,
   comparableModes:available.length,
   supportingModes:supporters,settbackModes:setbacks};
 }).every(Boolean)?FEATURE_PAIRS.map(ref=>{
  const prior=globalPairs.find(x=>x.id===ref.id);
  const available=perMode.filter(x=>x?.pairs?.some(p=>p.id===ref.id));
  const supportingModes=available.filter(x=>
   x.pairs.find(p=>p.id===ref.id).state==='REPEATED_ADDITION')
   .map(x=>x.mode);
  const setbackModes=available.filter(x=>
   x.pairs.find(p=>p.id===ref.id).state==='RECENT_SETBACK')
   .map(x=>x.mode);
  const state=available.length<2?'NEED_TWO_MODES':
   setbackModes.length?'CONFLICTING_REGIMES':
   prior.state==='REPEATED_ADDITION'&&supportingModes.length>=2?
    'REPEATED_TWO_MODES':
   supportingModes.length?'LIMITED_SUPPORT':'NO_REPEATED_GAIN';
  return {id:ref.id,label:ref.label,state,
   comparableModes:available.length,supportingModes,setbackModes};
 }):null;
}
export function auditFeaturePairRegimes(rows,{asset,complete=false,
 publishedCount=null,now=Date.now(),challenge=null,pairs=null,
 regimes=null}={}){
 const fail=(state,reason)=>({
  version:FEATURE_REGIME_REVIEW_VERSION,asset,state,reason,
  frames:null,modelChanged:false,calibratedProbability:null
 });
 if(!assetOK(asset)||!stamp(now)||!Array.isArray(rows)||
  rows.some(x=>x?.asset!==asset||typeof x.id!=='string'||
   !x.id||!stamp(x.publishedAt)||x.publishedAt>now+60000))
  return fail('INVALID','Повреждён или смешан исследовательский архив.');
 if(complete!==true||!integer(publishedCount)||
  publishedCount!==rows.length)
  return fail('INCOMPLETE','Нужен полный локальный архив одного избранного актива.');
 if(new Set(rows.map(x=>x.id)).size!==rows.length||
  !reportOK(challenge,asset)||!reportOK(pairs,asset)||
  !reportOK(regimes,asset)||challenge.registeredAt!==
   SHADOW_CHALLENGER_REGISTRATION)
  return fail('INVALID','Несогласованные результаты исходных исследований.');
 const frames={};
 for(const tf of TFS){
  const basic=pairs.frames[tf],reference=challenge.frames[tf],
   modeReview=regimes.frames[tf];
  if(!basic||!reference||!modeReview){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Недоступна согласованная проверка таймфрейма.');
   continue;
  }
  if(basic.state!=='DESCRIPTIVE'||reference.state!=='DESCRIPTIVE'){
   frames[tf]=blank(
    ['INVALID','INVALID_EVIDENCE'].includes(basic.state)?
     'INVALID_EVIDENCE':'COLLECTING',
    basic.reason||'Пока недостаточно новых исходов.');
   continue;
  }
  if(modeReview.state!=='DESCRIPTIVE'){
   frames[tf]=blank(
    ['INVALID','INVALID_EVIDENCE'].includes(modeReview.state)?
     'INVALID_EVIDENCE':modeReview.state==='LOW_COVERAGE'?
      'LOW_COVERAGE':'COLLECTING',
    modeReview.reason||'Нужны подтверждённые режимы во всех периодах.');
   continue;
  }
  const cohort=rows.filter(x=>featureFrameOf(x)===tf&&
   x.publishedAt>SHADOW_CHALLENGER_REGISTRATION)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  const scored=cohort.filter(x=>
   inspectPreOutcomeStrength(x).state==='VERIFIED');
  const n=SHADOW_CHALLENGER_RULES.windowSize,
   current=scored.slice(-3*n),cuts=reference.cuts;
  if(current.length!==3*n||!Array.isArray(cuts)||cuts.length!==2||
   current[n].publishedAt!==cuts[0]||
   current[2*n].publishedAt!==cuts[1]){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Не совпадают заранее определённые проверочные периоды.');
   continue;
  }
  const blocks=[
   featureWindowAudit(current.slice(0,n),{now,cutAt:cuts[0]}),
   featureWindowAudit(current.slice(n,2*n),{now,cutAt:cuts[1]}),
   featureWindowAudit(current.slice(2*n),{now})
  ];
  const byId=new Map(current.map(x=>[x.id,x]));
  const available=SHADOW_REGIMES_RULES.modes;
  const grouped=blocks.map(w=>{
   const flags={invalid:0,eligible:0,observed:0,
    modeCounts:Object.fromEntries(available.map(m=>[m,0]))};
   const detected=new Map();
   for(const row of w.eligibleRows){
    flags.eligible++;
    const published=byId.get(row.id);
    const label=published?inspectPublishedRegime(published):{state:'INVALID'};
    if(label.state==='INVALID'){flags.invalid++;continue;}
    if(label.state==='OBSERVED'){
     flags.observed++;flags.modeCounts[label.mode]++;
     detected.set(row.id,label.mode);
    }
   }
   return {flags,modes:Object.fromEntries(available.map(m=>[
    m,w.samples.filter(x=>detected.get(x.id)===m)
   ]))};
  });
  const matches=grouped.every((group,i)=>{
   const expected=modeReview.windows?.[i],m=blocks[i].metrics;
   return expected&&m.invalid===0&&m.legacyH1===0&&
    group.flags.invalid===0&&
    m.decisive===reference.windows?.[i]?.decisive&&
    m.tp3===reference.windows?.[i]?.tp3&&
    m.stop===reference.windows?.[i]?.stop&&
    group.flags.eligible===expected.eligible&&
    group.flags.observed===expected.radarObserved&&
    available.every(mode=>
     group.flags.modeCounts[mode]===expected.modeEligible?.[mode]&&
     (()=>{
      const check=modeReview.regimes?.[mode]?.windows?.[i];
      const seen=countGroup(group.modes[mode]);
      return check&&seen.decisive===check.decisive&&
       seen.tp3===check.tp3&&seen.stop===check.stop;
     })());
  });
  if(!matches){
   frames[tf]=blank('INVALID_EVIDENCE',
    'Результаты Radar или TP3/SL не совпали с исходным исследованием.');
   continue;
  }
  const modeResults={};
  for(const mode of available){
   const cohorts=grouped.map(g=>g.modes[mode]);
   const sufficient=cohorts.every(samples=>{
    const counts=countGroup(samples);
    return counts.decisive>=SHADOW_REGIMES_RULES.minModeDecisivePerWindow&&
     counts.tp3>=SHADOW_REGIMES_RULES.minModeTp3PerWindow&&
     counts.stop>=SHADOW_REGIMES_RULES.minModeStopPerWindow;
   });
   const compared=sufficient?comparePairWindows(cohorts,{
    minDecisive:SHADOW_REGIMES_RULES.minModeDecisivePerWindow,
    minTp3:SHADOW_REGIMES_RULES.minModeTp3PerWindow,
    minStop:SHADOW_REGIMES_RULES.minModeStopPerWindow
   }):null;
   modeResults[mode]={state:compared?'DESCRIPTIVE':'COLLECTING',
    count:cohorts.map(countGroup),pairs:compared||[],
    reason:compared?'Описательные AUC на одинаковых исходах внутри режима.':
     'Недостаточно ≥10 TP3/SL с ≥3 каждого типа в каждом периоде.'};
  }
  const described=available.filter(mode=>
   modeResults[mode].state==='DESCRIPTIVE');
  const decisions=assessRegimePairReplication(basic.pairs,
   described.map(mode=>({mode,pairs:modeResults[mode].pairs})));
  frames[tf]=decisions?{
   state:described.length?'DESCRIPTIVE':'COLLECTING',
   reason:described.length?
    'Исследованы пары отдельно по предзаписанным режимам.':
    'Ни один режим пока не собрал достаточные три выборки.',
   availableModes:described.length,modeResults,pairs:decisions,
   modelChanged:false,calibratedProbability:null
  }:blank('INVALID_EVIDENCE','Не совпали зарегистрированные пары признаков.');
 }
 return {version:FEATURE_REGIME_REVIEW_VERSION,asset,frames,
  state:Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  modelChanged:false,calibratedProbability:null,
  note:'Этап 2 — исследование трёх фиксированных пар в направленном, '+
   'боковом и смешанном режимах на одних и тех же новых исходах. '+
   'Сходство признаков, прирост AUC и повторяемость — описательные '+
   'сигналы, а не подтверждение прибыльности или причинности. '+
   'Признаки и режим Radar определялись до исхода прогноза; '+
   'автоматического обучения и изменения весов нет.'};
}
/** Engineering progress != proven forecast quality. Independent test
 * evidence may still be COLLECTING after the entire stage ships.
 */
export function summarizeFeatureStageTwo(asset,pairs,review){
 const result={asset,state:'COLLECTING',checkedFrames:0,
  frames:{},trained:false,calibratedProbability:null};
 if(!assetOK(asset)||pairs?.asset!==asset||review?.asset!==asset||
  !pairs.frames||!review.frames)return result;
 for(const tf of TFS){
  const p=pairs.frames[tf],r=review.frames[tf];
  let state='COLLECTING';
  if(['INVALID_EVIDENCE','INVALID'].includes(p?.state)||[
   'INVALID_EVIDENCE','INVALID'].includes(r?.state))state='CHECK_DATA';
  else if(p?.state==='DESCRIPTIVE'&&r?.state==='DESCRIPTIVE'&&
   r.availableModes>=2)state='CHECKED';
  else if(p?.state==='DESCRIPTIVE')state='REGIMES_PENDING';
  result.frames[tf]={state,
   comparedPairs:p?.state==='DESCRIPTIVE'?p.pairs?.length||0:0,
   comparedModes:r?.availableModes||0,
   repeatedAcrossModes:r?.pairs?.filter(x=>
    x.state==='REPEATED_TWO_MODES').length||0};
  if(state==='CHECKED')result.checkedFrames++;
 }
 result.state=Object.values(result.frames).some(f=>
  f.state==='CHECK_DATA')?'CHECK_DATA':
  result.checkedFrames===3?'CHECKED':
   result.checkedFrames>0?'PARTIAL':'COLLECTING';
 return result;
}
