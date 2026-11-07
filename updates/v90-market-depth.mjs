/**
 * APEX 9.0 — strictly public, read-only order-book snapshot collector.
 * Market depth is limited to the VISIBLE published snapshot on one venue.
 * It is NOT a complete liquidity heatmap, liquidation map or trade signal.
 * Never passes credentials, private requests, or order instructions.
 */
const HOSTS=Object.freeze({
 binance:'https://data-api.binance.vision',
 bybit:'https://api.bybit.com'
});
const validSymbol=(x)=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const positive=(x)=>Number.isFinite(x)&&x>0;
function parseLevels(levels,label){
 if(!Array.isArray(levels)||!levels.length)throw Error(label+': empty orderbook');
 const out=levels.map(pair=>{
  if(!Array.isArray(pair)||pair.length<2)throw Error(label+': malformed level');
  const price=Number(pair[0]),qty=Number(pair[1]);
  if(!positive(price)||!positive(qty))throw Error(label+': invalid price or quantity');
  return {price,qty,notional:price*qty};
 });
 if(out.some(x=>!Number.isFinite(x.notional)))throw Error(label+': nonfinite notional');
 return out;
}
/** Normalize one public response. Timestamps must not be fabricated. */
export function parseDepthSnapshot(venue,symbol,payload,receivedAt){
 if(!Object.hasOwn(HOSTS,venue)||!validSymbol(symbol)||
    !Number.isSafeInteger(receivedAt)||receivedAt<=0)throw Error('invalid request metadata');
 const data=venue==='binance'?payload:payload?.result;
 if(venue==='bybit'&&(payload?.retCode!==0||data?.s!==symbol))throw Error('Bybit invalid response');
 if(!data||typeof data!=='object')throw Error('missing orderbook data');
 const bids=parseLevels(venue==='binance'?data.bids:data.b,'bids');
 const asks=parseLevels(venue==='binance'?data.asks:data.a,'asks');
 const highestBid=Math.max(...bids.map(x=>x.price));
 const lowestAsk=Math.min(...asks.map(x=>x.price));
 if(highestBid>=lowestAsk)throw Error('crossed orderbook snapshot');
 const bidNotional=bids.reduce((a,x)=>a+x.notional,0);
 const askNotional=asks.reduce((a,x)=>a+x.notional,0);
 const sum=bidNotional+askNotional;
 if(!positive(sum)||!Number.isFinite(sum))throw Error('invalid depth totals');
 const mid=(highestBid+lowestAsk)/2;
 const exchangeTimestamp=venue==='bybit'&&Number.isSafeInteger(data.ts)&&data.ts>0?data.ts:null;
 if(exchangeTimestamp!==null&&exchangeTimestamp>receivedAt+60000)throw Error('future exchange timestamp');
 const updateId=venue==='binance'?data.lastUpdateId:data.u;
 return {
  venue,symbol,market:'SPOT',receivedAt,exchangeTimestamp,
  updateId:Number.isSafeInteger(updateId)?updateId:null,
  bidLevels:bids.length,askLevels:asks.length,
  bestBid:highestBid,bestAsk:lowestAsk,mid,
  spreadBps:(lowestAsk-highestBid)/mid*10000,
  bidNotional,askNotional,visibleDepthImbalance:(bidNotional-askNotional)/sum,
  sampleScope:'LIMITED_PUBLIC_SNAPSHOT',calibratedProbability:null
 };
}
/**
 * Public GET only. The provided fetchImpl facilitates deterministic unit tests.
 * No live data is represented if an error/rate-limit/geo restriction occurs.
 */
export async function fetchPublicDepth(venue,symbol,{
 fetchImpl=fetch, now=()=>Date.now(), signal
}={}){
 if(!Object.hasOwn(HOSTS,venue)||!validSymbol(symbol)){
  return {state:'INVALID',venue,symbol,error:'unsupported venue or symbol',data:null};
 }
 const path=venue==='binance'
  ?'/api/v3/depth?symbol='+encodeURIComponent(symbol)+'&limit=100'
  :'/v5/market/orderbook?category=spot&symbol='+encodeURIComponent(symbol)+'&limit=50';
 const url=HOSTS[venue]+path;
 try{
  const response=await fetchImpl(url,{method:'GET',signal,cache:'no-store',credentials:'omit'});
  if(response.status===429||response.status===418)
   return {state:'RATE_LIMITED',venue,symbol,error:'source rate limited',data:null};
  if(!response.ok)return {state:'OFFLINE',venue,symbol,error:'HTTP '+response.status,data:null};
  const payload=await response.json();
  const receivedAt=now();
  return {state:'OK',venue,symbol,error:null,data:parseDepthSnapshot(venue,symbol,payload,receivedAt)};
 }catch(error){
  return {state:'OFFLINE',venue,symbol,error:String(error?.message||error),data:null};
 }
}
