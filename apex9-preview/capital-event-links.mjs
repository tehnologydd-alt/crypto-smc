/**
 * Cross-venue event sequences: observed facts, never attributed capital paths.
 * The same asset/time window is descriptive co-occurrence, NOT wallet identity.
 * Normalized exchange trades may originate from different venues and can be
 * aggregated executions or individual fills; never silently sum as one order.
 */
const ASSET=/^[A-Z0-9]{2,16}(?:USDT|USDC|USD|EUR)$/;
const VENUES=new Set(['binance','bybit','okx','kraken','bingx','coinbase']);
const safeTime=x=>Number.isSafeInteger(x)&&x>0;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const interval=Object.freeze({short:5*60000,medium:15*60000,long:60*60000});
function validTrade(t,asset,cutoff){
 return t&&VENUES.has(t.venue)&&t.symbol===asset&&
  typeof t.tradeId==='string'&&t.tradeId.length>0&&t.tradeId.length<=100&&
  safeTime(t.tradeAt)&&t.tradeAt<=cutoff&&
  ['BUY_TAKER','SELL_TAKER','UNKNOWN'].includes(t.takerSide)&&
  positive(t.quoteNotional)&&t.quoteNotional<=1e12&&
  ['AGGREGATED_TAKER','INDIVIDUAL_MATCH','EXCHANGE_REPORTED'].includes(t.granularity);
}
/**
 * Trade observations are grouped into fixed, non-overlapping time buckets.
 * Unknown-side activity is counted but never assigned to buy or sell.
 * The relative share is not a buy/sell signal or a probability.
 */
export function venueTradeWindows(trades,{asset,cutoff=Date.now(),
 windowMs=interval.short}={}){
 if(!ASSET.test(asset||'')||!safeTime(cutoff)||
  !Object.values(interval).includes(windowMs))return {state:'INVALID',windows:[]};
 const valid=(Array.isArray(trades)?trades:[]).filter(t=>
  validTrade(t,asset,cutoff)&&cutoff-t.tradeAt<=24*3600000);
 const dedup=new Map();
 for(const t of valid){
  const key=t.venue+':'+asset+':'+t.tradeId;
  if(!dedup.has(key))dedup.set(key,t);
 }
 const buckets=new Map();
 for(const t of dedup.values()){
  const start=Math.floor(t.tradeAt/windowMs)*windowMs;
  let bucket=buckets.get(start);
  if(!bucket){bucket={startAt:start,endAt:start+windowMs,
   buyNotional:0,sellNotional:0,unknownNotional:0,events:0,
   venueMap:new Map()};buckets.set(start,bucket);}
  const info=bucket.venueMap.get(t.venue)||{
   venue:t.venue,buyNotional:0,sellNotional:0,
   unknownNotional:0,eventCount:0,granularities:new Set()};
  const key=t.takerSide==='BUY_TAKER'?'buyNotional':
   t.takerSide==='SELL_TAKER'?'sellNotional':'unknownNotional';
  bucket[key]+=t.quoteNotional;info[key]+=t.quoteNotional;
  info.eventCount++;bucket.events++;info.granularities.add(t.granularity);
  bucket.venueMap.set(t.venue,info);
 }
 const windows=Array.from(buckets.values()).sort((a,b)=>a.startAt-b.startAt)
  .map(b=>({startAt:b.startAt,endAt:b.endAt,
   buyNotional:b.buyNotional,sellNotional:b.sellNotional,
   unknownNotional:b.unknownNotional,eventCount:b.events,
   reportingVenues:b.venueMap.size,
   venues:Array.from(b.venueMap.values()).sort((a,b)=>a.venue.localeCompare(b.venue))
    .map(x=>({...x,granularities:[...x.granularities].sort()})),
   interpretation:'OBSERVED_EXCHANGE_EXECUTIONS_NOT_CAPITAL_PATH'}));
 return {state:'OBSERVED',asset,cutoff,windowMs,
  windows,sourceCoverage:dedup.size?new Set(Array.from(dedup.values()).map(t=>t.venue)).size:0,
  eventCount:dedup.size,
  note:'Only observed public trades. No proof of shared beneficial owner, wallets or causality.'};
}
/** Public on-chain transactions remain unlinked until verified exchange-address
 * attribution exists. A matching time window alone never qualifies.
 */
export function classifyCapitalLink(chainEvent,trade,{maxLagMs=15*60000}={}){
 if(!chainEvent||!trade||!safeTime(chainEvent.observedAt)||
  !safeTime(trade.tradeAt)||!Number.isSafeInteger(maxLagMs)||
  maxLagMs<0||maxLagMs>3600000)return {state:'INVALID'};
 const coincident=Math.abs(chainEvent.observedAt-trade.tradeAt)<=maxLagMs;
 const assetMatch=chainEvent.asset===trade.symbol;
 if(!coincident||!assetMatch)return {state:'NO_TEMPORAL_MATCH',
  directAttribution:false};
 // Current on-chain adapters do not prove exchange ownership or order linkage.
 // Even verified deposit attribution cannot identify an individual Spot fill.
 const attributed=chainEvent.exchangeAttributionVerified===true&&
  typeof chainEvent.venue==='string'&&chainEvent.venue===trade.venue&&
  ['TO_EXCHANGE','FROM_EXCHANGE'].includes(chainEvent.flow);
 return {state:attributed?'ATTRIBUTED_TRANSFER_NEAR_TRADE':
  'UNVERIFIED_TEMPORAL_COINCIDENCE',
  directAttribution:false,
  asset:trade.symbol,venue:trade.venue,
  lagMs:trade.tradeAt-chainEvent.observedAt,
  note:attributed?'Verified exchange address, not same owner or same order':
   'Coincidence only; exchange wallet path not established'};
}
