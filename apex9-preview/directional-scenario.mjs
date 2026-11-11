/**
 * Immutable, read-only single-direction research scenario.
 * No trades are placed. A level touch is a verified H1 observation, not execution.
 * If entry and a terminal level share one H1 bar, ordering is unknowable.
 */
import {computeReferenceLevels} from './research-level-sequence.mjs';

export const DIRECTIONAL_MODEL='EMPIRICAL_DIRECTION_LEVELS_V2';
export const DIRECTIONAL_LEVEL_VERSION='H1_SINGLE_LEVELS_V2';
export const DIRECTIONAL_HOURS=24;
const H=3600000;
const price=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const stamp=n=>Number.isSafeInteger(n)&&n>0;
const near=(a,b)=>price(a)&&price(b)&&Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*2e-11);
const empty=(state,reason)=>({state,reason,plan:null});
const parse=row=>{
 try{return typeof row?.hypothesis==='string'?JSON.parse(row.hypothesis):row?.hypothesis;}
 catch{return null;}
};
export function directionalHypothesis(row){
 const h=parse(row);
 return h?.model===DIRECTIONAL_MODEL?h:null;
}
export function planDirectionalScenario(row,{now=Date.now()}={}){
 const h=directionalHypothesis(row);
 if(!h)return empty('LEGACY','Архивная гипотеза диапазона без выбранного направления');
 if(!stamp(now)||!stamp(row?.publishedAt)||row.publishedAt>now+60000||
  row.interval!=='1h'||typeof row.asset!=='string'||
  !/^[A-Z0-9]{5,20}$/.test(row.asset)||
  !stamp(h.anchorCloseAt)||h.anchorCloseAt%H!==H-1||
  !stamp(h.targetCloseAt)||h.targetCloseAt!==h.anchorCloseAt+DIRECTIONAL_HOURS*H||
  !stamp(h.horizonBars)||h.horizonBars!==DIRECTIONAL_HOURS||
  row.publishedAt<h.anchorCloseAt||row.publishedAt>=h.anchorCloseAt+H||
  row.id!=='direction2:'+row.asset+':1h:'+h.anchorCloseAt||
  !['UP','DOWN'].includes(h.direction)||
  h.decisionMethod!=='SIX_BAR_EFFICIENCY_V1')
  return empty('INVALID','Данные публикации направления не согласованы');
 const evalInterval=h.evaluationInterval===undefined?'1h':h.evaluationInterval;
 if(!['1h','5m','1m'].includes(evalInterval)||
  (evalInterval==='5m'&&h.observationMethod!=='M5_CLOSED_LEVEL_ORDER_V1')||
  (evalInterval==='1m'&&h.observationMethod!=='M1_CLOSED_LEVEL_ORDER_V1')||
  (h.stageSemantics!==undefined&&!['LIMIT_READY_M5_V1','LIMIT_READY_M1_V1'].includes(h.stageSemantics))||
  (h.stageSemantics==='LIMIT_READY_M5_V1'&&evalInterval!=='5m')||
  (h.stageSemantics==='LIMIT_READY_M1_V1'&&evalInterval!=='1m'))
  return empty('INVALID','Неверно заявлен метод проверки контрольных точек');
 const all=computeReferenceLevels(h.anchorClose,h.bandLow,h.bandHigh);
 const saved=h.levelStudy,expected=all?.[h.direction];
 if(!expected||saved?.version!==DIRECTIONAL_LEVEL_VERSION||
  saved.direction!==h.direction||!near(saved.entry,h.anchorClose)||
  !['tp1','tp2','tp3','sl'].every(k=>near(saved[k],expected[k])))
  return empty('INVALID','Изменённые или несогласованные уровни опубликованного сценария');
 const chronological=h.direction==='UP'?
  saved.sl<saved.entry&&saved.entry<saved.tp1&&saved.tp1<saved.tp2&&saved.tp2<saved.tp3:
  saved.tp3<saved.tp2&&saved.tp2<saved.tp1&&saved.tp1<saved.entry&&saved.entry<saved.sl;
 if(!chronological)return empty('INVALID','Нарушен порядок опубликованных уровней');
 return {state:'READY',reason:null,plan:{
  model:DIRECTIONAL_MODEL,version:DIRECTIONAL_LEVEL_VERSION,
  side:h.direction,asset:row.asset,id:row.id,
  publishedAt:row.publishedAt,anchorCloseAt:h.anchorCloseAt,
  targetCloseAt:h.targetCloseAt,evaluationInterval:evalInterval,
  stageSemantics:h.stageSemantics||'LEGACY_ENTRY_STAGE',entry:saved.entry,
  tp1:saved.tp1,tp2:saved.tp2,tp3:saved.tp3,sl:saved.sl,
  origin:'PUBLISHED',source:'Binance Spot · закрытые H1'
 }};
}
function validBar(b,closeAt,now){
 return b?.closed===true&&b.closeAt===closeAt&&
  b.t===closeAt-H+1&&closeAt<now&&
  [b.open,b.high,b.low,b.close].every(price)&&
  typeof b.volume==='number'&&Number.isFinite(b.volume)&&b.volume>=0&&
  b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close);
}
export function auditDirectionalScenario(plan,candles,{now=Date.now()}={}){
 if(plan?.evaluationInterval==='1m')
  return auditDirectionalM1(plan,candles,{now});
 if(plan?.evaluationInterval==='5m')
  return auditDirectionalM5(plan,candles,{now});
 const bad=(state,reason)=>({state,reason,outcome:'UNVERIFIED',
  entryAt:null,hits:[],observedHours:0,finished:false});
 if(!plan||plan.version!==DIRECTIONAL_LEVEL_VERSION||
  !['UP','DOWN'].includes(plan.side)||!stamp(now)||
  !stamp(plan.anchorCloseAt)||!stamp(plan.targetCloseAt)||
  !stamp(plan.publishedAt)||!Array.isArray(candles)||
  plan.targetCloseAt!==plan.anchorCloseAt+DIRECTIONAL_HOURS*H||
  plan.publishedAt<plan.anchorCloseAt||
  !(plan.publishedAt<plan.anchorCloseAt+H))
  return bad('INVALID','Неверные временные границы исследования');
 // Stored side-specific levels are already validated by planDirectionalScenario.
 // Reject impossible ordering independent of the symmetric reference envelope.
 const correct=plan.side==='UP'?
  plan.sl<plan.entry&&plan.entry<plan.tp1&&plan.tp1<plan.tp2&&plan.tp2<plan.tp3:
  plan.tp3<plan.tp2&&plan.tp2<plan.tp1&&plan.tp1<plan.entry&&plan.entry<plan.sl;
 if(!correct||![plan.entry,plan.tp1,plan.tp2,plan.tp3,plan.sl].every(price))
  return bad('INVALID','Не согласованы зафиксированные уровни');
 const lookup=new Map(),duplicates=new Set();
 for(const bar of candles){
  if(!stamp(bar?.closeAt))continue;
  if(lookup.has(bar.closeAt))duplicates.add(bar.closeAt);
  else lookup.set(bar.closeAt,bar);
 }
 const anchor=lookup.get(plan.anchorCloseAt);
 if(duplicates.has(plan.anchorCloseAt)||!validBar(anchor,plan.anchorCloseAt,now)||
  !near(anchor.close,plan.entry))
  return bad('NEEDS_DATA','Не проверена исходная свеча H1');
 let entryAt=null,terminal=null,terminalAt=null,hits=[],observedHours=0,
  ambiguousReason=null;
 for(let i=1;i<=DIRECTIONAL_HOURS;i++){
  const time=plan.anchorCloseAt+i*H;
  if(time>=now)break;
  const bar=lookup.get(time);
  if(duplicates.has(time)||!validBar(bar,time,now))
   return bad('NEEDS_DATA','Отсутствует или повреждена H1-свеча №'+i);
  observedHours++;
  // Never infer a price crossing from the part of the publication candle
  // occurring before the scenario was actually stored.
  if(bar.t<plan.publishedAt)continue;
  const entryTouch=bar.low<=plan.entry&&bar.high>=plan.entry;
  if(entryAt===null){
   if(!entryTouch)continue;
   entryAt=time;
   const levelHit=plan.side==='UP'?
    bar.high>=plan.tp1||bar.low<=plan.sl:
    bar.low<=plan.tp1||bar.high>=plan.sl;
   if(levelHit){
    terminal='AMBIGUOUS';terminalAt=time;
    ambiguousReason='Вход и TP/SL в одной H1-свече: неизвестно, что было первым';
    break;
   }
   continue;
  }
  const slTouched=plan.side==='UP'?bar.low<=plan.sl:bar.high>=plan.sl;
  const unseen=['tp1','tp2','tp3'].filter(k=>!hits.some(x=>x.key===k));
  const targetTouched=unseen.filter(k=>plan.side==='UP'?
   bar.high>=plan[k]:bar.low<=plan[k]);
  if(slTouched&&targetTouched.length){
   terminal='AMBIGUOUS';terminalAt=time;
   ambiguousReason='Защитный уровень и новая TP-цель в одной H1-свече';
   break;
  }
  if(slTouched){
   terminal='STOP';terminalAt=time;break;
  }
  for(const key of targetTouched)hits.push({key,at:time,hour:i});
  if(targetTouched.includes('tp3')){terminal='TP3';terminalAt=time;break;}
 }
 if(!terminal&&now>plan.targetCloseAt){
  if(observedHours<DIRECTIONAL_HOURS)
   return bad('NEEDS_DATA','Не хватает закрытых свечей до срока проверки');
  terminal=entryAt===null?'NOT_ENTERED':'HORIZON';
  terminalAt=plan.targetCloseAt;
 }
 return {state:terminal?'COMPLETED':entryAt!==null?'ACTIVE':'WAITING',
  reason:ambiguousReason,outcome:terminal||'OPEN',
  entryAt,terminalAt,hits,observedHours,finished:Boolean(terminal),
  tpCount:hits.length,remainingMs:terminal?null:Math.max(0,plan.targetCloseAt-now),
  note:'Проверка только по сохранённым закрытым H1. Касание уровня не означает исполненную сделку.'
 };
}
const M5=300000;
function validM5Bar(bar,closeAt,now){
 return bar?.closed===true&&bar.closeAt===closeAt&&
  bar.t===closeAt-M5+1&&closeAt<now&&
  [bar.open,bar.high,bar.low,bar.close].every(price)&&
  typeof bar.volume==='number'&&Number.isFinite(bar.volume)&&
  bar.volume>=0&&bar.low<=Math.min(bar.open,bar.close)&&
  bar.high>=Math.max(bar.open,bar.close,bar.low);
}
/**
 * Finer read-only chronology. Exactly 288 possible closed M5 bars across the
 * immutable 24-hour H1 hypothesis. No inferred intrabar order, even at M5.
 */
