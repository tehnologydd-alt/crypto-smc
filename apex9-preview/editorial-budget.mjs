/**
 * APEX 9.1 public-source allowance, per device and UTC day.
 * Counts ATTEMPTED external requests, including failed/429 responses.
 * No API keys and no background polling. Cache is labelled by age.
 * Per-installation budget is not a central provider-wide quota.
 */
export const EDITORIAL_POLICY=Object.freeze({
 news:Object.freeze({daily:12,ttlMs:60*60000,spacingMs:45*60000,staleMs:48*3600000}),
 macro:Object.freeze({daily:6,ttlMs:2*3600000,spacingMs:2*3600000,staleMs:48*3600000}),
 assetNews:Object.freeze({daily:8,ttlMs:6*3600000,spacingMs:90*60000,staleMs:48*3600000}),
 calendar:Object.freeze({daily:2,ttlMs:12*3600000,spacingMs:12*3600000,staleMs:72*3600000}),
 macroData:Object.freeze({daily:3,ttlMs:8*3600000,spacingMs:8*3600000,staleMs:72*3600000})
});
const KEY='apex9:public-editorial-budget:v3';
const CACHE='apex9:public-editorial-cache:v3:';
const eligible=r=>r?.state==='OK'||r?.state==='EMPTY';
const validTime=t=>Number.isSafeInteger(t)&&t>0;
export const utcBudgetDay=ms=>new Date(ms).toISOString().slice(0,10);
export function createEditorialBudget({storage,now=()=>Date.now()}={}){
 const inflight=new Map();
 const access=()=>storage||null;
 function read(key){
  const value=access()?.getItem(key);
  return value===null?null:JSON.parse(value);
 }
 function write(key,value){
  if(!access()?.setItem)throw Error('Local storage unavailable');
  access().setItem(key,JSON.stringify(value));
 }
 function counters(at){
  const day=utcBudgetDay(at);
  const raw=read(KEY);
  if(raw===null)return {day,
   counts:{news:0,macro:0,calendar:0,assetNews:0,macroData:0},
   lastAttempt:{news:0,macro:0,calendar:0,assetNews:0,macroData:0}};
  if(!raw||typeof raw.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.day)||
   !raw.counts||!raw.lastAttempt||Object.keys(EDITORIAL_POLICY).some(mode=>
   !Number.isSafeInteger(raw.counts[mode])||
   raw.counts[mode]<0||raw.counts[mode]>EDITORIAL_POLICY[mode].daily||
   !Number.isSafeInteger(raw.lastAttempt[mode])||raw.lastAttempt[mode]<0))
   throw Error('Invalid request ledger');
  if(raw.day!==day)return {day,
   counts:{news:0,macro:0,calendar:0,assetNews:0,macroData:0},
   // Provider spacing must persist across UTC midnight, unlike daily counts.
   lastAttempt:{...raw.lastAttempt}};
  return raw;
 }
 function quota(mode,at){
  const c=counters(at);
  const nextAt=c.lastAttempt[mode]?c.lastAttempt[mode]+EDITORIAL_POLICY[mode].spacingMs:0;
  return {day:c.day,used:c.counts[mode],limit:EDITORIAL_POLICY[mode].daily,
   nextAt,remaining:Math.max(0,EDITORIAL_POLICY[mode].daily-c.counts[mode])};
 }
 function saved(mode,at,cacheKey=''){
  const item=read(CACHE+mode+cacheKey);
  if(!item)return null;
  if(!validTime(item.fetchedAt)||item.fetchedAt>at+60000||
   at-item.fetchedAt>EDITORIAL_POLICY[mode].staleMs||
   !eligible(item.result))return null;
  return item;
 }
 const failed=(state,reason,quotaValue=null)=>({
  state,reason,articles:[],events:[],fetchedAt:null,quota:quotaValue
 });
 function output(result,item,source,quotaValue,reason){
  return {...result,source,fetchedAt:item.fetchedAt,
   quota:quotaValue,...(reason?{reason}:null)};
 }
 function status(mode){
  if(!Object.hasOwn(EDITORIAL_POLICY,mode))return null;
  try{return {...quota(mode,now()),state:'OK'};}
  catch{return {used:0,limit:EDITORIAL_POLICY[mode].daily,
   remaining:0,state:'STORAGE_UNAVAILABLE'};}
 }
 async function load(mode,fetcher,{force=false,key=''}={}){
  if(!Object.hasOwn(EDITORIAL_POLICY,mode))
   return failed('INVALID','Unknown source');
  if(mode==='assetNews'&&!/^[A-Z0-9]{5,20}$/.test(key))
   return failed('INVALID','Asset news requires a verified market symbol');
  const cacheKey=mode==='assetNews'?':'+key:'';
  const inflightKey=mode+cacheKey;
  if(inflight.has(inflightKey))return inflight.get(inflightKey);
  const task=(async()=>{
   const at=now();
   let ledger,item,remaining;
   try{ledger=counters(at);item=saved(mode,at,cacheKey);
    remaining=quota(mode,at);}
   catch{return failed('STORAGE_UNAVAILABLE',
    'No safe persistent daily quota is available');}
   if(!force&&item&&at-item.fetchedAt<=EDITORIAL_POLICY[mode].ttlMs)
    return output(item.result,item,'CACHE',remaining);
   const stale=(why,sourceState)=>{
    if(item)return {...output(item.result,item,'STALE',remaining,why),
     state:'STALE',cachedState:item.result.state,sourceState};
    return failed(sourceState,why,remaining);
   };
   if(remaining.remaining===0)return stale('Daily budget exhausted','LIMIT_REACHED');
   if(ledger.lastAttempt[mode]>at+60000)
    return stale('Device clock moved backwards','CLOCK_ERROR');
   if(ledger.lastAttempt[mode]&&at<remaining.nextAt)
    return stale('Next scheduled request: '+new Date(remaining.nextAt).toISOString(),
     'WAIT_INTERVAL');
   // Reserve before the request. 429, offline and invalid responses all count.
   ledger.counts[mode]++;
   ledger.lastAttempt[mode]=at;
   try{write(KEY,ledger);}catch{return stale('Cannot reserve source budget',
    'STORAGE_UNAVAILABLE');}
   remaining=quota(mode,at);
   let result;
   try{result=await fetcher();}
   catch(e){result=failed('OFFLINE',String(e?.message||e).slice(0,120));}
   if(!result||typeof result!=='object')result=failed('INVALID','Invalid source response');
   if(!eligible(result))return stale(
    'Source '+(result.state||'INVALID')+(result.reason?' · '+result.reason:''),
    result.state||'INVALID');
   const entry={fetchedAt:at,result};
   // Even when cache persistence fails the request ledger remains reserved.
   try{write(CACHE+mode+cacheKey,entry);}catch{}
   return output(result,entry,'NETWORK',remaining);
  })();
  inflight.set(inflightKey,task);
  try{return await task;}finally{inflight.delete(inflightKey);}
 }
 return {load,status};
}
