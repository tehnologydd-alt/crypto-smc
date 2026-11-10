/**
 * Objective probability readiness, not an estimate for any new prediction.
 * Only full native Room asset archives and genuinely non-overlapping horizons.
 * Success is terminal TP3; STOP and all OTHER outcomes are kept separately.
 * H1 is M5-verified; old H1 observational cohorts are excluded.
 */
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';

export const READINESS_VERSION='APEX_PROBABILITY_READINESS_V1';
export const READINESS_RULES=Object.freeze({
 split:.6,minPublished:30,minDecisive:40,minHoldoutDecisive:20,
 event:'TERMINAL_TP3_VS_TERMINAL_STOP',calibratedProbability:false,
 autoTraining:false,interval:'WILSON_95_DESCRIPTIVE_ONLY',
 source:'COMPLETE_LOCAL_ROOM_PER_FAVORITE_ARCHIVE'
});
const FRAMES=['15m','1h','4h'];
const stamp=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const outcomeKeys=['TP3','STOP','AMBIGUOUS','NOT_ENTERED','HORIZON'];
const frameOf=row=>{
 if(multiFrameHypothesis(row)&&['15m','4h'].includes(row.interval))return row.interval;
 if(directionalHypothesis(row)&&row.interval==='1h')return '1h';
 return null;
};
export function wilsonIndicative(success,total){
 if(!Number.isSafeInteger(success)||!Number.isSafeInteger(total)||
  total<1||success<0||success>total)return null;
 const z=1.959963984540054,z2=z*z,p=success/total;
 const denominator=1+z2/total;
 const center=(p+z2/(2*total))/denominator;
 const radius=z/denominator*Math.sqrt(p*(1-p)/total+z2/(4*total*total));
 return {lower:Math.max(0,center-radius),upper:Math.min(1,center+radius),
  note:'Binomial approximation only; independence not demonstrated'};
}
const empty=()=>({published:0,verified:0,overlapExcluded:0,
 invalid:0,legacyH1:0,awaiting:0,lateOutcome:0,
 outcomes:Object.fromEntries(outcomeKeys.map(k=>[k,0])),
 resolved:0,decisive:0,tp3OfDecisive:null,tp3OfAllVerified:null,
 indicativeWilson95:null});
