/**
 * APEX Whale Intelligence / Stage 3: strictly retrospective chart overlays.
 * An order block here is a STRUCTURAL CANDLE ZONE (not a real resting order).
 * No demand/supply probabilities, no future price projections, no order actions.
 */
import {analyzeStructure,CANDLE_INTERVALS} from './candles.mjs';
import {chainForWhaleAsset,validateWhaleEvent} from './whale-observer.mjs';

export const ORDER_BLOCK_VERSION='APEX_STRUCTURE_ORDER_BLOCK_STAGE3_V1';
export const ORDER_BLOCK_RULES=Object.freeze({
 swingLeft:2,swingRight:2,originLookback:12,maxZones:12,maxDrawnZones:3,
 maxMarks:16
});
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const time=x=>Number.isSafeInteger(x)&&x>0;
function validBars(candles,interval){
 const step=CANDLE_INTERVALS[interval];
 if(!step||!Array.isArray(candles)||candles.length>1000)return null;
 const bars=[];let prev=-1;
 for(const b of candles){
  if(b?.closed===false)continue;
  if(b?.closed!==true||!time(b.t)||b.t%step!==0||
   b.closeAt!==b.t+step-1||b.t<=prev||
   !positive(b.open)||!positive(b.high)||!positive(b.low)||
   !positive(b.close)||!Number.isFinite(b.volume)||b.volume<0||
   b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
   b.high<b.low)return null;
  prev=b.t;bars.push(b);
 }
 return bars;
}
const opposite=(bar,direction)=>direction==='UP'?
 bar.close<bar.open:bar.close>bar.open;
/**
 * Find the last opposing closed source candle within 12 bars before a
 * confirmed historical break. There must be NO missing source bars between.
 * Exposed only after BOS/CHoCH itself is confirmed by closed source bars.
 */
export function analyzeStructuralOrderBlocks(candles,{
 interval='1h'
}={}){
 const bars=validBars(candles,interval);
 if(!bars)return {state:'INVALID',zones:[],interval};
 if(bars.length<10)return {state:'COLLECTING',zones:[],interval};
 const structure=analyzeStructure(bars,{left:2,right:2});
 if(structure.status!=='OK')return {state:'COLLECTING',zones:[],interval};
 const step=CANDLE_INTERVALS[interval],byClose=new Map(bars.map((b,i)=>[b.closeAt,i]));
 const zones=[];
 const events=structure.events.filter(e=>['BOS','CHoCH'].includes(e.type));
 for(const e of events){
  // Structure event.confirmedAt is the *pivot confirmation* time.
  // A block is only knowable on the BREAK candle itself (event.time).
  // Using pivot time here creates look-ahead zones on a live chart.
  const breakIndex=byClose.get(e.time);
  if(breakIndex===undefined)continue;
  let found=null;
  for(let i=breakIndex-1;i>=Math.max(0,breakIndex-ORDER_BLOCK_RULES.originLookback);i--){
   if(bars[i+1].t-bars[i].t!==step)break;
   if(opposite(bars[i],e.direction)){found=i;break;}
  }
  if(found===null)continue;
  const origin=bars[found],kind=e.direction==='UP'?'DEMAND':'SUPPLY';
  const low=kind==='DEMAND'?origin.low:Math.min(origin.open,origin.close);
  const high=kind==='DEMAND'?Math.max(origin.open,origin.close):origin.high;
  if(!positive(low)||!positive(high)||high<=low)continue;
  // A historical close through the zone invalidates its future activity
  // label, but the original break/zone remains an immutable observation.
  let invalidatedAt=null;
  for(let k=breakIndex+1;k<bars.length;k++){
   if(bars[k].t-bars[k-1].t!==step)break;
   if(kind==='DEMAND'?bars[k].close<low:bars[k].close>high){
    invalidatedAt=bars[k].closeAt;break;
   }
  }
  zones.push({version:ORDER_BLOCK_VERSION,id:kind+':'+origin.t+':'+e.time,
   kind,low,high,originCloseAt:origin.closeAt,
   confirmedAt:e.time,
   breakType:e.type,invalidatedAt,interval,source:'BINANCE_SPOT_CLOSED_OHLC',
   inferredOrders:false,whaleAttributed:false,predictive:false});
 }
 const unique=new Map();
 for(const z of zones)unique.set(z.id,z);
 return {state:'DESCRIPTIVE',interval,
  zones:[...unique.values()].sort((a,b)=>b.confirmedAt-a.confirmedAt)
   .slice(0,ORDER_BLOCK_RULES.maxZones),
  source:'BINANCE_SPOT_CLOSED_OHLC',noFutureZones:true};
}
/**
 * Only draw over ACTUAL closed bars AFTER confirmation.
 * A gap in source bars breaks the drawn region; no invented extension.
 */
