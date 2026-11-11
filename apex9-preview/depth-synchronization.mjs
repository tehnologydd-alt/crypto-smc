/**
 * APEX synchronous Spot depth comparison / read-only observational context.
 * Compares ONLY verified actual snapshots of the same symbol collected on
 * the same device within 3 s, with equal price-distance coverage.
 *
 * This is NOT a complete book, owner identification, price prediction,
 * arbitrage, or an instruction to buy/sell. Without BOTH sufficient
 * near-mid level coverages, cross-venue difference remains unknown.
 *
 * Provider `exchangeTimestamp` is not comparable with Binance REST/WS
 * (which publishes no exchange time in these snapshots). receivedAt
 * provides only a device-local reception-time alignment, not proof that
 * exchange clocks, network latency or snapshot instants were identical.
 */
export const DEPTH_SYNC_VERSION='APEX_SPOT_DEPTH_SYNC_V1';
export const DEPTH_SYNC_POLICY=Object.freeze({
 maxPairLagMs:3000,maxAgeMs:12000,maxBandBps:10,
 minBandBps:0.5,bandRoundingBps:0.1,minLevelsPerSide:2,
 maxVisibleLevelsPerSide:100
});
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;
const states=new Set(['SYNCED','WAITING','STALE','MISALIGNED',
 'DIFFERENT_ASSET','INSUFFICIENT_COVERAGE','INVALID']);
function response(state,{asset=null,binance=null,okx=null,lagMs=null,
 reason='',now=Date.now(),...details}={}){
 return {version:DEPTH_SYNC_VERSION,state:states.has(state)?state:'INVALID',
  asset,lagMs,binanceAt:binance?.receivedAt??null,okxAt:okx?.receivedAt??null,
  checkedAt:now,reason,commonBandBps:null,binanceImbalancePct:null,
  okxImbalancePct:null,differencePctPoints:null,
  comparable:false,predictive:false,affectsForecast:false,
  timeBasis:'LOCAL_RECEIPT_NOT_SIMULTANEOUS_EXCHANGE',
  ...details};
}
const validSide=(items,side,limit)=>{
 if(!Array.isArray(items)||items.length<DEPTH_SYNC_POLICY.minLevelsPerSide||
  items.length>Math.min(DEPTH_SYNC_POLICY.maxVisibleLevelsPerSide,limit))
  return false;
 const seen=new Set();
 let previous=null;
 for(const level of items){
  if(!positive(level?.price)||!positive(level?.qty)||
   !positive(level?.notional)||
   Math.abs(level.price*level.qty-level.notional)/
    level.notional>1e-8||
   seen.has(level.price))return false;
  if(previous!==null&&
   (side==='bid'?level.price>=previous:level.price<=previous))return false;
  previous=level.price;seen.add(level.price);
 }
 return true;
};
function validBook(b,venue){
 if(!b||b.venue!==venue||b.market!=='SPOT'||
  b.sampleScope!=='LIMITED_PUBLIC_SNAPSHOT'||
  !validTime(b.receivedAt)||typeof b.symbol!=='string'||
  !/^[A-Z0-9]{5,20}$/.test(b.symbol)||
  !positive(b.mid)||!positive(b.bestBid)||!positive(b.bestAsk)||
  b.bestBid>=b.bestAsk||
  !Number.isSafeInteger(b.snapshotLevelsMax)||
  b.snapshotLevelsMax<2||b.snapshotLevelsMax>100||
  !validSide(b.visibleBook?.bids,'bid',b.snapshotLevelsMax)||
  !validSide(b.visibleBook?.asks,'ask',b.snapshotLevelsMax))return false;
 const bids=b.visibleBook.bids,asks=b.visibleBook.asks;
 if(bids[0].price!==b.bestBid||asks[0].price!==b.bestAsk||
  Math.abs((b.bestBid+b.bestAsk)/2-b.mid)/b.mid>1e-9)return false;
 // Exchange time is required for OKX, whereas Binance has no comparable
 // order-book exchange timestamp.
 if(venue==='okx'&&(!validTime(b.exchangeTimestamp)||
  b.exchangeTimestamp>b.receivedAt+60000||
  b.receivedAt-b.exchangeTimestamp>180000))return false;
 return true;
}
const coverage=(book)=>{
 const mid=book.mid,
  bids=book.visibleBook.bids,asks=book.visibleBook.asks;
 return {
  bidBps:(mid-bids.at(-1).price)/mid*10000,
  askBps:(asks.at(-1).price-mid)/mid*10000
 };
};
function withinBand(book,bps){
 const factor=bps/10000,lo=book.mid*(1-factor),
 hi=book.mid*(1+factor);
 const bids=book.visibleBook.bids.filter(x=>x.price>=lo&&x.price<book.mid);
 const asks=book.visibleBook.asks.filter(x=>x.price<=hi&&x.price>book.mid);
 if(bids.length<DEPTH_SYNC_POLICY.minLevelsPerSide||
  asks.length<DEPTH_SYNC_POLICY.minLevelsPerSide)return null;
 const bid=bids.reduce((a,x)=>a+x.notional,0),
  ask=asks.reduce((a,x)=>a+x.notional,0);
 if(!positive(bid)||!positive(ask)||!positive(bid+ask))return null;
 return {bidNotional:bid,askNotional:ask,
  bidLevels:bids.length,askLevels:asks.length,
  imbalancePct:100*(bid-ask)/(bid+ask)};
}
/**
 * `books` may contain differently aged WS or REST snapshots. Never
 * interpolate, carry an older value into a newer time, or sum levels
 * at different source coverage. Suppress ALL compared metrics unless
 * both venues pass time and coverage checks.
 */
