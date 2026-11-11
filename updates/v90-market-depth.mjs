/**
 * APEX 9.0 — strictly public, read-only order-book snapshot collector.
 * Market depth is limited to the VISIBLE published snapshot on one venue.
 * It is NOT a complete liquidity heatmap, liquidation map or trade signal.
 * Never passes credentials, private requests, or order instructions.
 */
const HOSTS=Object.freeze({
 binance:'https://data-api.binance.vision',
 okx:'https://www.okx.com',
 bybit:'https://api.bybit.com' // legacy parser only; no active Stage 3 polling
});
const validSymbol=(x)=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const positive=(x)=>Number.isFinite(x)&&x>0;
// Provider numeric fields are sometimes stringified. Only safe decimal
// integer timestamps/ids may be normalized; do not invent timestamps.
const safeInteger=x=>Number.isSafeInteger(x)?x:
 (typeof x==='string'&&/^[0-9]{1,16}$/.test(x.trim())&&
  Number.isSafeInteger(Number(x))?Number(x):null);
function parseLevels(levels,label){
 if(!Array.isArray(levels)||!levels.length)throw Error(label+': empty orderbook');
 const out=[];
 for(const pair of levels){
  if(!Array.isArray(pair)||pair.length<2)
   throw Error(label+': malformed level');
  const price=Number(pair[0]),qty=Number(pair[1]);
  if(!positive(price)||!Number.isFinite(qty)||qty<0)
   throw Error(label+': invalid price or quantity');
  // Ignore non-tradable zero-size snapshots rather than treating the
  // entire published orderbook as fake. WebSocket deltas are not used.
  if(qty===0)continue;
  const notional=price*qty;
  if(!positive(notional))throw Error(label+': nonfinite notional');
  out.push({price,qty,notional});
 }
 if(!out.length)throw Error(label+': no positive visible levels');
 return out;
}
/**
 * Keep only a bounded set of the largest VISIBLE quoted levels per side.
 * No hidden liquidity or order identity is inferred from a price bucket.
 */
