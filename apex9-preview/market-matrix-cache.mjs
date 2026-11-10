/** Persist verified market-frame summaries for the Asset/Structure card.
 * No cache entry is silently promoted to a fresh observation.
 */
import {MARKET_FRAMES} from './market-core.mjs';
import {radarExpectedClose} from './radar-auto-policy.mjs';
import {validateRadarObservation} from './radar-changes.mjs';
const KEY='apex9:market-matrix-cache:v1';
const validSymbol=s=>typeof s==='string'&&/^[A-Z0-9]{2,16}USDT$/.test(s);
const validDir=s=>['UP','DOWN','FLAT'].includes(s);
const validMode=s=>['DIRECTIONAL','RANGE','MIXED'].includes(s);
export function matrixFromNativeRadar(native,asset,{now=Date.now()}={}){
 const frames={};
 if(!validSymbol(asset)||!native?.native||!Array.isArray(native.records))return frames;
 for(const interval of MARKET_FRAMES){
  const item=native.records.filter(row=>
   row?.latest?.symbol===asset&&row.latest.interval===interval&&
   validateRadarObservation(row.latest))
   .map(row=>row.latest).sort((a,b)=>b.candleAt-a.candleAt)[0];
  if(!item)continue;
  const expected=radarExpectedClose(interval,now);
  frames[interval]={asset,interval,state:item.candleAt===expected?'OK':'CACHE',
   summary:{status:item.candleAt===expected?'OK':'STALE',
    source:'ANDROID_NATIVE_RADAR',interval,direction:item.direction,mode:item.mode,
    lastClosedAt:item.candleAt,volumeRatio:item.volumeRatio,
    velocityPctPerBar:item.movement,accelerationPctPerBar2:item.acceleration}};
 }
 return frames;
}
export function createMarketMatrixCache({storage,now=()=>Date.now()}={}){
 let memory={};
 function readRaw(){
  try{
   const str=storage?.getItem?.(KEY);
   const v=str&&str.length<32000?JSON.parse(str):null;
   return v&&typeof v==='object'&&!Array.isArray(v)?{...v,...memory}:memory;
  }catch{return memory;}
 }
 function normalizeFrame(data,asset,interval,at){
  if(data?.asset!==asset||data.interval!==interval||
   !['OK','CACHE'].includes(data.state))return null;
  const s=data.summary;
  if(!s||!validDir(s.direction)||!validMode(s.mode)||
   !Number.isSafeInteger(s.lastClosedAt)||s.lastClosedAt<=0||
   s.lastClosedAt>at+60000)return null;
  return {asset,interval,state:'CACHE',summary:{
   status:'STALE',direction:s.direction,mode:s.mode,
   lastClosedAt:s.lastClosedAt,source:String(s.source||'saved').slice(0,50)}};
 }
 function read(asset){
  if(!validSymbol(asset))return null;
  const entry=readRaw()[asset],at=now();
  if(!Number.isSafeInteger(entry?.at)||entry.at>at+60000||
   at-entry.at>7*86400000)return null;
  const frames={};
  for(const interval of MARKET_FRAMES){
   const row=normalizeFrame(entry.frames?.[interval],asset,interval,at);
   if(row)frames[interval]=row;
  }
  return Object.keys(frames).length?{at:entry.at,frames}:null;
 }
 function save(asset,frames){
  if(!validSymbol(asset)||!frames||typeof frames!=='object')return false;
  const at=now(),kept={};
  for(const interval of MARKET_FRAMES){
   const row=normalizeFrame(frames[interval],asset,interval,at);
   if(row)kept[interval]=row;
  }
  if(!Object.keys(kept).length)return false;
  const stored=readRaw();stored[asset]={at,frames:kept};
  const recent=Object.entries(stored).filter(([,v])=>v&&
   Number.isSafeInteger(v.at)&&at-v.at<=7*86400000)
   .sort((a,b)=>b[1].at-a[1].at).slice(0,10);
  memory=Object.fromEntries(recent);
  try{storage?.setItem?.(KEY,JSON.stringify(memory))}catch{}
  return true;
 }
 return {read,save};
}
