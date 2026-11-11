/**
 * APEX Liquidity Core — observed PUBLIC spot orderbook history only.
 * This is not hidden liquidity, liquidations or a predictive orderflow signal.
 * Different venue depth limits are NEVER pooled or compared as equal coverage.
 */
const VENUES=new Set(['binance','bybit','okx']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const positive=n=>finite(n)&&n>0;
const SYMBOL=/^[A-Z0-9]{5,20}$/;
export const LIQUIDITY_SCOPE='LIMITED_PUBLIC_SNAPSHOT';

export function normalizeLiquidityHistory(rows,asset){
 if(!SYMBOL.test(asset)||!Array.isArray(rows))return [];
 const cleaned=[];
 for(const row of rows.slice(0,400)){
  if(!row||row.asset!==asset||!Number.isSafeInteger(row.observedAt)||
     !Number.isSafeInteger(row.collectedAt)||row.observedAt<1||
     row.observedAt>row.collectedAt+60000)continue;
  const match=/^(binance|bybit|okx):spot:depth$/.exec(row.source||'');
  if(!match)continue;
  let payload;
  try{payload=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;}catch{continue;}
  if(!payload||payload.sampleScope!==LIQUIDITY_SCOPE||
     !positive(payload.bestBid)||!positive(payload.bestAsk)||
     payload.bestBid>=payload.bestAsk||
     !finite(payload.spreadBps)||payload.spreadBps<=0||payload.spreadBps>2000||
     !finite(payload.visibleDepthImbalance)||
     Math.abs(payload.visibleDepthImbalance)>1)continue;
  const venue=match[1];
  const mid=(payload.bestBid+payload.bestAsk)/2;
  const measuredSpread=(payload.bestAsk-payload.bestBid)/mid*10000;
  if(Math.abs(measuredSpread-payload.spreadBps)>Math.max(.01,.03*measuredSpread))continue;
  const bid=payload.bidNotional,ask=payload.askNotional;
  const hasNotional=positive(bid)&&positive(ask);
  if(hasNotional){
   const imbalance=(bid-ask)/(bid+ask);
   if(!finite(imbalance)||Math.abs(imbalance-payload.visibleDepthImbalance)>.012)
    continue;
  }
  cleaned.push({
   asset,venue,observedAt:row.observedAt,collectedAt:row.collectedAt,
   bestBid:payload.bestBid,bestAsk:payload.bestAsk,mid,spreadBps:payload.spreadBps,
   imbalance:payload.visibleDepthImbalance,
   bidNotional:hasNotional?bid:null,askNotional:hasNotional?ask:null,
   bidLevels:Number.isSafeInteger(payload.bidLevels)?payload.bidLevels:null,
   askLevels:Number.isSafeInteger(payload.askLevels)?payload.askLevels:null,
   collectionMethod:payload.collectionMethod==='PUBLIC_WS_BOOK_SNAPSHOT'?
    'WS':payload.collectionMethod==='PUBLIC_REST_BOOK_SNAPSHOT'?
     'REST':'LEGACY',
   snapshotLevelsMax:Number.isSafeInteger(payload.snapshotLevelsMax)&&
    payload.snapshotLevelsMax>=1&&payload.snapshotLevelsMax<=100?
     payload.snapshotLevelsMax:null
  });
 }
 cleaned.sort((a,b)=>a.observedAt-b.observedAt||a.collectedAt-b.collectedAt);
 const unique=new Map();
 for(const r of cleaned)unique.set(r.venue+':'+r.observedAt,r);
 return [...unique.values()].sort((a,b)=>a.observedAt-b.observedAt);
}

export function studyVisibleLiquidity(rows,{now=Date.now(),asset}={}){
 if(!SYMBOL.test(asset)||!Number.isSafeInteger(now)||now<=0)
  return {status:'INVALID',venues:[],points:[],message:'Invalid scope'};
 const data=normalizeLiquidityHistory(rows,asset);
 const venues=[];
 for(const venue of ['binance','bybit','okx']){
  const points=data.filter(x=>x.venue===venue&&x.observedAt<=now+60000);
  if(!points.length){
   venues.push({venue,status:'NO_SAMPLES',samples:0});
   continue;
  }
  const last=points.at(-1);
  const age=now-last.collectedAt;
  // Old 1h+ outages remain visible as disjoint historical series, but must
  // not permanently poison a new continuous streak of recent observations.
  const gaps=points.slice(1).map((x,i)=>x.observedAt-points[i].observedAt);
  const longestGap=gaps.length?Math.max(...gaps):0;
  let firstInStreak=0;
  for(let i=1;i<points.length;i++)
   if(points[i].observedAt-points[i-1].observedAt>3600000||
    points[i].collectionMethod!==points[i-1].collectionMethod||
    points[i].snapshotLevelsMax!==points[i-1].snapshotLevelsMax)
    firstInStreak=i;
  const streak=points.slice(firstInStreak);
  const first=streak[0];
  const span=last.observedAt-first.observedAt;
  const continuity=streak.length>=3&&span>=120000;
  const recent=age>=0&&age<=180000;
  const status=!recent?'HISTORICAL':!continuity?'LOW_COVERAGE':'OBSERVED';
  const wallBid=last.bidNotional,wallAsk=last.askNotional;
  const quantityScope=last.bidLevels===null?'Неизвестное число уровней':last.bidLevels+
   ' bid / '+last.askLevels+' ask уровней';
  venues.push({
   venue,status,samples:points.length,continuousSamples:streak.length,
   lastObservedAt:last.observedAt,lastCollectedAt:last.collectedAt,
   spanMs:span,longestGapMs:longestGap,
   spreadBps:last.spreadBps,
   spreadChangeBps:continuity?last.spreadBps-first.spreadBps:null,
   imbalance:last.imbalance,
   imbalanceChange:continuity?last.imbalance-first.imbalance:null,
   bidNotional:wallBid,askNotional:wallAsk,
   quantityScope,
   collectionMethod:last.collectionMethod,
   snapshotLevelsMax:last.snapshotLevelsMax
  });
 }
 const counted=venues.filter(x=>x.samples>0);
 return {status:counted.length?'OBSERVED':'EMPTY',asset,
  samples:data.length,venues,points:data,
  note:'Visible depth samples only. Historic observations are not current liquidity.'};
}
