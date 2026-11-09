/**
 * On-demand, per-device request control for public news-vs-M5 observations.
 * No background jobs or secrets. Reserve local quota before each GET, including
 * failed requests, and never report unavailable history as a successful check.
 */
const KEY='apex9:news-m5:quota:v1';
const CACHE='apex9:news-m5:cache:v1:';
const MAX_PER_UTC_DAY=8, MIN_INTERVAL=2*60000, TTL=10*60000;
const goodResult=r=>r?.state==='OBSERVED'||r?.state==='PARTIAL';
const validKey=(symbol,at)=>/^[A-Z0-9]{2,15}USDT$/.test(symbol)&&
 Number.isSafeInteger(at)&&at>0;
const utcDay=at=>new Date(at).toISOString().slice(0,10);
export function createNewsM5Budget({storage,now=()=>Date.now()}={}){
 const inflight=new Map();
 function get(key){return storage?.getItem(key);}
 function set(key,value){if(!storage?.setItem)throw Error('No persistent storage');
  storage.setItem(key,JSON.stringify(value));}
 function ledger(at){
  if(!storage?.getItem||!storage?.setItem)throw Error('No persistent storage');
  const raw=get(KEY);
  if(raw===null)return {day:utcDay(at),used:0,lastAttempt:0};
  const x=JSON.parse(raw);
  if(typeof x?.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.day)||
   !Number.isSafeInteger(x.used)||x.used<0||x.used>MAX_PER_UTC_DAY||
   !Number.isSafeInteger(x.lastAttempt)||x.lastAttempt<0)
   throw Error('Invalid quota');
  return x.day===utcDay(at)?x:{day:utcDay(at),used:0,lastAttempt:x.lastAttempt};
 }
 function quota(x){return {used:x.used,limit:MAX_PER_UTC_DAY,
  remaining:MAX_PER_UTC_DAY-x.used,nextAt:x.lastAttempt+MIN_INTERVAL};}
 async function load(symbol,eventAt,fetcher){
  if(!validKey(symbol,eventAt)||typeof fetcher!=='function')
   return {state:'INVALID',reason:'Invalid M5 request'};
  const key=symbol+':'+eventAt;
  if(inflight.has(key))return inflight.get(key);
  const task=(async()=>{
   const at=now();
   let x,cached;
   try{
    x=ledger(at);
    const raw=get(CACHE+key);
    cached=raw===null?null:JSON.parse(raw);
   }catch{return {state:'STORAGE_UNAVAILABLE',reason:'Нет локального журнала лимитов'};}
   let q=quota(x);
   if(cached&&Number.isSafeInteger(cached.at)&&cached.at<=at&&
    at-cached.at<=TTL&&goodResult(cached.result))
    return {...cached.result,quota:q,cached:true};
   if(x.used>=MAX_PER_UTC_DAY)
    return {state:'DAILY_LIMIT',quota:q,reason:'Суточный локальный лимит исчерпан'};
   if(x.lastAttempt>at+60000)return {state:'CLOCK_ERROR',quota:q};
   if(x.lastAttempt&&at<x.lastAttempt+MIN_INTERVAL)
    return {state:'WAIT_INTERVAL',quota:q,reason:'Минимальный интервал между M5 запросами'};
   x.used++;x.lastAttempt=at;
   try{set(KEY,x);}catch{
    return {state:'STORAGE_UNAVAILABLE',reason:'Невозможно зарезервировать лимит'};}
   q=quota(x);
   let result;
   try{result=await fetcher();}catch(e){result={state:'OFFLINE',
    reason:String(e?.message||e).slice(0,120)};}
   if(!result||typeof result!=='object')result={state:'INVALID'};
   if(goodResult(result)){
    try{set(CACHE+key,{at,result});}catch{}
   }
   return {...result,quota:q,cached:false};
  })();
  inflight.set(key,task);
  try{return await task;}finally{inflight.delete(key);}
 }
 function status(){try{return {...quota(ledger(now())),state:'OK'};}
  catch{return {state:'STORAGE_UNAVAILABLE',remaining:0,limit:MAX_PER_UTC_DAY};}}
 return {load,status};
}