function selectedVisibleLevels(rows,side){
 const ordered=[...rows].sort((a,b)=>a.notional-b.notional);
 const midpoint=ordered.length>>1;
 const median=ordered.length%2
  ?ordered[midpoint].notional
  :(ordered[midpoint-1].notional+ordered[midpoint].notional)/2;
 return [...rows].sort((a,b)=>b.notional-a.notional)
  .slice(0,8).map(x=>({
   side,price:x.price,quantity:x.qty,notional:x.notional,
   relativeToMedian:median>0?x.notional/median:0
  }));
}
/** Normalize one public response. Timestamps must not be fabricated. */
export function parseDepthSnapshot(venue,symbol,payload,receivedAt){
 if(!Object.hasOwn(HOSTS,venue)||!validSymbol(symbol)||
    !Number.isSafeInteger(receivedAt)||receivedAt<=0)throw Error('invalid request metadata');
 const data=venue==='binance'?payload:
  venue==='okx'?payload?.data?.[0]:payload?.result;
 if(venue==='okx'&&
  (payload?.code!=='0'||!Array.isArray(payload?.data)||
   payload.data.length!==1))
  throw Error('OKX invalid response');
 if(venue==='bybit'&&(payload?.retCode!==0||data?.s!==symbol))throw Error('Bybit invalid response');
 if(!data||typeof data!=='object')throw Error('missing orderbook data');
 const bids=parseLevels(venue==='bybit'?data.b:data.bids,'bids');
 const asks=parseLevels(venue==='bybit'?data.a:data.asks,'asks');
 const highestBid=Math.max(...bids.map(x=>x.price));
 const lowestAsk=Math.min(...asks.map(x=>x.price));
 if(highestBid>=lowestAsk)throw Error('crossed orderbook snapshot');
 const bidNotional=bids.reduce((a,x)=>a+x.notional,0);
 const askNotional=asks.reduce((a,x)=>a+x.notional,0);
 const sum=bidNotional+askNotional;
 if(!positive(sum)||!Number.isFinite(sum))throw Error('invalid depth totals');
 const mid=(highestBid+lowestAsk)/2;
 const rawTs=venue==='bybit'?(data.ts??payload.ts):
  venue==='okx'?data.ts:null;
 const exchangeTimestamp=venue==='bybit'||venue==='okx'?
  safeInteger(rawTs):null;
 if((venue==='bybit'||venue==='okx')&&(!exchangeTimestamp||exchangeTimestamp<=0))
  throw Error(venue.toUpperCase()+' missing/invalid exchange timestamp');
 const providerTime=venue==='bybit'?safeInteger(payload.time):null;
 if(providerTime!==null&&Math.abs(providerTime-exchangeTimestamp)>180000)
  throw Error('Bybit inconsistent server/orderbook timestamps');
 // If server and snapshot agree but the device does not, the phone's clock
 // may be skewed. Do not relabel an old book as current; diagnose instead.
 if(exchangeTimestamp!==null&&exchangeTimestamp>receivedAt+60000)
  throw Error('device clock behind exchange time');
 if(exchangeTimestamp!==null&&receivedAt-exchangeTimestamp>180000)
  throw Error(providerTime!==null&&
   Math.abs(providerTime-exchangeTimestamp)<=180000?
   'device clock ahead of exchange time':'stale exchange snapshot');
 const updateId=venue==='binance'?data.lastUpdateId:
  venue==='okx'?data.seqId:data.u;
 return {
  venue,symbol,market:'SPOT',receivedAt,exchangeTimestamp,
  updateId:safeInteger(updateId),
  bidLevels:bids.length,askLevels:asks.length,
  collectionMethod:'PUBLIC_REST_BOOK_SNAPSHOT',
  snapshotLevelsMax:venue==='binance'?100:50,
  bestBid:highestBid,bestAsk:lowestAsk,mid,
  spreadBps:(lowestAsk-highestBid)/mid*10000,
  bidNotional,askNotional,visibleDepthImbalance:(bidNotional-askNotional)/sum,
  topVisibleLevels:[
   ...selectedVisibleLevels(bids,'BID'),
   ...selectedVisibleLevels(asks,'ASK')
  ],
  // Runtime-only, bounded actual displayed price levels. Necessary for
  // matching the SAME price-distance band across venues: the 8 largest
  // levels are not contiguous and cannot prove price-band coverage.
  // Mobile Room snapshots intentionally DO NOT persist this array.
  visibleBook:{
   bids:[...bids].sort((a,b)=>b.price-a.price).slice(0,100),
   asks:[...asks].sort((a,b)=>a.price-b.price).slice(0,100)
  },
  levelSelection:'TOP_8_NOTIONAL_PER_SIDE', 
  sampleScope:'LIMITED_PUBLIC_SNAPSHOT',calibratedProbability:null
 };
}
/**
 * Public GET only. The provided fetchImpl facilitates deterministic unit tests.
 * No live data is represented if an error/rate-limit/geo restriction occurs.
 */
