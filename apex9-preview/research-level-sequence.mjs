/**
 * APEX H1 Level Sequence Audit — a research benchmark, NOT an order.
 * Existing immutable forecasts have NO direction/TP/SL. We show two
 * symmetrical retrospective conditional paths without inventing a signal.
 *
 * Future native forecasts may publish the same levelStudy payload immutably.
 * The first H1 candle usually starts BEFORE the forecast was published:
 * any hit in that candle cannot be time-ordered from H1 OHLC alone.
 */
import {inspectResearchTimeline} from './research-timeline.mjs';
export const LEVEL_STUDY_VERSION='H1_DUAL_LEVEL_STUDY_V1';
export const LEVEL_HOURS=4;
const H=3600000;
const PRICE=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const TIME=n=>Number.isSafeInteger(n)&&n>0;
const round=n=>Number(n.toPrecision(13));
const nearly=(a,b)=>PRICE(a)&&PRICE(b)&&
 Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*2e-11);
const empty=(state,reason)=>({state,reason,plan:null});
export function computeReferenceLevels(anchor,low,high){
 if(![anchor,low,high].every(PRICE)||!(low<anchor&&anchor<high))
  return null;
 const up=high-anchor,down=anchor-low;
 const result={entry:round(anchor),UP:{
  tp1:round(anchor+up/3),tp2:round(anchor+2*up/3),
  tp3:round(high),sl:round(anchor-down/3)
 },DOWN:{
  tp1:round(anchor-down/3),tp2:round(anchor-2*down/3),
  tp3:round(low),sl:round(anchor+up/3)
 }};
 return [result.UP.tp1,result.UP.tp2,result.UP.tp3,result.UP.sl,
  result.DOWN.tp1,result.DOWN.tp2,result.DOWN.tp3,result.DOWN.sl]
  .every(PRICE)?result:null;
}
const sameCommit=(stored,expected)=>{
 if(stored?.version!==LEVEL_STUDY_VERSION||
  !nearly(stored.entry,expected.entry))return false;
 for(const side of ['UP','DOWN'])
  for(const key of ['tp1','tp2','tp3','sl'])
   if(!nearly(stored[side]?.[key],expected[side][key]))return false;
 return true;
};
/** Validates the exact immutable original Room hypothesis before displaying. */
export function planResearchLevels(row,{now=Date.now()}={}){
 const trace=inspectResearchTimeline(row,{now});
 if(trace.state==='INVALID')return empty('INVALID',trace.reason||
  'Исходная запись не прошла проверку');
 let h;
 try{h=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
 catch{return empty('INVALID','Не удалось прочитать исходную гипотезу');}
 const expected=computeReferenceLevels(h.anchorClose,h.bandLow,h.bandHigh);
 if(!expected)return empty('INVALID','Нет согласованного исходного диапазона');
 if(h.levelStudy!==undefined&&h.levelStudy!==null&&
  !sameCommit(h.levelStudy,expected))
  return empty('INVALID','Опубликованные контрольные уровни изменены или повреждены');
 const origin=h.levelStudy?'PUBLISHED':'RETROSPECTIVE';
 return {state:'READY',reason:null,plan:{
  version:LEVEL_STUDY_VERSION,
  origin,id:row.id,asset:row.asset,
  anchorCloseAt:h.anchorCloseAt,targetCloseAt:h.targetCloseAt,
  publishedAt:row.publishedAt,
  ...expected,
  note:origin==='PUBLISHED'?
   'Исходные исследовательские уровни сохранены при публикации; '+
    'это не биржевые ордера, TP/SL и не подтверждённое исполнение.':
   'Уровни рассчитаны одинаковым правилом задним числом для старого '+
    'прогноза диапазона. Они не были опубликованными TP/SL и не могут '+
    'включаться в статистику точности исходных прогнозов.'
 }};
}
function validateBar(b,at,now){
 return b?.closed===true&&b.closeAt===at&&
  b.t===at-H+1&&at<now&&
  [b.open,b.high,b.low,b.close].every(PRICE)&&
  Number.isFinite(b.volume)&&b.volume>=0&&
  b.low<=Math.min(b.open,b.close)&&
  b.high>=Math.max(b.open,b.close)&&b.high>=b.low;
}
function inspectBranch(plan,branch,bars){
 const levels=plan[branch];
 const found=new Map();
 const observations=[];
 let first=null,initialUncertain=false;
 for(const [i,bar] of bars){
  const hits=[];
  for(const key of ['tp1','tp2','tp3','sl']){
   if(found.has(key))continue;
   const hit=branch==='UP'?
    (key==='sl'?bar.low<=levels.sl:bar.high>=levels[key]):
    (key==='sl'?bar.high>=levels.sl:bar.low<=levels[key]);
   if(hit){found.set(key,{bar:i,at:bar.closeAt});hits.push(key);}
  }
  if(!hits.length)continue;
  const observation={bar:i,at:bar.closeAt,levels:hits,
   sameH1:hits.length>1,
   spansPublication:i===1&&bar.t<plan.publishedAt};
  observations.push(observation);
  if(!first){
   first=observation;
   if(observation.spansPublication)initialUncertain=true;
  }
 }
 let state='NO_HITS';
 if(first){
  if(initialUncertain)state='PUBLICATION_HOUR_UNKNOWN';
  else if(first.levels.includes('sl')&&first.levels.includes('tp1'))
   state='SAME_H1_UNKNOWN';
  else if(first.levels.includes('sl'))state='SL_FIRST';
  else state='TP1_FIRST';
 }
 const firstTouch=first?{
  bar:first.bar,at:first.at,levels:first.levels,
  beforePublicationPossible:first.spansPublication
 }:null;
 return {direction:branch,state,
  found:Object.fromEntries([...found]),firstTouch,
  observations,note:state==='PUBLICATION_HOUR_UNKNOWN'?
   'Первый уровень мог быть достигнут до публикации внутри той же H1-свечи. Порядок неизвестен.':
   state==='SAME_H1_UNKNOWN'?
   'TP1 и защитный уровень достигнуты внутри одной H1-свечи. Без тиков порядок неизвестен.':
   state==='TP1_FIRST'?'Первым подтверждённым касанием в завершённых H1 стал TP1.':
   state==='SL_FIRST'?'Первым подтверждённым касанием в завершённых H1 стал защитный уровень.':
   'Ни один контрольный уровень пока не достигнут.'
 };
}
export function analyzeResearchLevelSequence(plan,candles,{now=Date.now()}={}){
 const unavailable=(state,reason)=>({state,reason,branches:[],
  observedHours:0,complete:false});
 if(!plan||plan.version!==LEVEL_STUDY_VERSION||
  !TIME(now)||!TIME(plan.anchorCloseAt)||!TIME(plan.targetCloseAt)||
  !TIME(plan.publishedAt)||plan.targetCloseAt!==plan.anchorCloseAt+4*H||
  !(plan.publishedAt>plan.anchorCloseAt&&plan.publishedAt<plan.targetCloseAt)||
  !Array.isArray(candles))
  return unavailable('INVALID','Несогласованный источник исследования');
 const expected=computeReferenceLevels(plan.entry,plan.DOWN.tp3,plan.UP.tp3);
 if(!expected||!sameCommit({version:plan.version,...plan},expected))
  return unavailable('INVALID','Уровни не совпадают с исходным диапазоном');
 const byTime=new Map(),dups=new Set();
 for(const bar of candles){
  if(!TIME(bar?.closeAt))continue;
  if(byTime.has(bar.closeAt))dups.add(bar.closeAt);
  else byTime.set(bar.closeAt,bar);
 }
 const anchor=byTime.get(plan.anchorCloseAt);
 if(dups.has(plan.anchorCloseAt)||!validateBar(anchor,plan.anchorCloseAt,now)||
  !nearly(anchor.close,plan.entry))
  return unavailable('NEEDS_DATA','Не удалось независимо проверить опорную H1-свечу');
 const observed=[];
 for(let i=1;i<=LEVEL_HOURS;i++){
  const at=plan.anchorCloseAt+i*H;
  if(at>=now)break;
  const bar=byTime.get(at);
  if(dups.has(at)||!validateBar(bar,at,now))
   return unavailable('NEEDS_DATA',
    'Неполная или противоречивая H1-история после публикации: час '+i);
  observed.push([i,bar]);
 }
 const branches=['UP','DOWN'].map(direction=>
  inspectBranch(plan,direction,observed));
 const complete=observed.length===LEVEL_HOURS;
 return {state:complete?'COMPLETE':'PARTIAL',reason:null,branches,
  observedHours:observed.length,complete,
  note:'Наблюдения по закрытым H1 OHLC, не по тикам. '+
   'Точка входа — только историческая опорная цена, не факт исполнения. '+
   'Внутри одной H1-свечи последовательность касаний неизвестна; '+
   'первая H1-свеча может включать движение до публикации. '+
   (plan.origin==='PUBLISHED'?
    'Уровни зафиксированы вместе с будущей гипотезой.':
    'Для старой гипотезы уровни восстановлены задним числом.')
 };
}
