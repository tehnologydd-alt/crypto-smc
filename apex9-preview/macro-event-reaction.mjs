/**
 * Observational M5 BTC/ETH windows around official BLS SCHEDULED timestamps.
 * Never assumes a release actually happened; never asserts causation or fills.
 * Only a fully closed 4h continuous OHLCV path yields reported percentages.
 */
export const REACTION_SOURCE='Binance Spot public M5';
const URL='https://data-api.binance.vision/api/v3/klines';
const FIVE=300000,FOUR=48*FIVE;
const horizons=[3,12,48];
const cleanPrice=x=>Number.isFinite(x)&&x>0;
const verifiedEvent=(e,now)=>e?.source==='BLS_OFFICIAL_CALENDAR'&&
 e.status==='SCHEDULED_NOT_RELEASED'&&Number.isSafeInteger(e.at)&&
 e.at>0&&e.at%FIVE===0&&e.at+FOUR<now&&
 now-e.at<=48*3600000;
export function auditScheduledEventWindow(event,rows,{now=Date.now(),symbol='BTCUSDT'}={}){
 if(!['BTCUSDT','ETHUSDT'].includes(symbol)||!verifiedEvent(event,now))
  return {state:'INELIGIBLE',reason:'Only fully observed, recent BLS schedule windows'};
 if(!Array.isArray(rows)||rows.length<49||rows.length>200)
  return {state:'INCOMPLETE',reason:'Missing complete 5-minute history'};
 const candleMap=new Map();
 for(const row of rows){
  if(!Array.isArray(row)||row.length<7)return {state:'INVALID'};
  const t=Number(row[0]),end=Number(row[6]);
  const o=Number(row[1]),h=Number(row[2]),l=Number(row[3]),c=Number(row[4]);
  if(!Number.isSafeInteger(t)||t%FIVE!==0||end!==t+FIVE-1||
   t>=now||end>=now||![o,h,l,c].every(cleanPrice)||
   h<Math.max(o,l,c)||l>Math.min(o,h,c)||candleMap.has(t))
   return {state:'INVALID',reason:'Invalid or duplicate M5 bar'};
  candleMap.set(t,{open:o,high:h,low:l,close:c,end});
 }
 const start=event.at-FIVE, bars=[];
 for(let i=0;i<49;i++){
  const row=candleMap.get(start+i*FIVE);
  if(!row)return {state:'INCOMPLETE',
   reason:'M5 gap: '+new Date(start+i*FIVE).toISOString()};
  bars.push(row);
 }
 const base=bars[0].close;
 const observations=horizons.map(n=>{
  const end=bars[n],returnPercent=100*(end.close/base-1);
  const segment=bars.slice(1,n+1);
  return {minutes:n*5,returnPercent:Number(returnPercent.toFixed(4)),
   highestPercent:Number((100*(Math.max(...segment.map(b=>b.high))/base-1)).toFixed(4)),
   lowestPercent:Number((100*(Math.min(...segment.map(b=>b.low))/base-1)).toFixed(4)),
   closedAt:end.end};
 });
 return {state:'OBSERVED',symbol,source:REACTION_SOURCE,
  eventName:event.title,eventAt:event.at,eventSource:event.source,
  baselineClose:base,observations,
  note:'Price movement after a scheduled event time, NOT proof of an announcement or its impact'};
}
export async function fetchScheduledEventReaction(event,{
 symbol='BTCUSDT',fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const at=now();
 if(!verifiedEvent(event,at)||!['BTCUSDT','ETHUSDT'].includes(symbol))
  return {state:'INELIGIBLE',reason:'Event outside a verified closed 4h M5 window'};
 const params=new URLSearchParams({symbol,interval:'5m',
  startTime:String(event.at-FIVE),endTime:String(event.at+FOUR-1),limit:'60'});
 try{
  const res=await fetchImpl(URL+'?'+params.toString(),
   {method:'GET',credentials:'omit',cache:'no-store',signal});
  if(res?.status===418||res?.status===429)
   return {state:'RATE_LIMITED',reason:'Binance rate limit'};
  if(!res?.ok)return {state:'OFFLINE',reason:'HTTP '+(res?.status||'?')};
  const parsed=await res.json();
  return auditScheduledEventWindow(event,parsed,{now:at,symbol});
 }catch(error){return {state:'OFFLINE',reason:String(error?.message||error).slice(0,145)};}
}