export function synchronizeSpotDepth(books,{asset,now=Date.now()}={}){
 if(!validTime(now)||typeof asset!=='string'||
  !/^[A-Z0-9]{5,20}$/.test(asset)||
  !Array.isArray(books)||books.length>4)
  return response('INVALID',{asset,now,reason:'Некорректный запрос'});
 const binance=books.find(b=>b?.venue==='binance');
 const okx=books.find(b=>b?.venue==='okx');
 if(!binance||!okx)
  return response('WAITING',{asset,binance,okx,now,
   reason:'Ожидаем оба подтверждённых стакана'});
 if(binance.symbol!==asset||okx.symbol!==asset)
  return response('DIFFERENT_ASSET',{asset,binance,okx,now,
   reason:'Данные относятся к разным активам'});
 if(!validBook(binance,'binance')||!validBook(okx,'okx'))
  return response('INVALID',{asset,binance,okx,now,
   reason:'Недостаточно проверенных исходных уровней'});
 const bAge=now-binance.receivedAt,oAge=now-okx.receivedAt;
 if(bAge<0||oAge<0||Math.max(bAge,oAge)>DEPTH_SYNC_POLICY.maxAgeMs)
  return response('STALE',{asset,binance,okx,now,
   reason:'Один из стаканов устарел или время телефона изменилось'});
 const lagMs=Math.abs(binance.receivedAt-okx.receivedAt);
 if(lagMs>DEPTH_SYNC_POLICY.maxPairLagMs)
  return response('MISALIGNED',{asset,binance,okx,lagMs,now,
   reason:'Время получения снимков различается более чем на 3 секунды'});
 const cover=[coverage(binance),coverage(okx)];
 const coverageBps=Math.min(...cover.flatMap(x=>[x.bidBps,x.askBps]),
  DEPTH_SYNC_POLICY.maxBandBps);
 const step=DEPTH_SYNC_POLICY.bandRoundingBps;
 const bandBps=Math.floor((coverageBps+1e-10)/step)*step;
 if(!finite(bandBps)||bandBps<DEPTH_SYNC_POLICY.minBandBps)
  return response('INSUFFICIENT_COVERAGE',{asset,binance,okx,lagMs,now,
   reason:'Общий ценовой диапазон слишком узкий для сопоставления'});
 const b=withinBand(binance,bandBps),
  o=withinBand(okx,bandBps);
 if(!b||!o)
  return response('INSUFFICIENT_COVERAGE',{asset,binance,okx,lagMs,now,
   reason:'В общем диапазоне недостаточно уровней с обеих сторон'});
 return response('SYNCED',{asset,binance,okx,lagMs,now,
  commonBandBps:Number(bandBps.toFixed(1)),
  binanceImbalancePct:Number(b.imbalancePct.toFixed(2)),
  okxImbalancePct:Number(o.imbalancePct.toFixed(2)),
  differencePctPoints:Number((b.imbalancePct-o.imbalancePct).toFixed(2)),
  binanceLevels:{bid:b.bidLevels,ask:b.askLevels},
  okxLevels:{bid:o.bidLevels,ask:o.askLevels},
  comparable:true,reason:'Временное окно и единый диапазон цены проверены'});
}
