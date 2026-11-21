/**
 * Measured Binance L2 snapshot (visible REST depth, not executed trades).
 * A fixed first 100 levels per side are aggregated in quote (USDT) notional.
 * A snapshot can be used only AFTER the closed candle AND BEFORE publication.
 * Never pretend a current REST snapshot is a historical one.
 */
export const BOOK_LEVELS=100;
export const BOOK_CLOSE_LAG_MS=120000;
export const BOOK_FRESH_MS=15000;
const validRow=row=>Array.isArray(row)&&row.length>=2&&
  Number.isFinite(Number(row[0]))&&Number(row[0])>0&&
  Number.isFinite(Number(row[1]))&&Number(row[1])>0;

export function parseBookSnapshot(raw,{market,symbol,capturedAt,source='binance_rest_depth'}={}) {
  if (!['spot','futures'].includes(market) || !/^[A-Z0-9]{2,16}USDT$/.test(symbol||'') ||
    !Number.isSafeInteger(capturedAt) || capturedAt<=0 ||
    !Number.isSafeInteger(raw?.lastUpdateId) || raw.lastUpdateId<=0 ||
    !Array.isArray(raw.bids) || !Array.isArray(raw.asks) ||
    raw.bids.length<BOOK_LEVELS || raw.asks.length<BOOK_LEVELS ||
    !raw.bids.slice(0,BOOK_LEVELS).every(validRow) ||
    !raw.asks.slice(0,BOOK_LEVELS).every(validRow))
    return null;
  const bids=raw.bids.slice(0,BOOK_LEVELS),asks=raw.asks.slice(0,BOOK_LEVELS);
  const bestBid=Number(bids[0][0]),bestAsk=Number(asks[0][0]),mid=(bestBid+bestAsk)/2;
  if (!(bestAsk>bestBid) || !(mid>0) ||
    bids.some((row,i)=>i>0&&Number(row[0])>Number(bids[i-1][0])) ||
    asks.some((row,i)=>i>0&&Number(row[0])<Number(asks[i-1][0]))) return null;
  const notional=rows=>rows.reduce((acc,row)=>acc+Number(row[0])*Number(row[1]),0);
  const bidUsdt=notional(bids),askUsdt=notional(asks),total=bidUsdt+askUsdt;
  if (!(bidUsdt>0) || !(askUsdt>0) || !Number.isFinite(total))return null;
  return {source,market,symbol,capturedAt,lastUpdateId:raw.lastUpdateId,
    levels:BOOK_LEVELS,bestBid,bestAsk,spreadPct:(bestAsk-bestBid)/mid*100,
    bidUsdt,askUsdt,imbalance:bidUsdt/total,
    bidRangePct:(bestBid-Number(bids.at(-1)[0]))/mid*100,
    askRangePct:(Number(asks.at(-1)[0])-bestAsk)/mid*100};
}

/** An auditable directional bid/ask volume hypothesis, NOT guaranteed future liquidity. */
export function depthGate(snapshot,{market,symbol,side,closedAt,observedAt,
  minSideShare=.55,maxCloseLagMs=BOOK_CLOSE_LAG_MS,maxAgeMs=BOOK_FRESH_MS}={}) {
  if (!snapshot || snapshot.source!=='binance_rest_depth' || snapshot.market!==market ||
      snapshot.symbol!==symbol || snapshot.levels!==BOOK_LEVELS ||
      !Number.isSafeInteger(snapshot.capturedAt) || !Number.isSafeInteger(closedAt) ||
      !Number.isSafeInteger(observedAt) || observedAt<closedAt ||
      snapshot.capturedAt<closedAt || snapshot.capturedAt>observedAt ||
      snapshot.capturedAt-closedAt>maxCloseLagMs || observedAt-snapshot.capturedAt>maxAgeMs)
    return {allowed:false,reason:'NO_FRESH_BOOK_SNAPSHOT'};
  if (!(snapshot.bidUsdt>0) || !(snapshot.askUsdt>0) ||
    !Number.isFinite(snapshot.imbalance) || snapshot.imbalance<0 || snapshot.imbalance>1 ||
    !Number.isFinite(snapshot.spreadPct) || snapshot.spreadPct<0 || snapshot.spreadPct>0.2)
    return {allowed:false,reason:'INVALID_BOOK_DEPTH'};
  const share=side==='LONG'?snapshot.imbalance:side==='SHORT'?1-snapshot.imbalance:null;
  if(share===null)return {allowed:false,reason:'UNKNOWN_SIDE'};
  return {allowed:share>=minSideShare,reason:share>=minSideShare?'BOOK_SIDE_CONFIRMED':'BOOK_IMBALANCE_WEAK',
    sideShare:share,bidUsdt:snapshot.bidUsdt,askUsdt:snapshot.askUsdt,
    capturedAt:snapshot.capturedAt,lastUpdateId:snapshot.lastUpdateId,
    spreadPct:snapshot.spreadPct,levels:snapshot.levels};
}