export function mapOrderBlocksToViewport(zones,bars,{
 interval='1h',limit=ORDER_BLOCK_RULES.maxDrawnZones
}={}){
 const step=CANDLE_INTERVALS[interval];
 if(!step||!Array.isArray(zones)||!Array.isArray(bars)||
  !Number.isSafeInteger(limit)||limit<1||limit>6)return [];
 const result=[];
 for(const zone of zones){
  if(zone?.version!==ORDER_BLOCK_VERSION||zone.interval!==interval||
   !positive(zone.low)||!positive(zone.high)||zone.low>=zone.high||
   !time(zone.confirmedAt)||!time(zone.originCloseAt)||zone.originCloseAt>=zone.confirmedAt)
   continue;
  const segments=[];let active=null;
  const stop=zone.invalidatedAt??Infinity;
  for(let i=0;i<bars.length;i++){
   const b=bars[i];
   const ok=b?.closed===true&&time(b.closeAt)&&
    b.closeAt>=zone.confirmedAt&&b.closeAt<=stop;
   if(!ok){if(active){segments.push(active);active=null;}continue;}
   if(active&&b.closeAt-bars[i-1].closeAt===step)active.to=i;
   else {if(active)segments.push(active);active={from:i,to:i};}
  }
  if(active)segments.push(active);
  if(segments.length)result.push({...zone,segments});
  if(result.length>=limit)break;
 }
 return result;
}
/** A whale marker is anchored to the LAST completed candle AVAILABLE when
 * phone first observed a transaction, not a later candle finishing afterward.
 * Multiple BTC outputs from a single TX generate just one mark.
 */
export function mapWhaleEventsToViewport(events,bars,{
 asset,interval='1h',now=Date.now(),
 limit=ORDER_BLOCK_RULES.maxMarks
}={}){
 const step=CANDLE_INTERVALS[interval];
 if(!chainForWhaleAsset(asset)||!step||!Array.isArray(events)||
  !Array.isArray(bars)||!time(now)||
  !Number.isSafeInteger(limit)||limit<1||limit>32)return [];
 const valid=events.filter(e=>validateWhaleEvent(e,asset,now))
  .sort((a,b)=>a.collectedAt-b.collectedAt||a.txid.localeCompare(b.txid));
 const dedup=new Set(),marks=[];
 for(const e of valid){
  if(dedup.has(e.txid))continue;
  dedup.add(e.txid);
  let idx=-1;
  for(let i=bars.length-1;i>=0;i--){
   const b=bars[i];
   if(b?.closed===true&&time(b.closeAt)&&b.closeAt<=e.collectedAt){
    idx=i;break;
   }
  }
  if(idx<0||e.collectedAt-bars[idx].closeAt>step||
   e.collectedAt<bars[idx].closeAt)continue;
  marks.push({index:idx,txid:e.txid,firstSeenAt:e.collectedAt,
   source:e.source,network:e.network,confirmed:e.confirmation==='VALIDATED_AT_FETCH',
   label:'Крупный перевод · историческая точка наблюдения',
   inferredOwner:false,inferredOrder:false});
 }
 return marks.slice(-limit);
}
