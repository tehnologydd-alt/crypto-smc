/**
 * APEX Android First — authentic Binance Spot OHLCV candles.
 * Research-only market structure, no trading instructions.
 * API: read-only GET /api/v3/klines. Closed candles only enter analysis.
 */
export const CANDLE_INTERVALS=Object.freeze({'1m':60000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000});
const BASE_URL='https://data-api.binance.vision/api/v3/klines';
const validNumber=n=>typeof n==='number'&&Number.isFinite(n);
const positive=n=>validNumber(n)&&n>0;
const symbolPattern=/^[A-Z0-9]{5,20}$/;
export function parseKlines(raw,interval,receivedAt){
 const step=CANDLE_INTERVALS[interval];
 if(!step||!Number.isSafeInteger(receivedAt)||receivedAt<=0)throw Error('Неверный таймфрейм или время');
 if(!Array.isArray(raw)||!raw.length||raw.length>1000)throw Error('Пустые или неверные свечные данные');
 let previous=-1;
 return raw.map((r,i)=>{
  if(!Array.isArray(r)||r.length<7)throw Error('Неверный формат свечи #'+i);
  const t=Number(r[0]),open=Number(r[1]),high=Number(r[2]),
   low=Number(r[3]),close=Number(r[4]),volume=Number(r[5]),end=Number(r[6]);
  if(!Number.isSafeInteger(t)||t<1||!Number.isSafeInteger(end)||
     t%step!==0||end!==t+step-1||t<=previous||
     t>receivedAt+60000||
     !positive(open)||!positive(high)||!positive(low)||!positive(close)||
     !validNumber(volume)||volume<0||
     high<Math.max(open,close,low)||low>Math.min(open,close,high)||
     high<low)throw Error('Несогласованные OHLCV данные #'+i);
  previous=t;
  return {t,open,high,low,close,volume,closeAt:end,closed:receivedAt>end};
 });
}
export async function fetchCandles(symbol,interval,{
 fetchImpl=fetch,now=()=>Date.now(),signal,limit=500
}={}){
 if(!symbolPattern.test(symbol)||!CANDLE_INTERVALS[interval]||
    !Number.isSafeInteger(limit)||limit<20||limit>1000)
  return {state:'INVALID',symbol,interval,candles:[],error:'Неверный актив или таймфрейм'};
 const url=BASE_URL+'?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit='+limit;
 try{
  const response=await fetchImpl(url,{method:'GET',signal,cache:'no-store',credentials:'omit'});
  if(response.status===418||response.status===429)
   return {state:'RATE_LIMITED',symbol,interval,candles:[],error:'Биржа ограничила запросы'};
  if(!response.ok)
   return {state:'OFFLINE',symbol,interval,candles:[],error:'HTTP '+response.status};
  const receivedAt=now();
  const raw=await response.json();
  const candles=parseKlines(raw,interval,receivedAt);
  const closed=candles.filter(c=>c.closed);
  const last=closed.at(-1);
  const stale=!last||receivedAt-last.closeAt>2*CANDLE_INTERVALS[interval]+60000;
  return {state:stale?'STALE':'OK',symbol,interval,candles,closedCount:closed.length,
   receivedAt,error:stale?'Последние завершённые свечи устарели':null,
   provider:'Binance Spot',scope:'PUBLIC_SPOT_OHLCV'};
 }catch(error){
  return {state:'OFFLINE',symbol,interval,candles:[],
   error:String(error?.message||error).slice(0,180)};
 }
}

/**
 * Structure uses only CLOSED source bars and confirmed swing points.
 * A swing at i is first knowable at i + right (no future-data leakage).
 * BOS/CHoCH are retrospective labels, not actionable forecast signals.
 */
export function analyzeStructure(candles,{left=2,right=2}={}){
 if(!Array.isArray(candles)||!Number.isSafeInteger(left)||!Number.isSafeInteger(right)||
    left<1||right<1||left>5||right>5)return {status:'INSUFFICIENT',events:[],swings:[],bias:'UNKNOWN'};
 const bars=candles.filter(c=>c&&c.closed===true&&Number.isFinite(c.close)&&Number.isFinite(c.high)&&Number.isFinite(c.low));
 if(bars.length<left+right+5)return {status:'INSUFFICIENT',events:[],swings:[],bias:'UNKNOWN'};
 const swings=[],events=[];
 let lastHigh=null,lastLow=null,trend=null;
 for(let i=left+right;i<bars.length;i++){
  const center=i-right;
  if(center-left>=0){
   const pivot=bars[center];
   let isHigh=true,isLow=true;
   for(let k=center-left;k<=center+right;k++){
    if(k===center)continue;
    if(bars[k].high>=pivot.high)isHigh=false;
    if(bars[k].low<=pivot.low)isLow=false;
   }
   if(isHigh){
    const p={type:'HIGH',time:pivot.t,confirmedAt:bars[i].closeAt,level:pivot.high,broken:false};
    swings.push(p);lastHigh=p;
   }
   if(isLow){
    const p={type:'LOW',time:pivot.t,confirmedAt:bars[i].closeAt,level:pivot.low,broken:false};
    swings.push(p);lastLow=p;
   }
  }
  const bar=bars[i],prev=bars[i-1];
  const up=lastHigh&&!lastHigh.broken&&bar.close>lastHigh.level&&prev.close<=lastHigh.level;
  const down=lastLow&&!lastLow.broken&&bar.close<lastLow.level&&prev.close>=lastLow.level;
  if(!up&&!down)continue;
  const direction=up?'UP':'DOWN';
  const pivot=up?lastHigh:lastLow;
  pivot.broken=true;
  const classification=trend===null?'BREAK':trend===direction?'BOS':'CHoCH';
  events.push({type:classification,direction,time:bar.closeAt,
   level:pivot.level,pivotTime:pivot.time,confirmedAt:pivot.confirmedAt,
   comment:'Исторический пробой подтверждённой структуры, не прогноз'});
  trend=direction;
 }
 return {status:'OK',events:events.slice(-50),swings:swings.slice(-100),
  bias:trend||'UNKNOWN',analyzedBars:bars.length};
}
