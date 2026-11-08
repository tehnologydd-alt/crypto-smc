/**
 * APEX Research Timeline v1 — descriptive, immutable Room research records.
 * Recorded stage events and validated finished H1 observations ONLY.
 * No simulated triggers, order instructions, target profits, or cancellations.
 */
export const RESEARCH_STEPS=Object.freeze([
 {key:'PUBLISHED',title:'Опубликован'},
 {key:'CONFIRMED',title:'Первое H1-подтверждение'},
 {key:'ACTIVE',title:'Второе H1-наблюдение'},
 {key:'EVALUATED',title:'Итог через четыре H1'}
]);
const HOUR=3600000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const basic=({state,steps=[],...extra})=>({state,steps,verifiedSteps:steps.filter(x=>x.observed).length,...extra});
const parseHypothesis=row=>{
 let h;
 try{h=typeof row?.hypothesis==='string'?JSON.parse(row.hypothesis):row?.hypothesis;}
 catch{return null;}
 if(!validAsset(row?.asset)||row?.interval!=='1h'||!time(row?.publishedAt)||
  !h||h.model!=='EMPIRICAL_CLOSE_RANGE_V1'||!time(h.anchorCloseAt)||
  h.anchorCloseAt%HOUR!==HOUR-1||!time(h.targetCloseAt)||
  h.targetCloseAt!==h.anchorCloseAt+4*HOUR||
  row.publishedAt<h.anchorCloseAt||row.publishedAt>=h.targetCloseAt||
  !finite(h.bandLow)||!finite(h.bandHigh)||!finite(h.anchorClose)||
  !(h.bandLow>0&&h.bandLow<h.anchorClose&&h.anchorClose<h.bandHigh)||
  row.id!=='range1:'+row.asset+':1h:'+h.anchorCloseAt)
  return null;
 return h;
};
function observedStages(row,h,now){
 const valid=new Map();
 for(const raw of Array.isArray(row.stageEvents)?row.stageEvents:[]){
  if(!raw||!['PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED'].includes(raw.stage)||
   !time(raw.observedAt)||!time(raw.recordedAt)||
   raw.recordedAt<raw.observedAt-60000||raw.recordedAt>now+60000)continue;
  if(raw.stage==='CONFIRMED'&&raw.observedAt!==h.anchorCloseAt+HOUR)continue;
  if(raw.stage==='ACTIVE'&&raw.observedAt!==h.anchorCloseAt+2*HOUR)continue;
  if(raw.stage==='COMPLETED'&&raw.observedAt!==h.targetCloseAt)continue;
  if(raw.stage==='PENDING_CONFIRMATION'&&
    (raw.observedAt<h.anchorCloseAt||raw.observedAt>h.targetCloseAt))continue;
  valid.set(raw.stage,{
   observedAt:raw.observedAt,recordedAt:raw.recordedAt,
   explanation:typeof raw.explanation==='string'?raw.explanation.slice(0,350):''
  });
 }
 return valid;
}
function validEvaluation(row,h,now){
 const result=row.evaluation;
 if(!result||!time(result.evaluatedAt)||result.evaluatedAt>now+60000||
  result.evaluatedAt<=h.targetCloseAt||
  result.targetCloseAt!==h.targetCloseAt||
  !finite(result.actualClose)||result.actualClose<=0||
  !['WITHIN_RANGE','OUTSIDE_RANGE'].includes(result.outcome))return null;
 const inside=result.actualClose>=h.bandLow&&result.actualClose<=h.bandHigh;
 if(inside!==(result.outcome==='WITHIN_RANGE'))return null;
 return {outcome:result.outcome,actualClose:result.actualClose,
  evaluatedAt:result.evaluatedAt,targetCloseAt:h.targetCloseAt};
}
export function inspectResearchTimeline(row,{now=Date.now()}={}){
 if(!time(now))return basic({state:'INVALID',reason:'Некорректные часы'});
 const h=parseHypothesis(row);
 if(!h)return basic({state:'INVALID',reason:'Исходная гипотеза не прошла проверку'});
 if(row.publishedAt>now+60000)return basic({state:'INVALID',reason:'Дата публикации находится в будущем'});
 const events=observedStages(row,h,now);
 // A stage event can be attached after the source closed. The observedAt
 // is the actual source timestamp. Never use recordedAt as event time.
 const confirmed=events.get('CONFIRMED');
 const active=events.get('ACTIVE');
 const evaluation=validEvaluation(row,h,now);
 const badResult=Boolean(row.evaluation&&!evaluation);
 const steps=[
  {key:'PUBLISHED',title:'Гипотеза опубликована',observed:true,
   at:row.publishedAt,recordedAt:row.publishedAt,
   detail:'Неизменяемые условия сохранены в Room'},
  {key:'CONFIRMED',title:'Первое H1-подтверждение',
   observed:Boolean(confirmed),at:confirmed?.observedAt??null,
   recordedAt:confirmed?.recordedAt??null,
   detail:confirmed?.explanation||'Нет подтверждённой записи о первом закрытии'},
  {key:'ACTIVE',title:'Второе H1-наблюдение',
   observed:Boolean(active),at:active?.observedAt??null,
   recordedAt:active?.recordedAt??null,
   detail:active?.explanation||'Второе наблюдение ещё не зафиксировано'},
  {key:'EVALUATED',title:'Проверка четвёртого H1',
   observed:Boolean(evaluation),at:evaluation?.targetCloseAt??null,
   recordedAt:evaluation?.evaluatedAt??null,
   detail:evaluation?
    (evaluation.outcome==='WITHIN_RANGE'?
     'Итоговое закрытие внутри исходного диапазона':
     'Итоговое закрытие вне исходного диапазона'):
    'Проверенный итог ещё не получен'}
 ];
 const due=now>h.targetCloseAt&&!evaluation;
 const state=badResult?'INCONSISTENT_RESULT':
  evaluation?'EVALUATED':due?'DUE_UNVERIFIED':
  active?'ACTIVE':confirmed?'CONFIRMED':'PENDING_CONFIRMATION';
 return basic({state,steps,anchorCloseAt:h.anchorCloseAt,
  targetCloseAt:h.targetCloseAt,remainingMs:due||evaluation?null:
   Math.max(0,h.targetCloseAt-now),dueUnverified:due,
  result:evaluation,bandLow:h.bandLow,bandHigh:h.bandHigh,
  lastRecordedAt:Math.max(row.publishedAt,
   ...steps.map(x=>x.recordedAt||0)),
  note:badResult?'Сохранённый итог не согласуется с исходным диапазоном или временем':
   due?'Срок наблюдения прошёл, но исход не подтверждён сохранёнными свечами':
   'Статусы основаны только на записи исследования и фактических закрытиях H1'});
}
