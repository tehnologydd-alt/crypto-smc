/**
 * APEX: frozen PRE-OUTCOME signal strength and strictly observational audit.
 * Strength is NOT a forecast probability, an instruction to trade, or a
 * trained model. Neither direction nor TP/SL changes in this module.
 */
import {directionalHypothesis} from './directional-scenario.mjs';
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {multiFrameHypothesis,multiFrameEvidence} from './forecast-multiframe.mjs';

export const PREOUTCOME_STRENGTH_VERSION='PREOUTCOME_SIGNAL_STRENGTH_V1';
export const STRENGTH_AUDIT_VERSION='APEX_PREOUTCOME_STRENGTH_AUDIT_V1';
export const STRENGTH_AUDIT_RULES=Object.freeze({
 minScored:48,minDecisive:60,minLateDecisive:24,
 minPerComparedBand:8,
 bins:[{key:'b0',min:0,max:39.9,label:'0–39,9'},
       {key:'b1',min:40,max:59.9,label:'40–59,9'},
       {key:'b2',min:60,max:79.9,label:'60–79,9'},
       {key:'b3',min:80,max:100,label:'80–100'}],
 event:'TP3_VS_STOP_CONDITIONAL_ON_DECISIVE_OUTCOMES',
 trainingEnabled:false,calibratedProbability:null
});
const stamp=x=>Number.isSafeInteger(x)&&x>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const scoreRound=x=>Math.round(x*10)/10;
const TF=['15m','1h','4h'];
const frameOf=row=>{
 if(multiFrameHypothesis(row)&&['15m','4h'].includes(row.interval))
  return row.interval;
 if(directionalHypothesis(row)&&row.interval==='1h')
  return '1h';
 return null;
};
const payload=row=>{
 try{
  return typeof row.hypothesis==='string'?
   JSON.parse(row.hypothesis):row.hypothesis;
 }catch{return null;}
};
/** Recompute precommitted formula from the frozen feature vector. */
export function inspectPreOutcomeStrength(row){
 const h=payload(row),s=h?.preOutcomeStrength;
 if(!s||s.state==='UNAVAILABLE')return {state:'ABSENT',reason:'Нет балла, зафиксированного до исхода'};
 if(s?.version!==PREOUTCOME_STRENGTH_VERSION||
  s.state!=='OBSERVED'||s.scope!=='CLOSED_PRICE_VOLUME_ONLY_UNTRAINED'||
  s.scoreType!=='UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY'||
  s.event!=='TERMINAL_TP3_VS_STOP'||
  !TF.includes(s.interval)||s.interval!==row.interval||
  s.calibratedProbability!==null||
  h.calibratedProbability!==null||
  !stamp(s.capturedAt)||!stamp(s.candleCutoffAt)||
  !stamp(row.publishedAt)||s.capturedAt!==row.publishedAt||
  s.candleCutoffAt!==h.anchorCloseAt||
  s.candleCutoffAt>=s.capturedAt||
  s.sampleBars!==96||
  !finite(s.efficiency)||s.efficiency<0||s.efficiency>1||
  !finite(s.travelNorm)||s.travelNorm<0||s.travelNorm>1||
  !finite(s.volumeNorm)||s.volumeNorm<0||s.volumeNorm>1||
  typeof s.volumeAvailable!=='boolean'||
  !s.volumeAvailable&&s.volumeNorm!==.5||
  !finite(s.score)||s.score<0||s.score>100)
  return {state:'INVALID',reason:'Нарушен формат или временная граница экспериментального балла'};
 const expected=scoreRound(100*(.5*s.efficiency+.3*s.travelNorm+.2*s.volumeNorm));
 if(Math.abs(s.score-expected)>1e-8)
  return {state:'INVALID',reason:'Экспериментальный балл не соответствует опубликованным составляющим'};
 return {state:'VERIFIED',score:s.score,features:{
  efficiency:s.efficiency,travelNorm:s.travelNorm,
  volumeNorm:s.volumeNorm,volumeAvailable:s.volumeAvailable
 }};
}
const fresh=()=>({published:0,scored:0,missing:0,invalid:0,legacyH1:0,
 excludedOverlap:0,unfinished:0,lateResult:0,unverified:0,
 other:0,decisive:0,tp3:0,stop:0,
 bands:Object.fromEntries(STRENGTH_AUDIT_RULES.bins.map(b=>[
  b.key,{label:b.label,scored:0,tp3:0,stop:0,other:0,
   unfinished:0,share:null}]))});