export function auditDirectionalM5(plan,candles,{now=Date.now()}={}){
 const bad=(state,reason)=>({state,reason,outcome:'UNVERIFIED',entryAt:null,
  hits:[],observedBars:0,observedHours:0,finished:false});
 if(!plan||plan.version!==DIRECTIONAL_LEVEL_VERSION||
  plan.evaluationInterval!=='5m'||!['UP','DOWN'].includes(plan.side)||
  !stamp(now)||!stamp(plan.anchorCloseAt)||!stamp(plan.publishedAt)||
  plan.targetCloseAt!==plan.anchorCloseAt+DIRECTIONAL_HOURS*H||
  plan.publishedAt<plan.anchorCloseAt||
  plan.publishedAt>=plan.anchorCloseAt+H||
  !Array.isArray(candles))
  return bad('INVALID','Не согласованы границы наблюдения M5');
 const good=plan.side==='UP'?
  plan.sl<plan.entry&&plan.entry<plan.tp1&&plan.tp1<plan.tp2&&plan.tp2<plan.tp3:
  plan.tp3<plan.tp2&&plan.tp2<plan.tp1&&plan.tp1<plan.entry&&plan.entry<plan.sl;
 if(!good||![plan.entry,plan.tp1,plan.tp2,plan.tp3,plan.sl].every(price))
  return bad('INVALID','Нарушена последовательность опубликованных точек');
 const bars=new Map(),duplicate=new Set();
 for(const b of candles){
  if(!stamp(b?.closeAt))continue;
  if(bars.has(b.closeAt))duplicate.add(b.closeAt);
  else bars.set(b.closeAt,b);
 }
 let entryAt=null,terminal=null,terminalAt=null,hits=[],observedBars=0,
  ambiguousReason=null;
 for(let i=1;i<=DIRECTIONAL_HOURS*12;i++){
  const time=plan.anchorCloseAt+i*M5;
  if(time>=now)break;
  const b=bars.get(time);
  if(duplicate.has(time)||!validM5Bar(b,time,now))
   return bad('NEEDS_DATA','Отсутствует или повреждена M5-свеча №'+i);
  observedBars++;
  const entryTouch=b.low<=plan.entry&&b.high>=plan.entry;
  const stopped=plan.side==='UP'?b.low<=plan.sl:b.high>=plan.sl;
  const tp1Touch=plan.side==='UP'?b.high>=plan.tp1:b.low<=plan.tp1;
  if(b.t<plan.publishedAt){
   // OHLC cannot distinguish moves before publication from moves after it.
   // Exclude this partial candle entirely rather than manufacturing a
   // terminal AMBIGUOUS outcome. Only fully post-publication M5 are eligible.
   continue;
  }
  if(entryAt===null){
   if(!entryTouch)continue;
   entryAt=time;
   if(stopped||tp1Touch){
    terminal='AMBIGUOUS';terminalAt=time;
    ambiguousReason='Вход и TP/SL в одной M5: порядок неизвестен';
    break;
   }
   continue;
  }
  const unseen=['tp1','tp2','tp3'].filter(k=>!hits.some(x=>x.key===k));
  const touched=unseen.filter(k=>plan.side==='UP'?
   b.high>=plan[k]:b.low<=plan[k]);
  if(stopped&&touched.length){
   terminal='AMBIGUOUS';terminalAt=time;
   ambiguousReason='Новый TP и SL в одной M5: порядок неизвестен';
   break;
  }
  if(stopped){terminal='STOP';terminalAt=time;break;}
  for(const key of touched)hits.push({key,at:time,bar:i});
  if(touched.includes('tp3')){terminal='TP3';terminalAt=time;break;}
 }
 if(!terminal&&now>plan.targetCloseAt){
  if(observedBars<DIRECTIONAL_HOURS*12)
   return bad('NEEDS_DATA','Не хватает завершённых M5 до срока сценария');
  terminal=entryAt===null?'NOT_ENTERED':'HORIZON';
  terminalAt=plan.targetCloseAt;
 }
 return {state:terminal?'COMPLETED':entryAt?'ACTIVE':'WAITING',
  reason:ambiguousReason,outcome:terminal||'OPEN',
  entryAt,terminalAt,hits,observedBars,observedHours:observedBars/12,
  finished:Boolean(terminal),tpCount:hits.length,
  remainingMs:terminal?null:Math.max(0,plan.targetCloseAt-now),
  note:'Проверено по полностью закрытым M5 после публикации. Частичная первая M5 не учитывается. Если внутри одной последующей M5 касались конкурирующие уровни, порядок не установлен. Касание не означает исполненную сделку.'};
}
const M1=60000;
function validM1Bar(bar,closeAt,now){
 return bar?.closed===true&&bar.closeAt===closeAt&&
  bar.t===closeAt-M1+1&&closeAt<now&&
  [bar.open,bar.high,bar.low,bar.close].every(price)&&
  typeof bar.volume==='number'&&Number.isFinite(bar.volume)&&
  bar.volume>=0&&bar.low<=Math.min(bar.open,bar.close)&&
  bar.high>=Math.max(bar.open,bar.close,bar.low);
}
/**
 * Finer read-only chronology. Exactly 1,440 possible closed M1 bars across the
 * immutable 24-hour H1 hypothesis. No inferred intrabar order, even at M1.
 */
