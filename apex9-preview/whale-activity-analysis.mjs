/**
 * APEX Whale Intelligence / Stage 2
 *
 * Source-observed activity and strict forward-only price chronology.
 * PRICE CLOCK starts when the phone first learned the event (collectedAt),
 * NOT the historical blockchain block time (observedAt). ETH transactions
 * discovered from one stale REST page therefore do not get free hindsight.
 * BTC outputs from the same transaction count as ONE event (no double count).
 *
 * This is deliberately not a whale-identity classifier, flow detector,
 * market coverage estimator, automatic predictor, or signal generator.
 */
import {chainForWhaleAsset,validateWhaleEvent}
 from './whale-observer.mjs';

export const WHALE_ANALYSIS_VERSION='APEX_WHALE_ANALYSIS_STAGE2_V1';
export const WHALE_STUDY_POLICY=Object.freeze({
 interval:'1h',horizonHours:4,minimumIndependent:8,
 minimumPerHalf:4,historyLimitDays:14,maxEvents:100,maxCandles:600
});
const HOUR=3600000;
const DAY=86400000;
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const round=(v,d=3)=>Number(v.toFixed(d));
const emptyPrice=(state,extras={})=>({
 state,interval:'H1',horizonHours:4,
 eligibleIndependent:0,requiredIndependent:WHALE_STUDY_POLICY.minimumIndependent,
 excludedMissingPrice:0,excludedPendingFuture:0,
 excludedOverlapping:0,cohortA:null,cohortB:null,
 descriptiveOnly:true,causal:false,significant:false,
 predictive:false,trained:false,changedForecasts:false,...extras
});
const median=x=>{
 if(!x.length)return null;
 const values=[...x].sort((a,b)=>a-b),n=values.length;
 return n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2;
};
const sortedTx=(a,b)=>a.collectedAt-b.collectedAt||
 a.txid.localeCompare(b.txid)||
 (a.outputIndex??-1)-(b.outputIndex??-1);
const asPercent=(a,b)=>100*(b/a-1);
const publicEvent=e=>({
 txid:e.txid,collectedAt:e.collectedAt,observedAt:e.observedAt,
 source:e.source,network:e.network,
 amountAtomic:e.amountAtomic,eventType:e.eventType,
 to:e.to,from:e.from,outputIndex:e.outputIndex
});

/** Convert one BTC multi-output transaction to one *observed tx*.
 * Never sum output values: multiple outputs can represent change. */
export function distinctObservedTransactions(events,asset,{now=Date.now()}={}){
 if(!chainForWhaleAsset(asset)||!Array.isArray(events)||
  events.length>WHALE_STUDY_POLICY.maxEvents||!validTime(now))return [];
 const checked=events.filter(e=>validateWhaleEvent(e,asset,now))
  .slice().sort(sortedTx);
 const byHash=new Map();
 for(const e of checked){
  const old=byHash.get(e.txid);
  // Prefer first encounter, not highest volume/price reaction.
  if(!old||e.collectedAt<old.collectedAt||
   e.collectedAt===old.collectedAt&&BigInt(e.amountAtomic)>BigInt(old.amountAtomic))
   byHash.set(e.txid,publicEvent(e));
 }
 return [...byHash.values()].sort(sortedTx);
}
const H1_END_OFFSET=HOUR-1;
/** Strict H1 source verification; no gap filling or mixing unfinished bars. */
function validatedH1(candles,now){
 if(!Array.isArray(candles)||!validTime(now)||
  candles.length>WHALE_STUDY_POLICY.maxCandles)
  return {ok:false,bars:new Map()};
 const map=new Map();
 for(const b of candles){
  // The last current open bar may be in a downloaded batch; ignore only it.
  if(b?.closed===false)continue;
  if(!validTime(b?.t)||b.t%HOUR!==0||
   b.closeAt!==b.t+H1_END_OFFSET||
   b.closed!==true||b.closeAt>=now||
   !price(b.open)||!price(b.high)||!price(b.low)||!price(b.close)||
   !Number.isFinite(b.volume)||b.volume<0||
   b.high<Math.max(b.open,b.close,b.low)||
   b.low>Math.min(b.open,b.close,b.high)||
   map.has(b.closeAt))return {ok:false,bars:new Map()};
  map.set(b.closeAt,b);
 }
 return {ok:true,bars:map};
}
const requiredAt=(anchor,h)=>anchor+h*HOUR;
/** Four hourly bars before AND after collection-time anchor must be present. */
function pairEvent(e,bars,now){
 const anchor=Math.floor((e.collectedAt+1)/HOUR)*HOUR-1;
 const first=bars.get(anchor);
 if(!first)return {state:'MISSING'};
 if(anchor+4*HOUR>=now)return {state:'PENDING'};
 const closes=[];
 for(let i=-4;i<=4;i++){
  const bar=bars.get(requiredAt(anchor,i));
  if(!bar)return {state:'MISSING'};
  closes.push(bar.close);
 }
 const before=closes[0],at=closes[4],after1=closes[5],
  after4=closes[8];
 return {state:'READY',txid:e.txid,eventSeenAt:e.collectedAt,
  anchorCloseAt:anchor,
  before4hPct:asPercent(before,at),
  after1hPct:asPercent(at,after1),
  after4hPct:asPercent(at,after4)};
}
function fixedHalf(pairs){
 const after4=pairs.map(x=>x.after4hPct);
 const prior4=pairs.map(x=>x.before4hPct);
 return {
  count:pairs.length,
  medianAfter1hPct:round(median(pairs.map(x=>x.after1hPct))),
  medianAfter4hPct:round(median(after4)),
  medianAbsoluteAfter4hPct:round(median(after4.map(Math.abs))),
  medianAbsoluteBefore4hPct:round(median(prior4.map(Math.abs))),
  positiveAfter4h:pairs.filter(x=>x.after4hPct>0).length,
  negativeAfter4h:pairs.filter(x=>x.after4hPct<0).length,
  firstCollectionAt:pairs[0].eventSeenAt,
  lastCollectionAt:pairs.at(-1).eventSeenAt
 };
}
/**
 * Fixed chronological halves, no optimized thresholds. Not a "control"
 * where missing whale snapshots would be incorrectly treated as no events.
 * 4-hour forward windows never overlap.
 */