function sample(items,{now,cutAt=null}={}){
 const summary=fresh();let occupied=-Infinity;
 const sorted=items.slice().sort((a,b)=>a.publishedAt-b.publishedAt||
  a.id.localeCompare(b.id));
 summary.published=sorted.length;
 for(const row of sorted){
  const frame=frameOf(row);
  const inspected=inspectPreOutcomeStrength(row);
  if(inspected.state==='ABSENT'){summary.missing++;continue;}
  if(inspected.state==='INVALID'){summary.invalid++;continue;}
  const checked=frame==='1h'?verifiedDirectionalEvidence(row,{now}):
   multiFrameEvidence(row,{now});
  if(checked.state!=='OBSERVED'||!checked.plan){
   summary.unverified++;continue;
  }
  if(frame==='1h'&&checked.source!=='M5'){
   summary.legacyH1++;continue;
  }
  const target=checked.plan.targetCloseAt;
  if(!stamp(target)||target<=row.publishedAt){
   summary.invalid++;continue;
  }
  if(row.publishedAt<=occupied){
   summary.excludedOverlap++;continue;
  }
  occupied=target;
  // Embargo on older window: the candidate and its outcome must precede
  // later published observations. Never select examples by outcome.
  if(cutAt!==null&&target>=cutAt){
   summary.excludedOverlap++;continue;
  }
  const bin=STRENGTH_AUDIT_RULES.bins.find(x=>
   inspected.score>=x.min-1e-8&&inspected.score<=x.max+1e-8);
  if(!bin){summary.invalid++;continue;}
  const arm=summary.bands[bin.key];
  summary.scored++;arm.scored++;
  if(!checked.finished){
   summary.unfinished++;arm.unfinished++;continue;
  }
  if(!stamp(row.evaluation?.evaluatedAt)||
   row.evaluation.evaluatedAt>now+60000||
   cutAt!==null&&(row.evaluation.evaluatedAt>=cutAt||
    row.stageEvents.some(e=>e?.recordedAt>=cutAt))){
   summary.lateResult++;continue;
  }
  const outcome=checked.outcome;
  if(outcome==='TP3'||outcome==='STOP'){
   summary.decisive++;
   if(outcome==='TP3'){summary.tp3++;arm.tp3++;}
   else{summary.stop++;arm.stop++;}
  }else{summary.other++;arm.other++;}
 }
 for(const item of Object.values(summary.bands)){
  const n=item.tp3+item.stop;
  item.share=n?item.tp3/n:null;
 }
 return summary;
}
export function auditPreOutcomeStrength(rows,{
 asset,complete=false,publishedCount=null,now=Date.now()
}={}){
 const invalid=(state,reason)=>({version:STRENGTH_AUDIT_VERSION,
  state,asset,reason,frames:null,rules:STRENGTH_AUDIT_RULES,
  calibratedProbability:null,trainingEnabled:false});
 if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset)||
  !Array.isArray(rows)||!stamp(now)||
  rows.some(row=>row?.asset!==asset||typeof row.id!=='string'||
   !row.id||!stamp(row.publishedAt)||row.publishedAt>now+60000))
  return invalid('INVALID','Неверная история или выбранный актив');
 if(complete!==true||!Number.isSafeInteger(publishedCount)||
  publishedCount!==rows.length)
  return invalid('INCOMPLETE','Для исследования требуется полный Room-архив одного актива');
 if(new Set(rows.map(row=>row.id)).size!==rows.length)
  return invalid('INVALID','Повторяющиеся идентификаторы в журнале Room');
 const frames={};
 for(const frame of TF){
  const cohort=rows.filter(row=>frameOf(row)===frame)
   .sort((a,b)=>a.publishedAt-b.publishedAt||a.id.localeCompare(b.id));
  const total=sample(cohort,{now});
  const scored=cohort.filter(x=>inspectPreOutcomeStrength(x).state==='VERIFIED');
  let reference=null,late=null,splitAt=null;
  if(scored.length>=STRENGTH_AUDIT_RULES.minScored){
   const idx=Math.floor(scored.length*.60);
   splitAt=scored[idx]?.publishedAt||null;
   if(splitAt>scored[idx-1]?.publishedAt){
    reference=sample(scored.slice(0,idx),{now,cutAt:splitAt});
    late=sample(scored.slice(idx),{now});
   }
  }
  let state='COLLECTING',reason='Нужны новые, заранее зафиксированные баллы.';
  if(total.invalid||total.unverified||reference?.invalid||late?.invalid||
   reference?.unverified||late?.unverified){
   state='UNVERIFIED';
   reason='Часть сохранённых оценок или исходов не прошла проверку Room.';
  }else if(reference&&late&&total.decisive>=STRENGTH_AUDIT_RULES.minDecisive&&
    late.decisive>=STRENGTH_AUDIT_RULES.minLateDecisive){
   const good=bins=>Object.values(bins).filter(x=>
    x.tp3+x.stop>=STRENGTH_AUDIT_RULES.minPerComparedBand);
   const early=good(reference.bands),recent=good(late.bands);
   const common=early.filter(x=>recent.some(y=>y.label===x.label));
   if(common.length>=2){
    state='DESCRIPTIVE';
    reason='Сопоставимы две группы силы сигнала в ранних и поздних новых наблюдениях.';
   }else reason='Нужно ≥8 однозначных TP3/SL в двух общих группах обеих выборок.';
  }else if(total.missing>0)
   reason='Старые прогнозы не содержали такого балла: задним числом его не вычисляем.';
  frames[frame]={frame,state,reason,total,reference,late,splitAt,
   precommitted:total.scored,oldWithoutScore:total.missing,
   calibratedProbability:null,modelWeightChanged:false};
 }
 return {version:STRENGTH_AUDIT_VERSION,asset,
  state:Object.values(frames).some(x=>x.state==='DESCRIPTIVE')?
   'DESCRIPTIVE':'COLLECTING',
  frames,calibratedProbability:null,trainingEnabled:false,
  note:'Балл силы сигнала — НЕ вероятность TP3, не вероятность прибыли и не торговый сигнал. '+
   'Группы считаются только по полностью проверенным, непересекающимся исходам. '+
   'Результаты рыночных событий могут оставаться зависимыми; модель не обучается автоматически.',
  rules:STRENGTH_AUDIT_RULES};
}
