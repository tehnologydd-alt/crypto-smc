/**
 * APEX live orderbook UI projection. Never infers new book levels, writes Room,
 * or equates API health with fresh orderbook observations.
 */
const VENUES=['binance','okx'];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const allowedMethods=new Set(['PUBLIC_WS_BOOK_SNAPSHOT','PUBLIC_REST_BOOK_SNAPSHOT']);
function valid(b,asset,venue){
 return b&&b.symbol===asset&&b.venue===venue&&b.market==='SPOT'&&
  b.sampleScope==='LIMITED_PUBLIC_SNAPSHOT'&&
  allowedMethods.has(b.collectionMethod)&&
  Number.isSafeInteger(b.receivedAt)&&b.receivedAt>0&&
  finite(b.bestBid)&&finite(b.bestAsk)&&b.bestBid>0&&
  b.bestAsk>b.bestBid&&
  finite(b.spreadBps)&&b.spreadBps>0&&b.spreadBps<=2000&&
  finite(b.visibleDepthImbalance)&&Math.abs(b.visibleDepthImbalance)<=1;
}
export function currentLiquidityBooks(books,{asset,now=Date.now()}={}){
 if(!/^[A-Z0-9]{5,20}$/.test(asset||'')||
  !Number.isSafeInteger(now)||now<=0)return {state:'INVALID',venues:{}};
 const venues={};
 for(const venue of VENUES){
  const book=(Array.isArray(books)?books:[]).filter(b=>
   valid(b,asset,venue)&&b.receivedAt<=now).sort((a,b)=>
   b.receivedAt-a.receivedAt)[0];
  if(!book){
   venues[venue]={state:'UNAVAILABLE',venue};
   continue;
  }
  const ageMs=now-book.receivedAt;
  const isWs=book.collectionMethod==='PUBLIC_WS_BOOK_SNAPSHOT';
  // A saved REST sample is never described as a continuous live stream.
  // Bound both to the same strict as-of UI freshness window.
  const freshnessMs=12000;
  if(ageMs>freshnessMs){
   venues[venue]={state:'STALE',venue,at:book.receivedAt,
    ageMs,source:isWs?'WS':'REST'};
   continue;
  }
  venues[venue]={state:'FRESH',venue,at:book.receivedAt,ageMs,
   source:isWs?'WS':'REST',depthMax:book.snapshotLevelsMax,
   imbalancePct:book.visibleDepthImbalance*100,spreadBps:book.spreadBps,
   bidNotional:book.bidNotional,askNotional:book.askNotional,
   scope:'VISIBLE_PARTIAL_ORDERBOOK',timeBasis:'DEVICE_RECEIVED_AT'};
 }
 return {state:'OK',asset,checkedAt:now,venues};
}
