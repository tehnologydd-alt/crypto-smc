/**
 * Research-only M5 same-UTC-clock comparison: one public Binance Spot request
 * contains a publication window and two reference windows 24/48 hours earlier.
 * Controls are NOT news events, nor a trained expected-move distribution.
 * Required: full 4-hour horizon, continuous fully closed raw OHLCV, no gaps.
 */
import {newsM5Eligibility} from './news-m5-reaction.mjs';

const FIVE=300000, DAY=86400000;
const MINUTES=[15,60,240];
const API='https://data-api.binance.vision/api/v3/klines';
export const NEWS_M5_BASELINE_VERSION='M5_NEWS_TWO_PRIOR_DAYS_V1';
const round=n=>Number(n.toFixed(4));
const horizonOpen=(t,minutes)=>Math.ceil((t+minutes*60000-FIVE)/FIVE)*FIVE;
const pct=(close,base)=>round((close/base-1)*100);
const positive=n=>Number.isFinite(n)&&n>0;
function validateBar(row,now){
 if(!Array.isArray(row)||row.length<7)return null;
 const t=Number(row[0]),end=Number(row[6]);
 const [open,high,low,close,volume]=row.slice(1,6).map(Number);
 if(!Number.isSafeInteger(t)||t<=0||t%FIVE!==0||
  end!==t+FIVE-1||end>=now||
  ![open,high,low,close].every(positive)||
  !Number.isFinite(volume)||volume<0||
  high<Math.max(open,close,low)||low>Math.min(open,high,close))
  return null;
 return {t,end,open,high,low,close,volume};
}
export function newsM5BaselineEligibility(event,{symbol='BTCUSDT',now=Date.now()}={}){
 const eligibility=newsM5Eligibility(event,{symbol,now});
 if(eligibility.state!=='READY')return eligibility;
 const target=horizonOpen(event.observedAt,240);
 if(eligibility.last<target)return {state:'NOT_READY',
  reason:'Для сравнения необходимо дождаться закрытия четырёхчасового горизонта M5'};
 const start=eligibility.start-2*DAY,last=target;
 const expectedCount=(last-start)/FIVE+1;
 if(expectedCount>1000||start<=0||!Number.isSafeInteger(expectedCount))
  return {state:'INELIGIBLE',reason:'Не удалось построить ограниченное окно M5'};
 return {state:'READY',start,last,expectedCount,
  controlAt:[event.observedAt-DAY,event.observedAt-2*DAY]};
}
export function compareNewsM5Baseline(event,raw,{
 symbol='BTCUSDT',now=Date.now()
}={}){
 const spec=newsM5BaselineEligibility(event,{symbol,now});
 if(spec.state!=='READY')return spec;
 if(!Array.isArray(raw)||raw.length!==spec.expectedCount)
  return {state:'INCOMPLETE',reason:'Не получена полная непрерывная история M5 за три периода'};
 const bars=new Map();
 for(const row of raw){
  const b=validateBar(row,now);
  if(!b||b.t<spec.start||b.t>spec.last||bars.has(b.t))
   return {state:'INVALID',reason:'Повторённые, некорректные или незакрытые свечи M5'};
  bars.set(b.t,b);
 }
 for(let t=spec.start;t<=spec.last;t+=FIVE)
  if(!bars.has(t))return {state:'INCOMPLETE',reason:'Пропуск в исходной истории M5'};
 function window(anchor){
  const base=Math.floor(anchor/FIVE)*FIVE;
  const previous=bars.get(base-FIVE);
  const beforeHour=bars.get(base-13*FIVE);
  if(!previous||!beforeHour)return null;
  const observed=[];
  for(const minutes of MINUTES){
   const x=bars.get(horizonOpen(anchor,minutes));
   if(!x)return null;
   observed.push({minutes,returnPercent:pct(x.close,previous.close),
    sampledAfterMinutes:round((x.end+1-anchor)/60000)});
  }
  return {anchorAt:anchor,baselineClose:previous.close,
   priorHourReturnPercent:pct(previous.close,beforeHour.close),
   observations:observed};
 }
 const eventWindow=window(event.observedAt);
 const controls=spec.controlAt.map(window);
 if(!eventWindow||controls.some(x=>!x))
  return {state:'INCOMPLETE',reason:'Неполное M5 окно одного из сравниваемых дней'};
 const comparison=eventWindow.observations.map((point,i)=>{
  const previousDay=controls[0].observations[i].returnPercent;
  const twoDays=controls[1].observations[i].returnPercent;
  const meanAbsolute=round((Math.abs(previousDay)+Math.abs(twoDays))/2);
  return {minutes:point.minutes,
   sampledAfterMinutes:point.sampledAfterMinutes,
   newsReturnPercent:point.returnPercent,
   dayBeforePercent:previousDay,
   twoDaysBeforePercent:twoDays,
   previousMeanAbsolutePercent:meanAbsolute,
   absoluteDifferencePercentagePoints:round(Math.abs(point.returnPercent)-meanAbsolute),
   referenceCount:2};
 });
 return {state:'OBSERVED',version:NEWS_M5_BASELINE_VERSION,
  eventTitle:event.title,eventAt:event.observedAt,symbol,
  source:'Binance Spot public M5',referenceAt:spec.controlAt,
  totalClosedCandles:spec.expectedCount,
  eventWindow,controls,comparison,
  eventFactVerified:false,causalImpact:'NOT_ESTABLISHED',
  statisticalSignificance:'NOT_EVALUATED',
  note:'Два контрольных периода — лишь примеры движения в то же время UTC за предыдущие дни. Это не статистическая норма, не доказательство влияния публикации и не прогноз.'};
}
export async function fetchNewsM5Baseline(event,{
 symbol='BTCUSDT',fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const at=now(),spec=newsM5BaselineEligibility(event,{symbol,now:at});
 if(spec.state!=='READY')return spec;
 const query=new URLSearchParams({
  symbol,interval:'5m',timeZone:'0',
  startTime:String(spec.start),endTime:String(spec.last+FIVE-1),
  limit:String(spec.expectedCount)
 });
 try{
  const response=await fetchImpl(API+'?'+query,{
   method:'GET',credentials:'omit',cache:'no-store',signal
  });
  if(response?.status===429||response?.status===418)
   return {state:'RATE_LIMITED',reason:'Binance ограничила запросы'};
  if(!response?.ok)return {state:'OFFLINE',
   reason:'Binance HTTP '+String(response?.status||'?')};
  return compareNewsM5Baseline(event,await response.json(),{symbol,now:at});
 }catch(e){
  return {state:'OFFLINE',reason:String(e?.message||e).slice(0,150)};
 }
}
