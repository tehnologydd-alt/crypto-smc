/**
 * APEX 9.1: descriptive historical comparison for BTC/ETH Spot.
 * One bounded public Binance M5 request, three fully closed 4h windows:
 * official BLS scheduled timestamp and the same UTC clock 24h/48h earlier.
 * TWO controls cannot establish a statistical baseline or event causality.
 */
import {auditClosedM5Prices,auditScheduledEventWindow,
 REACTION_SOURCE} from './macro-event-reaction.mjs';
const FIVE=300000,DAY=86400000,FOUR=48*FIVE;
const START_OFFSET=2*DAY+FIVE,EXPECTED=625;
const URL='https://data-api.binance.vision/api/v3/klines';
export const COMPARE_VERSION='M5_BLS_SCHEDULE_PRIOR_DAYS_V1';
const SYMBOLS=new Set(['BTCUSDT','ETHUSDT']);
const EVENT_WINDOW=48*3600000;
function eligible(event,now,symbol){
 return SYMBOLS.has(symbol)&&
 event?.source==='BLS_OFFICIAL_CALENDAR'&&
 event?.status==='SCHEDULED_NOT_RELEASED'&&
 Number.isSafeInteger(event.at)&&event.at>0&&event.at%FIVE===0&&
 event.at+FOUR<now&&now-event.at<=EVENT_WINDOW;
}
const round=n=>Number(n.toFixed(4));
function validRow(row,now){
 if(!Array.isArray(row)||row.length<7)return false;
 const t=Number(row[0]),end=Number(row[6]);
 const [o,h,l,c,v]=row.slice(1,6).map(Number);
 return Number.isSafeInteger(t)&&t>0&&t%FIVE===0&&
 end===t+FIVE-1&&end<now&&
 [o,h,l,c].every(x=>Number.isFinite(x)&&x>0)&&
 Number.isFinite(v)&&v>=0&&
 h>=Math.max(o,c,l)&&l<=Math.min(o,c,h);
}
export function compareBlsScheduledM5(event,rows,{now=Date.now(),symbol='BTCUSDT'}={}){
 if(!eligible(event,now,symbol))return {state:'INELIGIBLE',
  reason:'Requires a completed recent official BLS calendar timestamp'};
 if(!Array.isArray(rows)||rows.length!==EXPECTED)
  return {state:'INCOMPLETE',reason:'Missing continuous 52h5m M5 range'};
 const start=event.at-START_OFFSET,byTime=new Map();
 for(const row of rows){
  if(!validRow(row,now))return {state:'INVALID',reason:'Malformed or unfinished M5'};
  const t=Number(row[0]);
  if(t<start||t>=event.at+FOUR||byTime.has(t))
   return {state:'INVALID',reason:'Duplicate or out-of-range M5 candle'};
  byTime.set(t,row);
 }
 if(byTime.size!==EXPECTED)return {state:'INCOMPLETE',reason:'Incomplete sample'};
 // Strictly require every M5 bar from the oldest control to the event close.
 // A single missing bar invalidates the study; no gaps are interpolated.
 for(let i=0;i<EXPECTED;i++){
  if(!byTime.has(start+i*FIVE))
   return {state:'INCOMPLETE',reason:'M5 gap in full comparison range'};
 }
 function slice(anchor){
  const out=[];
  for(let i=-1;i<48;i++)out.push(byTime.get(anchor+i*FIVE));
  return out;
 }
 const eventProof=auditScheduledEventWindow(event,slice(event.at),{now,symbol});
 if(eventProof.state!=='OBSERVED')return eventProof;
 const controlTimes=[event.at-DAY,event.at-2*DAY];
 const controls=controlTimes.map(at=>auditClosedM5Prices(at,slice(at),{now}));
 if(controls.some(x=>x.state!=='OBSERVED'))
  return {state:'INCOMPLETE',reason:'Unverifiable control M5 window'};
 const matched=eventProof.observations.map((e,i)=>{
  const samples=controls.map(x=>x.observations[i].returnPercent);
  const meanAbs=(Math.abs(samples[0])+Math.abs(samples[1]))/2;
  return {minutes:e.minutes,eventReturnPercent:e.returnPercent,
   eventAbsolutePercent:round(Math.abs(e.returnPercent)),
   previousDayReturnPercent:samples[0],
   twoDaysBeforeReturnPercent:samples[1],
   priorMeanAbsolutePercent:round(meanAbs),
   differenceAbsolutePp:round(Math.abs(e.returnPercent)-meanAbs),
   eventRangeLowPercent:e.lowestPercent,eventRangeHighPercent:e.highestPercent,
   priorSamples:2};
 });
 return {state:'OBSERVED',version:COMPARE_VERSION,symbol,
  eventAt:event.at,eventName:event.title,eventSource:event.source,
  source:REACTION_SOURCE,controlsAt:controlTimes,
  completeM5Candles:EXPECTED,
  comparison:matched,
  causalImpact:'NOT_ESTABLISHED',
  releaseVerified:false,
  statisticalSignificance:'NOT_EVALUATED',
  note:'Two same-UTC-clock control windows from earlier days; may include other events. Not causality or a predictive model.'};
}
export async function fetchBlsM5Comparison(event,{
 symbol='BTCUSDT',fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const at=now();
 if(!eligible(event,at,symbol))return {state:'INELIGIBLE',
  reason:'Scheduled release window is incomplete or older than 48h'};
 const params=new URLSearchParams({
  symbol,interval:'5m',timeZone:'0',
  startTime:String(event.at-START_OFFSET),
  endTime:String(event.at+FOUR-1),limit:'650'
 });
 try{
  const response=await fetchImpl(URL+'?'+params.toString(),{
   method:'GET',credentials:'omit',cache:'no-store',signal
  });
  if(response?.status===429||response?.status===418)
   return {state:'RATE_LIMITED',reason:'Binance has limited historical requests'};
  if(!response?.ok)return {state:'OFFLINE',
   reason:'Binance HTTP '+String(response?.status||'?')};
  const parsed=await response.json();
  return compareBlsScheduledM5(event,parsed,{now:at,symbol});
 }catch(error){
  return {state:'OFFLINE',reason:String(error?.message||error).slice(0,140)};
 }
}
