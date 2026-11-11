/**
 * APEX local operational API reliability ledger.
 * Only REAL network attempts are logged. Cache hits, skipped assets and
 * client-side budget pauses are not fictitious successes/failures.
 * No trading/probability claims, API credentials, raw payloads or telemetry.
 */
export const RELIABILITY_VERSION='APEX_API_RELIABILITY_V1';
export const RELIABILITY_PROVIDERS=Object.freeze([
 'fear','dex','gecko','okx','paprika','cmc'
]);
const KEY='apex9:api-reliability:v1';
const DAY=86400000,WINDOW=30*DAY,MAX_PER_SOURCE=160,MIN_SAMPLE=12;
const PROVIDER_AGE=Object.freeze({
 fear:4*DAY,dex:3*3600000,gecko:3*3600000,
 okx:20*60000,paprika:2*3600000,cmc:2*3600000
});
const TERMINAL=new Set(['OK','EMPTY','INVALID','OFFLINE','RATE_LIMITED',
 'ACCESS_DENIED','STALE','CLOCK_SKEW']);
const validTime=t=>Number.isSafeInteger(t)&&t>0;
const isPrice=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const dayKey=at=>new Date(at).toISOString().slice(0,10);
const percent=(a,b)=>b>0?Math.round(1000*a/b)/10:null;
const median=a=>{
 if(!a.length)return null;
 const sorted=[...a].sort((x,y)=>x-y),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
function validSample(e,now){
 return e&&validTime(e.at)&&e.at<=now+60000&&e.at>=now-WINDOW&&
  TERMINAL.has(e.state)&&
  (e.latencyMs===null||(Number.isFinite(e.latencyMs)&&
   e.latencyMs>=0&&e.latencyMs<=120000))&&
  (e.ageMs===null||(Number.isFinite(e.ageMs)&&
   e.ageMs>=0&&e.ageMs<=WINDOW))&&
  (e.isFresh===null||typeof e.isFresh==='boolean');
}
function empty(){return {version:RELIABILITY_VERSION,events:{},comparisons:[]};}
function clean(value,now){
 const out=empty();
 if(value?.version!==RELIABILITY_VERSION||!value.events||
  typeof value.events!=='object')return out;
 for(const provider of RELIABILITY_PROVIDERS){
  const series=value.events[provider];
  if(!Array.isArray(series))continue;
  out.events[provider]=series.filter(e=>validSample(e,now))
   .slice(-MAX_PER_SOURCE).map(e=>({
    at:e.at,state:e.state,latencyMs:e.latencyMs,
    ageMs:e.ageMs,isFresh:e.isFresh
   }));
 }
 if(Array.isArray(value.comparisons)){
  out.comparisons=value.comparisons.filter(e=>
   e&&validTime(e.at)&&e.at>=now-WINDOW&&e.at<=now+60000&&
   typeof e.asset==='string'&&/^[A-Z0-9]{5,20}$/.test(e.asset)&&
   Number.isFinite(e.deltaPct)&&e.deltaPct>=0&&e.deltaPct<=200)
    .slice(-90).map(e=>({at:e.at,asset:e.asset,deltaPct:e.deltaPct}));
 }
 return out;
}
export function createSourceReliability({storage,now=()=>Date.now()}={}){
 let memory=empty(),persisted=true;
 function read(){
  const at=now();
  if(!storage?.getItem||!storage?.setItem){
   persisted=false;return clean(memory,at);
  }
  try{
   const raw=storage.getItem(KEY);
   if(!raw)return clean(memory,at);
   const decoded=JSON.parse(raw);
   memory=clean(decoded,at);
   return memory;
  }catch{
   persisted=false;
   return clean(memory,at);
  }
 }
 function write(value){
  memory=value;
  try{
   if(!storage?.setItem)throw Error('no storage');
   storage.setItem(KEY,JSON.stringify(value));persisted=true;
  }catch{persisted=false;}
 }
 function record({provider,result,at=now(),latencyMs=null}={}){
  if(!RELIABILITY_PROVIDERS.includes(provider)||!validTime(at)||
   at>now()+60000||at<now()-WINDOW||!TERMINAL.has(result?.state))
   return false;
  const data=result?.data;
  // Some adapters stamp local reception time into observedAt. It MUST NOT
  // become a fabricated source-freshness success.
  const providerTimestamped=['fear','paprika','cmc'].includes(provider);
  const observedAt=!providerTimestamped?null:
   Number.isSafeInteger(data?.observedAt)?data.observedAt:
   Number.isSafeInteger(data?.providerObservedAt)?data.providerObservedAt:null;
  let ageMs=null,isFresh=null;
  if(['OK','EMPTY'].includes(result.state)&&validTime(observedAt)&&
   observedAt<=at+60000){
   ageMs=Math.max(0,at-observedAt);
   if(ageMs<=WINDOW)isFresh=ageMs<=PROVIDER_AGE[provider];
   else ageMs=null;
  }
  const safeLatency=Number.isFinite(latencyMs)&&latencyMs>=0&&
   latencyMs<=120000?Math.round(latencyMs):null;
  const value=read();
  const list=value.events[provider]||[];
  list.push({at,state:result.state,latencyMs:safeLatency,ageMs,isFresh});
  value.events[provider]=list.slice(-MAX_PER_SOURCE);
  write(value);
  return true;
 }
 function compareUsd({asset,one,two,at=now()}={}){
  if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset)||
   !validTime(at)||at>now()+60000||
   !isPrice(one)||!isPrice(two))return false;
  const deltaPct=Number((200*Math.abs(one-two)/(one+two)).toFixed(4));
  const value=read();
  const last=value.comparisons.at(-1);
  // Re-renders and repeated cached market snapshots are not new comparisons.
  if(last&&last.asset===asset&&at-last.at<60000)return false;
  value.comparisons.push({at,asset,deltaPct});
  value.comparisons=value.comparisons.slice(-90);
  write(value);return true;
 }
 function summary(provider){
  if(!RELIABILITY_PROVIDERS.includes(provider))return null;
  const items=read().events[provider]||[];
  const n=items.length,days=new Set(items.map(x=>dayKey(x.at))).size;
  const ok=items.filter(x=>x.state==='OK'||x.state==='EMPTY').length;
  const invalid=items.filter(x=>x.state==='INVALID').length;
  const limited=items.filter(x=>x.state==='RATE_LIMITED').length;
  const failures=n-ok;
  const fresh=items.filter(x=>x.isFresh===true).length;
  const stamped=items.filter(x=>x.isFresh!==null).length;
  const recent=items.slice(-10),previous=items.slice(-20,-10);
  const success=a=>percent(a.filter(x=>['OK','EMPTY'].includes(x.state)).length,a.length);
  const state=n>=MIN_SAMPLE&&days>=2?'OBSERVED':'COLLECTING';
  const p=state==='OBSERVED'?percent(ok,n):null;
  return {provider,state,attempts:n,uniqueDays:days,ok,failures,
   invalid,rateLimited:limited,availabilityPercent:p,
   latencyMedianMs:median(items.map(x=>x.latencyMs).filter(Number.isFinite)),
   freshness:{confirmed:fresh,checked:stamped,
    percent:stamped>=5?percent(fresh,stamped):null},
   trend:previous.length===10?{
    latestPercent:success(recent),priorPercent:success(previous)}:null,
   lastAt:items.at(-1)?.at??null,persisted};
 }
 function overview(){
  const value=read(),rows=RELIABILITY_PROVIDERS.map(summary);
  const comps=value.comparisons;
  return {version:RELIABILITY_VERSION,rows,persisted,
   comparisons:{count:comps.length,
    medianDeltaPercent:median(comps.map(x=>x.deltaPct)),
    latest:comps.at(-1)||null},
   note:'Операционная доступность и качество ответов, не точность прогнозов.'};
 }
 read();
 return {record,compareUsd,summary,overview};
}
