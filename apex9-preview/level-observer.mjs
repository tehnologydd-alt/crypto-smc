/**
 * APEX Level Observer — descriptive persistence of individually quoted,
 * sampled PUBLIC order-book price buckets. It cannot identify order owners,
 * actual cancellations, hidden volume, or a trading opportunity.
 */
export const LEVEL_SELECTION='TOP_8_NOTIONAL_PER_SIDE';
const validSymbol=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;
const key=x=>x.side+':'+x.price.toPrecision(13);
const CANDIDATE_RATIO=2;

export function parseLevelObservations(rows,asset){
 if(!validSymbol(asset)||!Array.isArray(rows))return [];
 const valid=[];
 for(const item of rows.slice(0,200)){
  if(item?.asset!==asset||!/^(binance|bybit):spot:depth$/.test(item.source||'')||
   !Number.isSafeInteger(item.observedAt)||!Number.isSafeInteger(item.collectedAt)||
   item.observedAt<=0||item.observedAt>item.collectedAt+60000)continue;
  let p;
  try{p=typeof item.payload==='string'?JSON.parse(item.payload):item.payload;}catch{continue;}
  if(!p||p.sampleScope!=='LIMITED_PUBLIC_SNAPSHOT'||
    p.levelSelection!==LEVEL_SELECTION||!Array.isArray(p.topVisibleLevels)||
    p.topVisibleLevels.length<1||p.topVisibleLevels.length>16||
    !positive(p.bestBid)||!positive(p.bestAsk)||p.bestBid>=p.bestAsk)continue;
  const seen=new Set(),levels=[];
  let ok=true;
  for(const level of p.topVisibleLevels){
   if(!level||!['BID','ASK'].includes(level.side)||
      !positive(level.price)||!positive(level.quantity)||
      !positive(level.notional)||!positive(level.relativeToMedian)||
      level.relativeToMedian>1e9||
      (level.side==='BID'&&level.price>p.bestBid*(1+1e-10))||
      (level.side==='ASK'&&level.price<p.bestAsk*(1-1e-10))||
      Math.abs(level.notional-level.price*level.quantity)>
         Math.max(1e-7,level.notional*1e-8)||
      seen.has(key(level))){
    ok=false;break;
   }
   seen.add(key(level));
   levels.push({side:level.side,price:level.price,quantity:level.quantity,
    notional:level.notional,relativeToMedian:level.relativeToMedian});
  }
  if(!ok)continue;
  const venue=item.source.split(':')[0];
  valid.push({asset,venue,observedAt:item.observedAt,
   collectedAt:item.collectedAt,levels});
 }
 valid.sort((a,b)=>a.observedAt-b.observedAt||a.collectedAt-b.collectedAt);
 const dedup=new Map();
 for(const snap of valid)dedup.set(snap.venue+':'+snap.observedAt,snap);
 return [...dedup.values()].sort((a,b)=>a.observedAt-b.observedAt);
}

export function studyQuotedLevels(rows,{asset,now=Date.now()}={}){
 if(!validSymbol(asset)||!Number.isSafeInteger(now)||now<1)
  return {status:'INVALID',venues:[]};
 const history=parseLevelObservations(rows,asset);
 const venues=[];
 for(const venue of ['binance','bybit']){
  const relevant=history.filter(s=>s.venue===venue&&s.collectedAt<=now+60000);
  if(!relevant.length){
   venues.push({venue,status:'NO_LEVEL_DATA',sampleCount:0,levels:[],lastObservedAt:null});
   continue;
  }
  // Compare only latest SIX hours of actual samples to avoid false persistence.
  const latest=relevant.at(-1);
  const sample= relevant.filter(s=>s.observedAt>=latest.observedAt-6*3600000);
  const currentKeys=new Set(latest.levels.map(key));
  const candidates=new Map();
  for(const snap of sample){
   for(const lvl of snap.levels){
    if(lvl.relativeToMedian<CANDIDATE_RATIO)continue;
    const k=key(lvl);
    const old=candidates.get(k);
    if(!old){
     candidates.set(k,{...lvl,firstSeenAt:snap.observedAt,
      lastSeenAt:snap.observedAt,seenCount:1,latestNotional:lvl.notional,
      latestRatio:lvl.relativeToMedian});
    }else{
     old.lastSeenAt=snap.observedAt;
     old.seenCount++;
     old.latestNotional=lvl.notional;
     old.latestRatio=lvl.relativeToMedian;
    }
   }
  }
  const found=[...candidates.entries()].map(([k,v])=>{
   const inLatest=currentKeys.has(k);
   // Multiple observations mean separate snapshots, NOT continuous order presence.
   const spaced=v.seenCount>=3&&v.lastSeenAt-v.firstSeenAt>=120000;
   return {...v,inLatest,
    state:inLatest?(spaced?'REPEATED':'RECENT'):
     'NOT_IN_LATEST_SAMPLE'};
  });
  const active=found.filter(x=>x.inLatest)
    .sort((a,b)=>b.latestRatio-a.latestRatio||b.lastSeenAt-a.lastSeenAt)
    .slice(0,4);
  const absent=found.filter(x=>!x.inLatest&&
       x.seenCount>=2&&latest.observedAt-x.lastSeenAt>=120000)
    .sort((a,b)=>b.lastSeenAt-a.lastSeenAt).slice(0,2);
  const age=Math.max(0,now-latest.collectedAt);
  venues.push({
   venue,status:age>180000?'HISTORICAL':
    sample.length<3?'LOW_COVERAGE':'OBSERVED',
   sampleCount:sample.length,lastObservedAt:latest.observedAt,
   lastCollectedAt:latest.collectedAt,active,absent,
   levels:[...active,...absent],
   note:'Repeated sampled price buckets are not proof of continuous orders'
  });
 }
 return {status:history.length?'OBSERVED':'EMPTY',asset,venues,
  totalSnapshots:history.length,
  warning:'A level missing from a sampled TOP 8 is not proof of cancellation'};
}
