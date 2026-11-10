/** Strict per-device allowances for new read-only public research adapters.
 * Counts even failed HTTP attempts; no polling, no credentials, no bypass on
 * corrupt/unavailable storage. Stale results never appear as fresh.
 */
export const LAYER_POLICY=Object.freeze({
 derivatives:Object.freeze({daily:12,spacingMs:10*60000,ttlMs:10*60000,staleMs:30*60000}),
 wallet:Object.freeze({daily:6,spacingMs:2*60000,ttlMs:10*60000,staleMs:30*60000})
});
const STORE='apex9:research-layer-budget:v1';
const CACHE='apex9:research-layer-cache:v1:';
const day=at=>new Date(at).toISOString().slice(0,10);
const validKey=key=>typeof key==='string'&&/^[a-zA-Z0-9_:.-]{4,120}$/.test(key);
const fresh=at=>({day:day(at),count:{derivatives:0,wallet:0},
 last:{derivatives:0,wallet:0}});
const valid=state=>state==='OK'||state==='EMPTY';
export function createResearchLayerBudget({storage,now=()=>Date.now()}={}){
 const pending=new Map();
 const read=key=>{if(!storage?.getItem||!storage?.setItem)throw Error('STORAGE_UNAVAILABLE');
  const value=storage.getItem(key);return value===null?null:JSON.parse(value)};
 const write=(key,value)=>storage.setItem(key,JSON.stringify(value));
 function ledger(at){
  const r=read(STORE);
  if(r===null)return fresh(at);
  if(!r||typeof r.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||
   Object.entries(LAYER_POLICY).some(([k,p])=>
    !Number.isSafeInteger(r.count?.[k])||r.count[k]<0||r.count[k]>p.daily||
    !Number.isSafeInteger(r.last?.[k])||r.last[k]<0||
    r.last[k]>at+60000))throw Error('INVALID_LEDGER');
  return r.day===day(at)?r:{...r,day:day(at),
   count:{derivatives:0,wallet:0}};
 }
 function quota(mode,at=now()){
  const r=ledger(at),p=LAYER_POLICY[mode];
  return {used:r.count[mode],limit:p.daily,remaining:p.daily-r.count[mode],
   nextAt:r.last[mode]?r.last[mode]+p.spacingMs:0};
 }
 function status(mode){
  if(!LAYER_POLICY[mode])return {state:'INVALID'};
  try{return {state:'OK',...quota(mode)}}catch{
   return {state:'STORAGE_UNAVAILABLE',remaining:0};
  }
 }
 async function load(mode,key,fetcher){
  if(!LAYER_POLICY[mode]||!validKey(key)||typeof fetcher!=='function')
   return {state:'INVALID',reason:'Invalid research-layer request'};
  const identity=mode+':'+key;
  if(pending.has(identity))return pending.get(identity);
  const task=(async()=>{
   const at=now(),p=LAYER_POLICY[mode];let l,q,cached;
   try{l=ledger(at);q=quota(mode,at);cached=read(CACHE+identity);}
   catch{return {state:'STORAGE_UNAVAILABLE',reason:'Нет защищённого локального учёта запросов'};}
   const cacheValid=cached&&Number.isSafeInteger(cached.at)&&
    cached.at<=at&&at-cached.at<=p.staleMs&&valid(cached.result?.state);
   if(cacheValid&&at-cached.at<=p.ttlMs)return {
    ...cached.result,cache:'FRESH',fetchedAt:cached.at,quota:q};
   const fail=(state,reason)=>{
    if(cacheValid)return {...cached.result,state:'STALE',
     sourceState:state,reason,cache:'STALE',fetchedAt:cached.at,quota:q};
    return {state,reason,quota:q};
   };
   if(q.remaining===0)return fail('DAILY_LIMIT','Локальный дневной лимит исчерпан');
   if(q.nextAt>at)return fail('WAIT_INTERVAL','Следующий запрос после '+new Date(q.nextAt).toISOString());
   l.count[mode]++;l.last[mode]=at;
   try{write(STORE,l)}catch{return fail('STORAGE_UNAVAILABLE','Нельзя записать лимит');}
   q=quota(mode,at);
   let result;
   try{result=await fetcher()}catch(e){result={state:'OFFLINE',reason:String(e?.message||e).slice(0,120)};}
   if(!result||typeof result!=='object')result={state:'INVALID'};
   if(!valid(result.state))return fail(result.state||'INVALID',result.reason||'Нет допустимого ответа');
   try{write(CACHE+identity,{at,result})}catch{}
   return {...result,cache:'NETWORK',fetchedAt:at,quota:q};
  })();
  pending.set(identity,task);
  try{return await task}finally{pending.delete(identity)}
 }
 function clear(mode,key){
  if(!LAYER_POLICY[mode]||!validKey(key)||!storage?.removeItem)return false;
  try{storage.removeItem(CACHE+mode+':'+key);return true}
  catch{return false}
 }
 return {load,status,clear};
}