export async function fetchPublicDepth(venue,symbol,{
 fetchImpl=fetch, now=()=>Date.now(), signal, levelLimit=null
}={}){
 // Paired 50/50 is opt-in for the comparison fallback; defaults unchanged.
 if(levelLimit!==null&&levelLimit!==50)
  return {state:'INVALID',venue,symbol,error:'unsupported equal-depth limit',data:null};
 if(!Object.hasOwn(HOSTS,venue)||!validSymbol(symbol)){
  return {state:'INVALID',venue,symbol,error:'unsupported venue or symbol',data:null};
 }
 const okxPair=(s)=>{
  const m=/^([A-Z0-9]{2,16})(USDT|USDC|EUR|BTC)$/.exec(s);
  return m?m[1]+'-'+m[2]:null;
 };
 const instId=venue==='okx'?okxPair(symbol):null;
 if(venue==='okx'&&!instId)
  return {state:'INVALID',venue,symbol,error:'Unsupported OKX instrument syntax',data:null};
 const requestedLevels=levelLimit===50?50:null;
 const path=venue==='binance'
  ?'/api/v3/depth?symbol='+encodeURIComponent(symbol)+'&limit='+(requestedLevels||100):
  venue==='okx'
   ?'/api/v5/market/books?instId='+encodeURIComponent(instId)+'&sz='+(requestedLevels||50)
   :'/v5/market/orderbook?category=spot&symbol='+encodeURIComponent(symbol)+'&limit=50';
 const url=HOSTS[venue]+path;
 try{
  const response=await fetchImpl(url,{method:'GET',signal,cache:'no-store',credentials:'omit'});
  if([429,418].includes(response.status))
   return {state:'RATE_LIMITED',venue,symbol,error:'source rate limited',data:null};
  if([401,403,451].includes(response.status))
   return {state:'ACCESS_DENIED',venue,symbol,error:'HTTP '+response.status,data:null};
  if(!response.ok){
   if(venue==='binance'&&response.status===400){
    try{
     const failed=await response.json();
     if(failed?.code===-1121)
      return {state:'NOT_LISTED',venue,symbol,error:'Binance Spot: invalid symbol',data:null};
    }catch{}
   }
   return {state:'OFFLINE',venue,symbol,error:'HTTP '+response.status,data:null};
  }
  const payload=await response.json();
  if(venue==='okx'){
   if(payload?.code==='50011')
    return {state:'RATE_LIMITED',venue,symbol,error:'OKX rate limit',data:null};
   if(payload?.code==='51001')
    return {state:'NOT_LISTED',venue,symbol,error:'OKX Spot instrument unavailable',data:null};
   if(payload?.code!=='0')
    return {state:'INVALID',venue,symbol,error:'OKX '+String(payload?.code||'?')+
     ' · '+String(payload?.msg||'invalid response').slice(0,90),data:null};
  }
  if(venue==='bybit'){
   if(payload?.retCode===10006)
    return {state:'RATE_LIMITED',venue,symbol,error:'Bybit API rate limited',data:null};
   if(payload?.retCode===10009)
    return {state:'ACCESS_DENIED',venue,symbol,error:'Bybit: региональный доступ ограничен (10009)',data:null};
   // retCode 10001 means *general* parameter error. Only the precise
   // provider message "Not supported symbols" identifies an unavailable
   // SPOT pair. Other 10001 errors stay INVALID, never silently delisted.
   const retMsg=typeof payload?.retMsg==='string'?payload.retMsg:'';
   const unsupported=payload?.retCode===10001&&
    /(?:not\s+support(?:ed)?\s+symbols?\b|symbols?\s+(?:is\s+|are\s+)?not\s+support(?:ed)?\b)/i.test(retMsg);
   if(payload?.retCode===170121||payload?.retCode===10029||unsupported)
    return {state:'NOT_LISTED',venue,symbol,
     error:'Bybit Spot · '+symbol+' · '+String(payload.retCode)+
      ': '+(retMsg||'not listed').slice(0,90),data:null};
   if(payload?.retCode!==0)
    return {state:'INVALID',venue,symbol,error:
     'Bybit retCode '+String(payload?.retCode??'?')+' · '+String(payload?.retMsg||'invalid response').slice(0,90),data:null};
  }
  const receivedAt=now();
  try{
   const data=parseDepthSnapshot(venue,symbol,payload,receivedAt);
   if(requestedLevels!==null){
    if(data.visibleBook.bids.length>requestedLevels||
       data.visibleBook.asks.length>requestedLevels)
     throw Error('orderbook exceeds requested levels');
    data.snapshotLevelsMax=requestedLevels;
   }
   return {state:'OK',venue,symbol,error:null,data};
  }catch(error){
   const reason=String(error?.message||error).slice(0,120);
   const state=reason.startsWith('device clock')?'CLOCK_SKEW':
    reason.includes('stale')?'STALE':'INVALID';
   return {state,venue,symbol,error:reason,data:null};
  }
 }catch(error){
  return {state:'OFFLINE',venue,symbol,
   error:String(error?.message||error).slice(0,120),data:null};
 }
}
