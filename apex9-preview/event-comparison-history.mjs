/**
 * APEX 9.1: immutable first-observed snapshots for descriptive M5 comparisons.
 * Stored on this device only, never a backfilled official release archive.
 */
import {COMPARE_VERSION} from './macro-event-comparison.mjs';
const KEY='apex9:bls-m5-comparison-history:v1';
const LIMIT=80,AGE=90*86400000,FOUR=4*3600000;
const SYMBOLS=new Set(['BTCUSDT','ETHUSDT']);
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10000;
function valid(entry,now){
 return entry?.version===COMPARE_VERSION&&SYMBOLS.has(entry.symbol)&&
 Number.isSafeInteger(entry.eventAt)&&entry.eventAt>0&&
 Number.isSafeInteger(entry.savedAt)&&entry.savedAt>entry.eventAt+FOUR&&
 entry.savedAt<=now+60000&&entry.eventAt>now-AGE&&
 typeof entry.title==='string'&&entry.title.length>4&&entry.title.length<=200&&
 Array.isArray(entry.comparison)&&entry.comparison.length===3&&
 entry.comparison.every((item,i)=>item?.minutes===[15,60,240][i]&&
 [item.eventReturnPercent,item.eventAbsolutePercent,
  item.previousDayReturnPercent,item.twoDaysBeforeReturnPercent,
  item.priorMeanAbsolutePercent,item.differenceAbsolutePp].every(finite))&&
 entry.releaseVerified===false&&entry.causalImpact==='NOT_ESTABLISHED';
}
export function createBlsComparisonHistory({storage,now=()=>Date.now()}={}){
 function read(){
  if(!storage?.getItem||!storage?.setItem)throw Error('No persistent storage');
  const raw=storage.getItem(KEY);
  if(raw===null)return [];
  const parsed=JSON.parse(raw);
  if(!parsed||parsed.version!==1||!Array.isArray(parsed.entries)||
   parsed.entries.length>LIMIT||!parsed.entries.every(x=>valid(x,now())))
   throw Error('Invalid comparison archive');
  return parsed.entries;
 }
 function save(report){
  let rows;try{rows=read();}
  catch(e){return {state:'STORAGE_UNAVAILABLE',reason:String(e.message||e)};}
  const at=now();
  const entry={version:report?.version,symbol:report?.symbol,
   eventAt:report?.eventAt,title:String(report?.eventName||'').slice(0,200),
   savedAt:at,comparison:report?.comparison?.map(x=>({
    minutes:x.minutes,eventReturnPercent:x.eventReturnPercent,
    eventAbsolutePercent:x.eventAbsolutePercent,
    previousDayReturnPercent:x.previousDayReturnPercent,
    twoDaysBeforeReturnPercent:x.twoDaysBeforeReturnPercent,
    priorMeanAbsolutePercent:x.priorMeanAbsolutePercent,
    differenceAbsolutePp:x.differenceAbsolutePp})),
   releaseVerified:report?.releaseVerified,
   causalImpact:report?.causalImpact};
  if(report?.state!=='OBSERVED'||report?.source!=='Binance Spot public M5'||
   report?.completeM5Candles!==625||!valid(entry,at))
   return {state:'INVALID',reason:'Only verified complete Binance M5 comparison'};
  const id=entry.symbol+':'+entry.eventAt;
  if(rows.some(x=>x.symbol+':'+x.eventAt===id))
   return {state:'OK',saved:false,total:rows.length};
  rows=[entry,...rows].sort((a,b)=>b.eventAt-a.eventAt||
   a.symbol.localeCompare(b.symbol)).slice(0,LIMIT);
  try{storage.setItem(KEY,JSON.stringify({version:1,entries:rows}));}
  catch(e){return {state:'STORAGE_UNAVAILABLE',reason:String(e.message||e)};}
  return {state:'OK',saved:true,total:rows.length};
 }
 function list({symbol=null,limit=16}={}){
  if(symbol!==null&&!SYMBOLS.has(symbol))return {state:'INVALID',entries:[]};
  let rows;try{rows=read();}
  catch(e){return {state:'STORAGE_UNAVAILABLE',entries:[],
   reason:String(e.message||e)};}
  const filtered=rows.filter(x=>symbol===null||symbol===x.symbol);
  return {state:'OK',total:filtered.length,entries:filtered.slice(0,
   Math.max(1,Math.min(80,limit))),btc:rows.filter(x=>x.symbol==='BTCUSDT').length,
   eth:rows.filter(x=>x.symbol==='ETHUSDT').length};
 }
 return {save,list};
}
