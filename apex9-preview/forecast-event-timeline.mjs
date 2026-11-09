/**
 * APEX timeline built from verified immutable Room stage events.
 * H1 determines direction; M5 tracks levels for newly published studies.
 * No assumed intrabar order, retroactive targets, or exchange fills.
 */
import {verifiedDirectionalEvidence} from './forecast-quality.mjs';

const stageLevel=Object.freeze({
 CONFIRMED:'entry',TP1:'tp1',TP2:'tp2',TP3:'tp3',SL:'sl'
});
const outcomeStage=Object.freeze({
 TP3:'TP3',STOP:'SL',AMBIGUOUS:'ORDER_UNKNOWN',
 NOT_ENTERED:'NO_ENTRY',HORIZON:'TIMEOUT'
});
const titles=Object.freeze({
 PUBLISHED:'Прогноз · лимитный',CONFIRMED:'Активный · вход',
 TP1:'TP1',TP2:'TP2',TP3:'TP3',SL:'SL',
 ORDER_UNKNOWN:'Порядок неизвестен',
 NO_ENTRY:'Без входа',TIMEOUT:'Срок истёк'
});
const rank=Object.freeze({
 PUBLISHED:0,CONFIRMED:1,TP1:2,TP2:3,TP3:4,
 SL:5,ORDER_UNKNOWN:5,NO_ENTRY:5,TIMEOUT:5
});
function event(stage,at,plan,{terminal=false}={}){
 return {stage,label:titles[stage],at,terminal,
  price:stageLevel[stage]?plan[stageLevel[stage]]:null,
  source:stage==='PUBLISHED'?'Публикация':plan.evaluationInterval==='5m'?'M5':'H1'};
}
export function buildForecastEventTimeline(row,{now=Date.now()}={}){
 const checked=verifiedDirectionalEvidence(row,{now});
 if(checked.state==='NOT_DIRECTIONAL')return {state:'LEGACY',events:[],
  reason:'Старая гипотеза диапазона без направленных контрольных уровней'};
 if(checked.state!=='OBSERVED')return {state:'UNVERIFIED',events:[],
  reason:checked.reason||'Исходная история Room не подтверждена'};
 const {plan,source,finished,outcome}=checked;
 const recorded=new Map((row.stageEvents||[]).filter(x=>x&&
  ['CONFIRMED','TP1','TP2','TP3','SL','ORDER_UNKNOWN','NO_ENTRY','TIMEOUT']
   .includes(x.stage)).map(x=>[x.stage,x.observedAt]));
 const finalStage=finished?outcomeStage[outcome]:null;
 const entries=[event('PUBLISHED',plan.publishedAt,plan)];
 if(recorded.has('CONFIRMED'))
  entries.push(event('CONFIRMED',recorded.get('CONFIRMED'),plan));
 for(const key of ['TP1','TP2','TP3']){
  if(recorded.has(key))
   entries.push(event(key,recorded.get(key),plan,{
    terminal:finished&&finalStage===key
   }));
 }
 if(finalStage&&finalStage!=='TP3'&&recorded.has(finalStage))
  entries.push(event(finalStage,recorded.get(finalStage),plan,{terminal:true}));
 entries.sort((a,b)=>a.at-b.at||rank[a.stage]-rank[b.stage]);
 return {
  state:'VERIFIED',source,plan,events:entries,finished:Boolean(finished),
  outcome:finished?outcome:null,
  entered:checked.entered,
  targetCloseAt:plan.targetCloseAt,
  touchedTargets:checked.touched.length,
  label:entries.filter(x=>x.stage!=='PUBLISHED').map(x=>x.label).join(' → ')||
   'Ожидаем касания входа',
  note:source+' · отметки закрытых свечей из Room; это не исполненные ордера.'
 };
}