export function studyWhalePriceHistory(transactions,candles,{
 now=Date.now()
}={}){
 if(!Array.isArray(transactions)||transactions.length>100)
  return emptyPrice('INVALID');
 const verified=validatedH1(candles,now);
 if(!verified.ok)return emptyPrice('INVALID_CANDLES');
 if(!verified.bars.size)return emptyPrice('NO_CANDLES');
 const pairs=[];
 let excludedMissingPrice=0,excludedPendingFuture=0,
  excludedOverlapping=0;
 let lastAnchor=0;
 for(const e of transactions.slice().sort(sortedTx)){
  const paired=pairEvent(e,verified.bars,now);
  if(paired.state==='MISSING'){excludedMissingPrice++;continue;}
  if(paired.state==='PENDING'){excludedPendingFuture++;continue;}
  if(lastAnchor&&paired.anchorCloseAt<lastAnchor+4*HOUR){
   excludedOverlapping++;continue;
  }
  pairs.push(paired);
  lastAnchor=paired.anchorCloseAt;
 }
 const counters={eligibleIndependent:pairs.length,excludedMissingPrice,
  excludedPendingFuture,excludedOverlapping};
 if(pairs.length<WHALE_STUDY_POLICY.minimumIndependent)
  return emptyPrice('COLLECTING',counters);
 const half=Math.floor(pairs.length/2);
 if(half<WHALE_STUDY_POLICY.minimumPerHalf||
  pairs.length-half<WHALE_STUDY_POLICY.minimumPerHalf)
  return emptyPrice('COLLECTING',counters);
 return emptyPrice('DESCRIPTIVE',{
  ...counters,cohortA:fixedHalf(pairs.slice(0,half)),
  cohortB:fixedHalf(pairs.slice(half)),
  note:'Chronological descriptive cohorts; no p-value or market-wide control. '+
   'Future returns start at last closed H1 when observed on device, '+
   'not at earlier blockchain event time. Missing observations are unknown.'
 });
}
function repeats(transactions,chain){
 const m=new Map();
 for(const event of transactions){
  const pairs=chain==='ethereum'?
   [['SENDER',event.from],['RECEIVER',event.to]]:
   [['OUTPUT',event.to]];
  for(const [role,address] of pairs){
   if(!address)continue;
   const key=role+':'+address.toLowerCase();
   const old=m.get(key)||{role,address,transactions:0};
   old.transactions++;
   m.set(key,old);
  }
 }
 return [...m.values()].filter(x=>x.transactions>=2)
  .sort((a,b)=>b.transactions-a.transactions||
   a.address.localeCompare(b.address)).slice(0,5);
}
/** Descriptive observation coverage only. Never labels "no event" hours. */
export function analyzeWhaleActivity(events,candles,{
 asset,now=Date.now()
}={}){
 const chain=chainForWhaleAsset(asset);
 if(!chain||!validTime(now))return {
  version:WHALE_ANALYSIS_VERSION,state:'UNSUPPORTED',asset,
  activity:null,price:emptyPrice('UNSUPPORTED')
 };
 const transactions=distinctObservedTransactions(events,asset,{now});
 const seen=transactions.filter(e=>e.collectedAt<=now);
 // Snapshots are not continuous: a concentration at one fetch is NOT a
 // chain-wide burst or accumulation/withdrawal.
 const batches=new Map();
 for(const tx of seen)
  batches.set(tx.collectedAt,(batches.get(tx.collectedAt)||0)+1);
 const activity={
  network:chain,transactions:seen.length,
  observedBatches:batches.size,
  maxTransactionsOneBatch:Math.max(0,...batches.values()),
  recent24h:seen.filter(e=>now-e.collectedAt<=DAY).length,
  uniqueTransactionsWithAddresses:seen.filter(e=>Boolean(e.to)).length,
  repeatAddresses:repeats(seen,chain),
  firstSeenAt:seen.length?seen[0].collectedAt:null,
  lastSeenAt:seen.length?seen.at(-1).collectedAt:null,
  sourceScope:chain==='bitcoin'?'RECENT_MEMPOOL_OUTPUTS':
   'ONE_PAGE_VALIDATED_ETH',
  eventTimeReliability:chain==='bitcoin'?'CLIENT_SEEN':
   'BLOCK_TIMESTAMP_BUT_FIRST_SEEN_AT_COLLECTION',
  completeness:'PARTIAL_SAMPLED_ONLY',
  accumulation:null,exchangeFlow:null,ownerIdentity:null,
  note:'Repeated addresses are not known wallet owners. Capture gaps, '+
   'change outputs and a single API page prevent population-wide rates.'
 };
 const price=studyWhalePriceHistory(seen,candles,{now});
 return {version:WHALE_ANALYSIS_VERSION,
  state:seen.length?'OBSERVED':'COLLECTING',
  asset,activity,price,trained:false,changedForecasts:false,
  predictive:false,causal:false,significant:false};
}
