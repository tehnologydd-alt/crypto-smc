/**
 * APEX Scenario Replay — historical 0..4 closed-H1 observations ONLY.
 * Freezes original Room experiment; never fabricates missing prices/stages.
 */
const H=3600000;
const safeTime=x=>Number.isSafeInteger(x)&&x>0;
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const within=(close,low,high)=>close>=low&&close<=high;
export const REPLAY_LABELS=Object.freeze([
 'Опорная H1','Закрытие H1 №1','Закрытие H1 №2',
 'Закрытие H1 №3','Итоговое H1 №4'
]);
function validBar(bar,at,now){
 if(!bar||bar.closed!==true||bar.closeAt!==at||at>=now||
  !safeTime(bar.t)||bar.t!==at-H+1||
  !price(bar.open)||!price(bar.high)||!price(bar.low)||!price(bar.close)||
  !Number.isFinite(bar.volume)||bar.volume<0||
  bar.low>Math.min(bar.open,bar.close)||
  bar.high<Math.max(bar.open,bar.close)||bar.low>bar.high)return false;
 return true;
}
export function buildScenarioReplay(scenario,candles,{now=Date.now()}={}){
 const empty=(state,reason)=>({
  state,reason,asset:scenario?.asset??null,id:scenario?.id??null,
  points:[],observed:0,available:0,verifiedFinal:false,
  publishedRange:null
 });
 if(!scenario||typeof scenario.id!=='string'||
  typeof scenario.asset!=='string'||!Array.isArray(candles)||
  !safeTime(now)||!safeTime(scenario.anchorCloseAt)||
  scenario.anchorCloseAt%H!==H-1||
  scenario.targetCloseAt!==scenario.anchorCloseAt+4*H||
  !price(scenario.anchorClose)||!price(scenario.bandLow)||
  !price(scenario.bandHigh)||scenario.bandLow>=scenario.anchorClose||
  scenario.anchorClose>=scenario.bandHigh)
  return empty('INVALID','Не согласованы исходные условия исследования');
 const closeTimes=new Map(),duplicates=new Set();
 for(const bar of candles){
  if(!safeTime(bar?.closeAt))continue;
  if(closeTimes.has(bar.closeAt))duplicates.add(bar.closeAt);
  else closeTimes.set(bar.closeAt,bar);
 }
 const observedStages=new Map((scenario.milestones||[])
  .filter(m=>m?.key&&safeTime(m.observedAt))
  .map(m=>[m.key,m.observedAt]));
 const points=[];
 let observed=0,invalid=0,duplicatesInWindow=0;
 for(let i=0;i<=4;i++){
  const closeAt=scenario.anchorCloseAt+i*H;
  const bar=closeTimes.get(closeAt);
  const duplicate=duplicates.has(closeAt);
  const finished=closeAt<now;
  const valid=finished&&!duplicate&&validBar(bar,closeAt,now);
  let state=valid?'OBSERVED':duplicate?'AMBIGUOUS':
   bar&&finished?'INVALID_SOURCE':finished?'MISSING':'NOT_CLOSED';
  if(duplicate)duplicatesInWindow++;
  if(state==='INVALID_SOURCE')invalid++;
  if(valid)observed++;
  const close=valid?bar.close:null;
  const isIn=valid?within(close,scenario.bandLow,scenario.bandHigh):null;
  const stageKey=i===0?'PUBLISHED':i===1?'CONFIRMED':i===2?'ACTIVE':
   i===4?'EVALUATED':null;
  const expectedSourceStage=stageKey&&observedStages.has(stageKey);
  // The publication has its own later timestamp but is anchored to its
  // original closed candle. Other H1 stage stamps are source bar closes.
  const stageObserved=valid&&expectedSourceStage&&
   (i===0||observedStages.get(stageKey)===closeAt);
  points.push({
   index:i,closeAt,state,label:REPLAY_LABELS[i],close,
   inside:isIn,deltaPct:valid?(close/scenario.anchorClose-1)*100:null,
   stageKey,stageObserved:Boolean(stageObserved),
   volume:valid?bar.volume:null
  });
 }
 const anchor=points[0];
 if(anchor.state==='OBSERVED'&&
  Math.abs(anchor.close-scenario.anchorClose)/
   Math.max(anchor.close,scenario.anchorClose)>1e-6)
  return {...empty('ANCHOR_MISMATCH',
   'Опорное закрытие в истории отличается от исходного исследования'),
   points,observed,available:5,
   publishedRange:{low:scenario.bandLow,high:scenario.bandHigh}};
 const final=points[4],r=scenario.result;
 let verifiedFinal=false,finalConflict=false;
 if(r&&final.state==='OBSERVED'){
  const matchesPrice=price(r.actualClose)&&
   Math.abs(r.actualClose-final.close)/
   Math.max(r.actualClose,final.close)<=1e-6;
  const matchesResult=(r.outcome==='WITHIN_RANGE')===final.inside;
  verifiedFinal=matchesPrice&&matchesResult&&final.stageObserved;
  finalConflict=!matchesPrice||!matchesResult;
 }
 const state=invalid||duplicatesInWindow?'SOURCE_CONFLICT':
  finalConflict?'RESULT_CONFLICT':
  observed===0?'EMPTY':observed===5?'COMPLETE':'PARTIAL';
 return {state,asset:scenario.asset,id:scenario.id,
  points,observed,available:5,verifiedFinal,
  publishedRange:{low:scenario.bandLow,high:scenario.bandHigh},
  note:finalConflict?
   'Итог исследования расходится с сохранённой закрытой H1-свечой':
   'Только фактические закрытия из локальной базы Room'};
}