export function auditDirectionalM1(plan,candles,{now=Date.now()}={}){
 const bad=(state,reason)=>({state,reason,outcome:'UNVERIFIED',entryAt:null,
  hits:[],observedBars:0,observedHours:0,finished:false});
 if(!plan||plan.version!==DIRECTIONAL_LEVEL_VERSION||
  plan.evaluationInterval!=='1m'||!['UP','DOWN'].includes(plan.side)||
  !stamp(now)||!stamp(plan.anchorCloseAt)||!stamp(plan.publishedAt)||
  plan.targetCloseAt!==plan.anchorCloseAt+DIRECTIONAL_HOURS*H||
  plan.publishedAt<plan.anchorCloseAt||
  plan.publishedAt>=plan.anchorCloseAt+H||
  !Array.isArray(candles))
  return bad('INVALID','Не согласованы границы наблюдения M1');
 const good=plan.side==='UP'?
  plan.sl<plan.entry&&plan.entry<plan.tp1&&plan.tp1<plan.tp2&&plan.tp2<plan.tp3:
  plan.tp3<plan.tp2&&plan.tp2<plan.tp1&&plan.tp1<plan.entry&&plan.entry<plan.sl;
 if(!good||![plan.entry,plan.tp1,plan.tp2,plan.tp3,plan.sl].every(price))
  return bad('INVALID','Нарушена последовательность опубликованных точек');
 const bars=new Map(),duplicate=new Set();
 for(const b of candles){
  if(!stamp(b?.closeAt))continue;
  if(bars.has(b.closeAt))duplicate.add(b.closeAt);
  else bars.set(b.closeAt,b);
 }
 let entryAt=null,terminal=null,terminalAt=null,hits=[],observedBars=0,
  ambiguousReason=null;
 for(let i=1;i<=DIRECTIONAL_HOURS*60;i++){
  const time=plan.anchorCloseAt+i*M1;
  if(time>=now)break;
  const b=bars.get(time);
  if(duplicate.has(time)||!validM1Bar(b,time,now))
   return bad('NEEDS_DATA','Отсутствует или повреждена M1-свеча №'+i);
  observedBars++;
  const entryTouch=b.low<=plan.entry&&b.high>=plan.entry;
  const stopped=plan.side==='UP'?b.low<=plan.sl:b.high>=plan.sl;
  const tp1Touch=plan.side==='UP'?b.high>=plan.tp1:b.low<=plan.tp1;
  if(b.t<plan.publishedAt){
   // OHLC cannot distinguish moves before publication from moves after it.
   // Exclude this partial candle entirely rather than manufacturing a
   // terminal AMBIGUOUS outcome. Only fully post-publication M1 are eligible.
   continue;
  }
  if(entryAt===null){
   if(!entryTouch)continue;
   entryAt=time;
   if(stopped||tp1Touch){
    terminal='AMBIGUOUS';terminalAt=time;
    ambiguousReason='Вход и TP/SL в одной M1: порядок неизвестен';
    break;
   }
   continue;
  }
  const unseen=['tp1','tp2','tp3'].filter(k=>!hits.some(x=>x.key===k));
  const touched=unseen.filter(k=>plan.side==='UP'?
   b.high>=plan[k]:b.low<=plan[k]);
  if(stopped&&touched.length){
   terminal='AMBIGUOUS';terminalAt=time;
   ambiguousReason='Новый TP и SL в одной M1: порядок неизвестен';
   break;
  }
  if(stopped){terminal='STOP';terminalAt=time;break;}
  for(const key of touched)hits.push({key,at:time,bar:i});
  if(touched.includes('tp3')){terminal='TP3';terminalAt=time;break;}
 }
 if(!terminal&&now>plan.targetCloseAt){
  if(observedBars<DIRECTIONAL_HOURS*60)
   return bad('NEEDS_DATA','Не хватает завершённых M1 до срока сценария');
  terminal=entryAt===null?'NOT_ENTERED':'HORIZON';
  terminalAt=plan.targetCloseAt;
 }
 return {state:terminal?'COMPLETED':entryAt?'ACTIVE':'WAITING',
  reason:ambiguousReason,outcome:terminal||'OPEN',
  entryAt,terminalAt,hits,observedBars,observedHours:observedBars/60,
  finished:Boolean(terminal),tpCount:hits.length,
  remainingMs:terminal?null:Math.max(0,plan.targetCloseAt-now),
  note:'Проверено по полностью закрытым M1 после публикации. Частичная первая M1 не учитывается. Если внутри одной последующей M1 касались конкурирующие уровни, порядок не установлен. Касание не означает исполненную сделку.'};
}
export function directionalOutcomeLabel(outcome){
 return ({
  OPEN:'Наблюдение продолжается',
  TP3:'Достигнут TP3 · наблюдение завершено',
  STOP:'Достигнут защитный уровень · завершено',
  AMBIGUOUS:'Порядок касаний не установлен',
  NOT_ENTERED:'Опорная цена не достигнута до срока',
  HORIZON:'Срок наблюдения истёк'
 })[outcome]||'Нет подтверждённого исхода';
}