function tally(rows,{now,cutAt=null}={}){
 const scored=empty();
 const ordered=rows.slice().sort((a,b)=>
  a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
 scored.published=ordered.length;
 let occupied=-Infinity;
 for(const row of ordered){
  const frame=frameOf(row);
  const check=frame==='1h'?verifiedDirectionalEvidence(row,{now}):
   multiFrameEvidence(row,{now});
  if(check.state!=='OBSERVED'||!check.plan||
    !stamp(check.plan.targetCloseAt)||
    check.plan.targetCloseAt<=row.publishedAt){
   scored.invalid++;continue;
  }
  if(frame==='1h'&&check.source!=='M5'){scored.legacyH1++;continue;}
  if(row.publishedAt<=occupied){scored.overlapExcluded++;continue;}
  // The selection is based on the immutable horizon, BEFORE the outcome.
  occupied=check.plan.targetCloseAt;
  if(cutAt!==null&&check.plan.targetCloseAt>=cutAt){
   scored.overlapExcluded++;continue;
  }
  scored.verified++;
  if(!check.finished){scored.awaiting++;continue;}
  const at=row.evaluation?.evaluatedAt;
  if(!stamp(at)||at>now+60000||
    cutAt!==null&&(at>=cutAt||
     (Array.isArray(row.stageEvents)&&row.stageEvents.some(event=>
      event?.recordedAt>=cutAt)))){
   // The terminal result AND every required source milestone must have been
   // recorded before the holdout began, not just observed on an older candle.
   scored.lateOutcome++;continue;
  }
  if(!outcomeKeys.includes(check.outcome)){scored.invalid++;continue;}
  scored.outcomes[check.outcome]++;
 }
 scored.resolved=Object.values(scored.outcomes).reduce((a,b)=>a+b,0);
 scored.decisive=scored.outcomes.TP3+scored.outcomes.STOP;
 scored.tp3OfDecisive=scored.decisive?
  scored.outcomes.TP3/scored.decisive:null;
 scored.tp3OfAllVerified=scored.verified?
  scored.outcomes.TP3/scored.verified:null;
 scored.indicativeWilson95=wilsonIndicative(
  scored.outcomes.TP3,scored.decisive);
 return scored;
}
function analyzeFrame(rows,frame,{now}={}){
 const cohort=rows.filter(row=>frameOf(row)===frame)
  .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
 const baseline={frame,published:cohort.length,status:'MORE_DATA',
  reason:'Недостаточно наблюдений',
  reference:null,holdout:null,cutAt:null,
  total:null,calibration:'NOT_AVAILABLE',
  readyForModelTraining:false};
 if(!cohort.length)return {...baseline,reason:'Нет направленных прогнозов этого ТФ'};
 const total=tally(cohort,{now});
 const hasScores=cohort.some(row=>{
  let h;
  try{h=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
  catch{h=null;}
  return h?.calibratedProbability!==undefined&&h?.calibratedProbability!==null;
 });
 const result={...baseline,total,
  // Current native publisher stores null. Historical arbitrary scores are
  // not accepted as pre-registered, verified probabilistic predictions.
  calibration:hasScores?'UNVERIFIED_SCORES':'NO_PUBLISHED_PROBABILITIES'};
 if(total.invalid)return {...result,status:'INVALID_EVIDENCE',
  reason:'Есть неподтверждённые события Room'};
 if(cohort.length<READINESS_RULES.minPublished)
  return {...result,reason:'Опубликовано менее 30 направленных прогнозов'};
 const idx=Math.floor(cohort.length*READINESS_RULES.split);
 const cutAt=cohort[idx]?.publishedAt;
 if(!stamp(cutAt)||cutAt<=cohort[idx-1].publishedAt)
  return {...result,status:'INVALID_EVIDENCE',
   reason:'Не удалось разделить ранние и поздние публикации'};
 const reference=tally(cohort.slice(0,idx),{now,cutAt});
 const holdout=tally(cohort.slice(idx),{now});
 const scored={...result,reference,holdout,cutAt};
 if(reference.invalid||holdout.invalid)
  return {...scored,status:'INVALID_EVIDENCE',
   reason:'Один из периодов содержит неподтверждённые события'};
 if(total.decisive<READINESS_RULES.minDecisive||
  holdout.decisive<READINESS_RULES.minHoldoutDecisive)
  return {...scored,reason:'Нужно ≥40 TP3/SL всего и ≥20 в позднем периоде'};
 return {...scored,status:'FREQUENCY_OBSERVED',
  reason:'Исторические частоты проверены; вероятности новых прогнозов ещё не публикуются'};
}
export function auditProbabilityReadiness(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const fail=(status,reason)=>({version:READINESS_VERSION,
  status,reason,asset,frames:null,calibratedProbability:null,
  approvedForTraining:false,rules:READINESS_RULES});
 if(!validAsset(asset)||!stamp(now)||!Array.isArray(rows)||
  rows.some(r=>r?.asset!==asset||typeof r.id!=='string'||!r.id||
   !stamp(r.publishedAt)||r.publishedAt>now+60000))
  return fail('INVALID','Повреждённая исходная история или некорректный актив');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return fail('INCOMPLETE','Требуется полный Room-архив одного избранного актива');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)
  return fail('INVALID','В архиве повторяются идентификаторы');
 const frames=Object.fromEntries(FRAMES.map(tf=>[
  tf,analyzeFrame(rows,tf,{now})]));
 const ready=Object.values(frames).filter(f=>
  f.status==='FREQUENCY_OBSERVED').length;
 return {version:READINESS_VERSION,asset,archiveRows:rows.length,
  status:ready?'DESCRIPTIVE':'MORE_DATA',
  frames,readyFrames:ready,calibratedProbability:null,
  approvedForTraining:false,
  note:'Частота TP3 среди TP3/SL не является вероятностью прибыли или '+
   'прогнозом будущего исхода. Интервал Wilson предполагает независимые события, '+
   'чего рыночные данные не гарантируют. Для калибровки нужны заранее '+
   'опубликованные неизменяемые вероятности и независимые будущие исходы.',
  rules:READINESS_RULES};
}
