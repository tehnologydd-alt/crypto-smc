/**
 * APEX 9 — descriptive Spot M5 price observations around PUBLISHED headlines.
 * Read-only; a published timestamp is not proof that a reported event occurred
 * then, nor that the headline caused a price move. No forecast or order logic.
 * Requires continuous, fully closed five-minute candles, with no interpolation.
 */
const ENDPOINT='https://data-api.binance.vision/api/v3/klines';
const FIVE=300000, HOUR=12*FIVE, FOUR_HOURS=48*FIVE;
const HORIZONS=[15,60,240];
const MAX_AGE=48*3600000;
export const NEWS_M5_VERSION='PUBLISHED_HEADLINE_M5_OBSERVATION_V1';
const pct=(x,y)=>Number((100*(x/y-1)).toFixed(4));
const rounded=x=>Number(x.toFixed(3));
const symbolOk=s=>typeof s==='string'&&/^[A-Z0-9]{2,15}USDT$/.test(s);
const positive=x=>Number.isFinite(x)&&x>0;
export function newsM5Eligibility(event,{symbol='BTCUSDT',now=Date.now()}={}){
 if(!symbolOk(symbol)||typeof event?.title!=='string'||!event.title.trim()||
  event.title.length>220||event?.timeKind!=='PUBLISHED'||
  !Number.isSafeInteger(event.observedAt)||event.observedAt<1||
  !Number.isSafeInteger(now)||now<=0)
  return {state:'INELIGIBLE',reason:'Нужна публикация с достоверным временем публикации и Spot USDT пара'};
 let uri;
 try{uri=new URL(event.href);}catch{}
 if(!uri||uri.protocol!=='https:'||uri.username||uri.password||!uri.hostname.includes('.'))
  return {state:'INELIGIBLE',reason:'Нет допустимой ссылки на исходную публикацию'};
 const at=event.observedAt;
 if(at>now||now-at>MAX_AGE)return {state:'INELIGIBLE',
  reason:'Публикация вне наблюдаемого периода 48 часов'};
 const base=Math.floor(at/FIVE)*FIVE;
 const start=base-13*FIVE;
 const last=Math.min(base+48*FIVE,Math.floor(now/FIVE)*FIVE-FIVE);
 if(start<=0)return {state:'INELIGIBLE',reason:'Некорректный период свечей'};
 if(last<base+3*FIVE)return {state:'NOT_READY',
  reason:'15-минутный горизонт ещё не закрыт'};
 return {state:'READY',base,start,last,at,
  expectedCount:(last-start)/FIVE+1};
}
function parseRow(row,now){
 if(!Array.isArray(row)||row.length<7)return null;
 const t=Number(row[0]),end=Number(row[6]);
 const [open,high,low,close,volume]=row.slice(1,6).map(Number);
 if(!Number.isSafeInteger(t)||t<=0||t%FIVE!==0||
  end!==t+FIVE-1||end>=now||
  ![open,high,low,close].every(positive)||
  !Number.isFinite(volume)||volume<0||
  high<Math.max(open,low,close)||low>Math.min(open,high,close))
  return null;
 return {t,closeAt:end,open,high,low,close,volume};
}
export function compareNewsPublishedM5(event,raw,{
 symbol='BTCUSDT',now=Date.now()
}={}){
 const spec=newsM5Eligibility(event,{symbol,now});
 if(spec.state!=='READY')return spec;
 if(!Array.isArray(raw)||raw.length!==spec.expectedCount)
  return {state:'INCOMPLETE',reason:'Получена неполная история свечей M5'};
 const bars=new Map();
 for(const row of raw){
  const bar=parseRow(row,now);
  if(!bar||bar.t<spec.start||bar.t>spec.last||bars.has(bar.t))
   return {state:'INVALID',reason:'Некорректная, незакрытая или повторяющаяся свеча M5'};
  bars.set(bar.t,bar);
 }
 for(let t=spec.start;t<=spec.last;t+=FIVE)
  if(!bars.has(t))return {state:'INCOMPLETE',reason:'Пропущены свечи M5'};
 const baseline=bars.get(spec.base-FIVE);
 const prior=bars.get(spec.base-13*FIVE);
 const pre=Array.from({length:12},(_,i)=>bars.get(spec.base-(12-i)*FIVE));
 const preAvgVolume=pre.reduce((total,c)=>total+c.volume,0)/12;
 // For a mid-candle headline, exclude its mixed pre/post candle from
 // volume/extremum observations. Baseline remains the earlier closed candle,
 // so headline-bar price movement cannot be separated at 5m resolution.
 const pureAfterOpen=Math.ceil(spec.at/FIVE)*FIVE;
 const observations=[];
 for(const minutes of HORIZONS){
  const target=spec.base+minutes*60000;
  if(target>spec.last)continue;
  const completed=bars.get(target);
  const after=[];
  for(let t=pureAfterOpen;t<=target;t+=FIVE)after.push(bars.get(t));
  if(!after.length)return {state:'INCOMPLETE',reason:'Нет полностью наблюдаемых свечей после публикации'};
  const averageVolume=after.reduce((s,c)=>s+c.volume,0)/after.length;
  observations.push({
   minutes,closeAt:completed.closeAt,close:completed.close,
   changePercent:pct(completed.close,baseline.close),
   highestPercent:pct(Math.max(...after.map(x=>x.high)),baseline.close),
   lowestPercent:pct(Math.min(...after.map(x=>x.low)),baseline.close),
   volumeVsPreviousHour:preAvgVolume>0?
    rounded(averageVolume/preAvgVolume):null,
   postCandles:after.length,
   volumeBasis:'AVERAGE_CANDLE_VOLUME_VS_PREVIOUS_12_CLOSED_M5',
   partialHeadlineCandleExcluded:spec.at%FIVE!==0
  });
 }
 return {
  state:observations.length===3?'OBSERVED':'PARTIAL',
  version:NEWS_M5_VERSION,symbol,eventAt:spec.at,
  eventTitle:event.title,publicationUrl:event.href,
  publicationTimeKind:'PUBLISHED',
  priceSource:'Binance Spot public M5',
  closedCandles:spec.expectedCount,
  lastClosedAt:bars.get(spec.last).closeAt,
  baselineAt:baseline.closeAt,baselineClose:baseline.close,
  priorHourReturnPercent:pct(baseline.close,prior.close),
  observations,availableHorizons:observations.map(x=>x.minutes),
  causalImpact:'NOT_ESTABLISHED',publicationEventTime:'NOT_VERIFIED',
  mixedCandleCaveat:spec.at%FIVE!==0,
  note:'Проверенное время публикации не доказывает время события. Цена от последней завершённой свечи перед публикацией; при неполной M5 свече часть движения внутри неё не разделяется. Прошлая реакция не прогноз.'
 };
}
export async function fetchNewsPublishedM5(event,{
 symbol='BTCUSDT',fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const current=now(),spec=newsM5Eligibility(event,{symbol,now:current});
 if(spec.state!=='READY')return spec;
 const params=new URLSearchParams({
  symbol,interval:'5m',timeZone:'0',
  startTime:String(spec.start),
  endTime:String(spec.last+FIVE-1),
  limit:String(spec.expectedCount)
 });
 try{
  const res=await fetchImpl(ENDPOINT+'?'+params.toString(),{
   method:'GET',credentials:'omit',cache:'no-store',signal
  });
  if(res?.status===418||res?.status===429)
   return {state:'RATE_LIMITED',reason:'Binance ограничила запросы'};
  if(!res?.ok)return {state:'OFFLINE',reason:'Binance HTTP '+String(res?.status||'?')};
  const raw=await res.json();
  return compareNewsPublishedM5(event,raw,{symbol,now:current});
 }catch(error){
  return {state:'OFFLINE',reason:String(error?.message||error).slice(0,150)};
 }
}
