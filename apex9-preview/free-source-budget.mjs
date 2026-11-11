/**
 * No-key public research request budgets, per APK installation.
 * Provider-wide IP limits may be stricter; 429 always counts as an attempt.
 * Never performs payment or credentials use.
 */
export const FREE_POLICY=Object.freeze({
 fear:Object.freeze({daily:3,monthly:80,gapMs:6*3600000,ttlMs:6*3600000,staleMs:3*86400000}),
 dex:Object.freeze({daily:8,monthly:210,gapMs:2*3600000,ttlMs:2*3600000,staleMs:86400000}),
 gecko:Object.freeze({daily:6,monthly:160,gapMs:3*3600000,ttlMs:3*3600000,staleMs:86400000}),
 okx:Object.freeze({daily:12,monthly:300,gapMs:3600000,ttlMs:3600000,staleMs:6*3600000}),
 paprika:Object.freeze({daily:6,monthly:150,gapMs:3*3600000,ttlMs:3*3600000,staleMs:86400000}),
 cmc:Object.freeze({daily:6,monthly:160,gapMs:3*3600000,ttlMs:3*3600000,staleMs:86400000})
});
const KEY='apex9:no-key-budget:v1',CACHE='apex9:no-key-cache:v1:';
const modes=Object.keys(FREE_POLICY);
const day=at=>new Date(at).toISOString().slice(0,10);
const month=at=>new Date(at).toISOString().slice(0,7);
const fresh=at=>({day:day(at),month:month(at),
 daily:Object.fromEntries(modes.map(k=>[k,0])),
 monthly:Object.fromEntries(modes.map(k=>[k,0])),
 last:Object.fromEntries(modes.map(k=>[k,0]))});
const good=r=>r&&['OK','EMPTY'].includes(r.state);
export function createFreeSourceBudget({storage,now=()=>Date.now(),onNetworkResult=null}={}){
 const inFlight=new Map();
 function read(key){
  if(!storage?.getItem||!storage?.setItem)throw Error('PERSISTENCE_UNAVAILABLE');
  const raw=storage.getItem(key);
  return raw===null?null:JSON.parse(raw);
 }
 function write(key,obj){if(!storage?.setItem)throw Error('PERSISTENCE_UNAVAILABLE');
  storage.setItem(key,JSON.stringify(obj));}
 function ledger(at){
  const x=read(KEY);
  if(x===null)return fresh(at);
  // Additive migration: preserve legacy quota counters and cached market data.
  if(x&&typeof x==='object'&&x.daily&&x.monthly&&x.last&&
     !Object.hasOwn(x.daily,'cmc')&&!Object.hasOwn(x.monthly,'cmc')&&
     !Object.hasOwn(x.last,'cmc')){
   x.daily.cmc=0;x.monthly.cmc=0;x.last.cmc=0;
  }
  if(!x||!/^\d{4}-\d{2}-\d{2}$/.test(x.day||'')||
   !/^\d{4}-\d{2}$/.test(x.month||'')||modes.some(k=>
    !Number.isSafeInteger(x.daily?.[k])||x.daily[k]<0||
    x.daily[k]>FREE_POLICY[k].daily||
    !Number.isSafeInteger(x.monthly?.[k])||x.monthly[k]<0||
    x.monthly[k]>FREE_POLICY[k].monthly||
    !Number.isSafeInteger(x.last?.[k])||x.last[k]<0))
   throw Error('INVALID_REQUEST_LEDGER');
  if(modes.some(k=>x.last[k]>at+60000))throw Error('CLOCK_ROLLBACK');
  if(x.month!==month(at)){
   const n=fresh(at);n.last={...x.last};return n;
  }
  if(x.day!==day(at)){
   const n=fresh(at);n.last={...x.last};n.monthly={...x.monthly};return n;
  }
  return x;
 }
 function detail(mode,at){
  const l=ledger(at),p=FREE_POLICY[mode];
  return {used:l.daily[mode],limit:p.daily,
   monthlyUsed:l.monthly[mode],monthlyLimit:p.monthly,
   dailyRemaining:p.daily-l.daily[mode],
   monthlyRemaining:p.monthly-l.monthly[mode],
   nextAt:l.last[mode]?l.last[mode]+p.gapMs:0,
   day:l.day,month:l.month};
 }
 function status(mode){
  if(!FREE_POLICY[mode])return {state:'INVALID'};
  try{return {state:'OK',...detail(mode,now())};}
  catch(e){return {state:'STORAGE_UNAVAILABLE',reason:String(e.message||e),
   dailyRemaining:0,monthlyRemaining:0,limit:FREE_POLICY[mode].daily};}
 }
 async function load(mode,fetcher,{key='global',force=false}={}){
  if(!FREE_POLICY[mode]||typeof fetcher!=='function'||
   !/^[A-Za-z0-9_-]{2,25}$/.test(key))return {state:'INVALID'};
  const identity=mode+':'+key;
  if(inFlight.has(identity))return inFlight.get(identity);
  const job=(async()=>{
   const at=now(),p=FREE_POLICY[mode];let l,q,item;
   try{
    l=ledger(at);q=detail(mode,at);
    item=read(CACHE+identity);
    if(item&&(!Number.isSafeInteger(item.at)||item.at>at+60000||
      at-item.at>p.staleMs||!good(item.data)))item=null;
   }catch(e){return {state:'STORAGE_UNAVAILABLE',reason:String(e.message||e)};}
   function stale(state,reason){
    if(item)return {...item.data,state:'STALE',sourceState:state,
     source:'STALE_CACHE',fetchedAt:item.at,quota:q,reason};
    return {state,reason,quota:q,source:'NONE'};
   }
   if(!force&&item&&at-item.at<=p.ttlMs)
    return {...item.data,source:'CACHE',fetchedAt:item.at,quota:q};
   if(!q.dailyRemaining)return stale('DAILY_LIMIT','Daily allowance spent');
   if(!q.monthlyRemaining)return stale('MONTHLY_LIMIT','Monthly allowance spent');
   if(q.nextAt>at)return stale('WAIT_INTERVAL','Next source request scheduled later');
   l.daily[mode]++;l.monthly[mode]++;l.last[mode]=at;
   try{write(KEY,l);}catch{return stale('STORAGE_UNAVAILABLE','Could not reserve request');}
   q=detail(mode,at);
   let r;
   try{r=await fetcher();}
   catch(e){r={state:'OFFLINE',reason:String(e?.message||e).slice(0,110)};}
   // One receipt per actually attempted request, including 429/invalid when
   // the user subsequently sees a stale fallback. Cache/quotas never count.
   if(typeof onNetworkResult==='function')try{
    onNetworkResult({provider:mode,asset:key,result:r,at,
     latencyMs:Math.max(0,now()-at)});
   }catch{ /* Reliability logging must not interrupt a market request. */ }
   if(!good(r))return stale(r?.state||'INVALID',r?.reason||'Source returned no valid data');
   try{write(CACHE+identity,{at,data:r});}catch{}
   return {...r,source:'NETWORK',fetchedAt:at,quota:q};
  })();
  inFlight.set(identity,job);
  try{return await job;}finally{inFlight.delete(identity);}
 }
 return {status,load};
}
