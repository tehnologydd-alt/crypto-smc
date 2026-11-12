/**
 * Source-scoped temporal coincidence study, not attribution or causality.
 * A cluster says several venues traded in a time window, NOT that the same
 * account moved money among those venues or that a price direction follows.
 */
export function findCrossVenueWindows(trades,{windowMs=60000}={}){
 if(!Array.isArray(trades)||!Number.isSafeInteger(windowMs)||
  windowMs<1000||windowMs>300000)return [];
 const valid=trades.filter(x=>Number.isSafeInteger(x?.tradeAt)&&
  ['binance','bybit','okx','kraken','bingx','coinbase'].includes(x.venue)&&
  ['BUY_TAKER','SELL_TAKER'].includes(x.takerSide)).sort((a,b)=>a.tradeAt-b.tradeAt);
 const out=[];let lastWindowEnd=0;
 for(let i=0;i<valid.length;i++){
  const first=valid[i];
  if(first.tradeAt<=lastWindowEnd)continue;
  const group=valid.slice(i).filter(x=>x.tradeAt>=first.tradeAt&&
   x.tradeAt-first.tradeAt<=windowMs);
  const venues=[...new Set(group.map(x=>x.venue))];
  if(venues.length<2)continue;
  const buys=group.filter(x=>x.takerSide==='BUY_TAKER');
  const sells=group.filter(x=>x.takerSide==='SELL_TAKER');
  // Do not add USD and USDT notional into one mislabeled total.
  const quotes=[...new Set(group.map(x=>x.quoteCurrency))];
  out.push({from:first.tradeAt,to:group.at(-1).tradeAt,
   venues,events:group.length,buyEvents:buys.length,
   sellEvents:sells.length,quotes,
   finding:'TEMPORAL_COINCIDENCE_ONLY',
   sameTrader:null,transferRoute:null,causalEvidence:false});
  lastWindowEnd=group.at(-1).tradeAt;
 }
 return out.slice(-5).reverse();
}
/** Compare time alone with verified public chain observations, never TX identity. */
export function findNearbyChainObservations(trades,chainEvents,{
 windowMs=300000
}={}){
 if(!Array.isArray(trades)||!Array.isArray(chainEvents))return [];
 const rows=[];
 for(const e of chainEvents){
  if(!Number.isSafeInteger(e?.observedAt)||
   !['mempool:bitcoin:tx','blockscout:ethereum:transactions'].includes(e.source))
   continue;
  const near=trades.filter(t=>Number.isSafeInteger(t?.tradeAt)&&
   Math.abs(t.tradeAt-e.observedAt)<=windowMs);
  if(!near.length)continue;
  rows.push({observedAt:e.observedAt,source:e.source,
   venues:[...new Set(near.map(x=>x.venue))],nearbyExecutions:near.length,
   finding:'TIME_PROXIMITY_ONLY',walletToExchangeIdentified:false,
   economicIntent:null});
 }
 return rows.slice(0,5);
}
