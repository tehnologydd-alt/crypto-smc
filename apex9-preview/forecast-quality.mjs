/**
 * APEX V2 research-quality scoreboard, based ONLY on native Room evidence.
 * Direction is published on H1, points are evaluated by M5 for new studies.
 * A TP touched before a later SL is counted as a touch, never as a winning trade.
 * Older H1-evaluated studies are excluded from the M5 cohort.
 */
import {directionalHypothesis,planDirectionalScenario} from './directional-scenario.mjs';
import {forecastStage} from './favorite-logic.mjs';

const POINTS=['TP1','TP2','TP3'];
const TERMINAL={TP3:'tp3',STOP:'stop',AMBIGUOUS:'ambiguous',
 NOT_ENTERED:'notEntered',HORIZON:'expired'};
const FINAL_STAGE={TP3:'TP3',STOP:'SL',AMBIGUOUS:'ORDER_UNKNOWN',
 NOT_ENTERED:'NO_ENTRY',HORIZON:'TIMEOUT'};
const STAGE_NAMES=new Set(['CONFIRMED','ACTIVE','TP1','TP2','TP3',
 'SL','ORDER_UNKNOWN','NO_ENTRY','TIMEOUT','COMPLETED']);
const M5=300000,H1=3600000;
const timestamp=t=>Number.isSafeInteger(t)&&t>0;
const freshNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const empty=()=>({
 published:0,awaiting:0,entered:0,finished:0,
 tp1:0,tp2:0,tp3:0,stop:0,ambiguous:0,notEntered:0,expired:0,
 invalid:0,unverified:0,up:0,down:0,
 completedWithEntry:0,
});
const invalid=reason=>({state:'INVALID',reason});
const unknown=reason=>({state:'UNVERIFIED',reason});
/**
 * Every piece of evidence is first checked against the same immutable
 * published plan. M5 and H1 events cannot be mixed or silently relabelled.
 */
export function verifiedDirectionalEvidence(row,{now=Date.now()}={}){
 if(!directionalHypothesis(row))return {state:'NOT_DIRECTIONAL'};
 const found=planDirectionalScenario(row,{now});
 if(found.state!=='READY')return invalid(found.reason||'Не проверен исходный прогноз');
 const plan=found.plan;
 const period=plan.evaluationInterval==='5m'?M5:H1;
 const source=plan.evaluationInterval==='5m'?'M5':'H1';
 const events=new Map();
 if(!Array.isArray(row.stageEvents))return unknown('Нет сохранённого журнала этапов');
 for(const stage of row.stageEvents){
  if(!stage||!STAGE_NAMES.has(stage.stage))continue;
  if(events.has(stage.stage))return invalid('Два разных события с одним названием');
  if(!timestamp(stage.observedAt)||!timestamp(stage.recordedAt)||
   stage.observedAt<plan.publishedAt||
   stage.observedAt>plan.targetCloseAt||
   stage.observedAt>now||
   stage.recordedAt<stage.observedAt||
   stage.recordedAt>now+60000)
   return invalid('Событие вне горизонта или с неверным временем');
  // Native observer records the close time of the *finished* source candle.
  if(stage.observedAt%period!==period-1)
   return invalid('Этап записан не по завершённой '+source+'-свече');
  events.set(stage.stage,stage);
 }
 const confirmed=events.get('CONFIRMED');
 const touched=POINTS.filter(point=>events.has(point));
 if(touched.length&&(!confirmed||!events.has('TP1')))
  return invalid('TP без подтверждённой опорной цены или TP1');
 if(events.has('TP2')&&!events.has('TP1')||
  events.has('TP3')&&!events.has('TP2'))
  return invalid('Нарушена последовательность TP1–TP3');
 if(confirmed&&touched.some(point=>
  events.get(point).observedAt<confirmed.observedAt))
  return invalid('TP раньше опорной цены');
 if(events.has('TP2')&&events.get('TP2').observedAt<events.get('TP1').observedAt||
  events.has('TP3')&&events.get('TP3').observedAt<events.get('TP2').observedAt)
  return invalid('TP не по порядку касаний');
 const evaluation=row.evaluation;
 const stage=forecastStage(row);
 const done=events.get('COMPLETED');
 if(!evaluation){
  if(stage==='COMPLETED'||done)return unknown('Завершение без исхода Room');
  if([...events.keys()].some(key=>['SL','ORDER_UNKNOWN','NO_ENTRY','TIMEOUT','TP3'].includes(key)))
   return unknown('Контрольный итог без сохранённого результата');
  return {state:'OBSERVED',source,plan,entered:Boolean(confirmed),
   touched,finished:false,outcome:null,stage};
 }
 if(stage!=='COMPLETED'||!done)
  return invalid('Исход есть, но статус завершения не подтверждён');
 const outcome=evaluation.outcome;
 const finalKey=FINAL_STAGE[outcome];
 if(!finalKey||!events.has(finalKey)||
  !timestamp(evaluation.evaluatedAt)||evaluation.evaluatedAt>now+60000||
  evaluation.evaluatedAt<done.observedAt||
  evaluation.targetCloseAt!==plan.targetCloseAt||
  !freshNumber(evaluation.actualClose))
  return invalid('Итог не согласован с сохранёнными уровнями и временем');
 const terminalAt=events.get(finalKey).observedAt;
 if(done.observedAt!==terminalAt||
  touched.some(point=>events.get(point).observedAt>terminalAt)||
  (confirmed&&confirmed.observedAt>terminalAt))
  return invalid('Касания и завершение имеют невозможный порядок');
 if(outcome==='TP3'&&(!confirmed||touched.length!==3)||
  outcome==='NOT_ENTERED'&&(Boolean(confirmed)||touched.length>0)||
  outcome==='HORIZON'&&!confirmed||
  outcome==='STOP'&&!confirmed)
  return invalid('Итог противоречит истории входа и TP');
 if((outcome==='NOT_ENTERED'||outcome==='HORIZON')&&
  terminalAt!==plan.targetCloseAt)
  return invalid('Срок истёк не по опубликованному горизонту');
 return {state:'OBSERVED',source,plan,entered:Boolean(confirmed),touched,
  finished:true,outcome,terminalAt,stage};
}
function tally(items,{now}){
 const score=empty();
 for(const row of items){
  const record=verifiedDirectionalEvidence(row,{now});
  if(record.state==='NOT_DIRECTIONAL')continue;
  if(record.state==='INVALID'){score.invalid++;continue;}
  if(record.state==='UNVERIFIED'){score.unverified++;continue;}
  // M5 is the current research cohort. H1 gets a distinct historical cohort.
  if(record.source!=='M5')continue;
  score.published++;
  if(record.plan.side==='UP')score.up++;
  else score.down++;
  if(record.entered)score.entered++;
  if(!record.finished)score.awaiting++;
  else {
   score.finished++;
   if(record.entered)score.completedWithEntry++;
   score[TERMINAL[record.outcome]]++;
  }
  for(const key of record.touched)score[key.toLowerCase()]++;
 }
 return score;
}
export function directionalQualitySummary(rows,{selectedIds=[],now=Date.now()}={}){
 const all=Array.isArray(rows)?rows:[];
 const chosen=new Set(selectedIds);
 const active=all.filter(row=>directionalHypothesis(row));
 const h1=active.filter(row=>verifiedDirectionalEvidence(row,{now}).source==='H1');
 return {
  all:tally(active,{now}),
  tracked:tally(active.filter(row=>chosen.has(row.id)),{now}),
  archivedH1:h1.length,
  truncated:false
 };
}
