/**
 * Bounded H1 archive repair plan and strict native response validation.
 * No made-up OHLCV bars, orders, forecasts, or automatic background polling.
 */
export const HISTORICAL_REPAIR_DAYS=Object.freeze([30,90,180]);
export const HISTORICAL_REPAIR_STEP=3600000;
export const HISTORICAL_REPAIR_CHUNK_HOURS=240;
const assetRegex=/^[A-Z0-9]{5,20}$/;
export function planHistoricalH1Repair(asset,days,{now=Date.now()}={}){
 if(typeof asset!=='string'||!assetRegex.test(asset)||
  !HISTORICAL_REPAIR_DAYS.includes(days)||
  !Number.isSafeInteger(now)||now<=0)
  return {state:'INVALID',windows:[],reason:'Неверный актив или период'};
 const hourStart=Math.floor(now/HISTORICAL_REPAIR_STEP)*HISTORICAL_REPAIR_STEP;
 const start=hourStart-days*24*HISTORICAL_REPAIR_STEP;
 if(start<=0)return {state:'INVALID',windows:[],reason:'Неверное время'};
 const windows=[];
 for(let t=start;t<hourStart;t+=HISTORICAL_REPAIR_CHUNK_HOURS*HISTORICAL_REPAIR_STEP){
  const endExclusive=Math.min(hourStart,t+HISTORICAL_REPAIR_CHUNK_HOURS*HISTORICAL_REPAIR_STEP);
  windows.push({asset,startTime:t,endExclusive,
   bars:(endExclusive-t)/HISTORICAL_REPAIR_STEP});
 }
 return {state:'READY',asset,days,startTime:start,endExclusive:hourStart,
  expectedBars:days*24,windows};
}
export function checkHistoricalH1Chunk(window,result){
 if(!result||!['VERIFIED','ALREADY_STORED'].includes(result.state)||
  result.asset!==window.asset||
  result.startTime!==window.startTime||
  result.endExclusive!==window.endExclusive||
  result.bars!==window.bars||
  !Number.isSafeInteger(result.added)||result.added<0||
  !Number.isSafeInteger(result.existing)||result.existing<0||
  result.added+result.existing!==window.bars||
  (result.state==='VERIFIED'&&result.source!=='BINANCE_SPOT_H1')||
  (result.state==='ALREADY_STORED'&&
   (result.source!=='LOCAL_ROOM_CACHE'||result.added!==0)))
  return {state:'INVALID',reason:'Источник вернул противоречивый H1-отчёт'};
 return {state:'OK',added:result.added,existing:result.existing,
  networkVerified:result.state==='VERIFIED'};
}
