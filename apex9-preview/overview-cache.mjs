/**
 * Read-only local overview snapshots. Only source-validated values are stored;
 * restoring never upgrades historical data to current network verification.
 * Browsers with disabled storage simply keep the in-memory copy for this tab.
 */
const KEY='apex9:overview-snapshots:v1';
const KEEP=7*86400000;
const safeNumber=n=>typeof n==='number'&&Number.isFinite(n);
const validTime=t=>Number.isSafeInteger(t)&&t>0;
const link=href=>{
 try{const u=new URL(href);return u.protocol==='https:'&&!!u.hostname&&
  !u.username&&!u.password&&u.hostname.includes('.');}catch{return false;}
};
const text=s=>typeof s==='string'&&s.trim().length>=2&&s.length<=220;
export function validGlobalSnapshot(v){
 return v&&validTime(v.observedAt)&&safeNumber(v.marketCapUsd)&&v.marketCapUsd>0&&
  safeNumber(v.totalVolumeUsd)&&v.totalVolumeUsd>=0&&
  safeNumber(v.btcDominancePercent)&&v.btcDominancePercent>=0&&v.btcDominancePercent<=100&&
  safeNumber(v.marketCapChange24hPercent)&&Math.abs(v.marketCapChange24hPercent)<=1000;
}
export function validFearSnapshot(v){
 return v&&Number.isSafeInteger(v.value)&&v.value>=0&&v.value<=100&&
  validTime(v.observedAt);
}
export function checkedOverviewEvents(items,now=Date.now()){
 if(!Array.isArray(items))return [];
 return items.filter(x=>text(x?.title)&&link(x?.href)&&validTime(x?.observedAt)&&
  x.observedAt<=now+60000&&now-x.observedAt<=KEEP&&
  ['news','macro','calendar'].includes(x.group))
  .slice(0,5).map(x=>({title:x.title,href:x.href,observedAt:x.observedAt,
   group:x.group,outdated:x.outdated===true,
   importance:String(x.importance||'RECENT_UNRANKED').slice(0,60)}));
}
export function createOverviewCache({storage,now=()=>Date.now()}={}){
 const memory={};
 function load(){
  try{
   if(storage?.getItem){
    const str=storage.getItem(KEY);
    if(str&&str.length<16000){
     const v=JSON.parse(str);
     if(v&&typeof v==='object'&&!Array.isArray(v))return {...v,...memory};
    }
   }
  }catch{}
  return {...memory};
 }
 function commit(field,value){
  const merged=load();
  merged[field]={savedAt:now(),value};
  memory[field]=merged[field];
  try{storage?.setItem?.(KEY,JSON.stringify(merged))}catch{}
 }
 function read(field,validator){
  const o=load()[field],current=now();
  if(!o||!validTime(o.savedAt)||o.savedAt>current+60000||
   current-o.savedAt>KEEP||!validator(o.value)||!validTime(current)||
   o.value.observedAt&&o.value.observedAt>current+60000)return null;
  return {...o,fromCache:true,ageMs:current-o.savedAt};
 }
 function saveGlobal(v){
  if(!validGlobalSnapshot(v)||v.observedAt>now()+60000)return false;
  commit('global',v);return true;
 }
 function saveFear(v){
  if(!validFearSnapshot(v)||v.observedAt>now()+60000)return false;
  commit('fear',v);return true;
 }
 function saveEvents(items){
  const v=checkedOverviewEvents(items,now());
  if(!v.length)return false;
  commit('events',v);return true;
 }
 return {saveGlobal,saveFear,saveEvents,
  readGlobal:()=>read('global',validGlobalSnapshot),
  readFear:()=>read('fear',validFearSnapshot),
  readEvents:()=>read('events',v=>Array.isArray(v)&&v.length>0&&
   checkedOverviewEvents(v,now()).length===v.length)};
}
