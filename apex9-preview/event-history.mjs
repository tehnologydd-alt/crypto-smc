/**
 * APEX 9.1 — local, provenance-labelled research event history.
 * This is NOT a historical archive of every market event, nor a causal model.
 * Only data actually returned by enabled free sources are retained.
 */
import {routeGlobalEvents,routeAssetNews} from './market-event-router.mjs';
const KEY='apex9:observed-event-history:v1';
const MAX_ROWS=240,MAX_AGE=90*86400000;
const SYMBOL=/^[A-Z0-9]{5,20}$/;
const TIMED=new Set(['NEWS','MACRO','SOCIAL','SCHEDULE']);
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const validUrl=u=>{
 try{const x=new URL(u);return x.protocol==='https:'&&x.hostname.includes('.');}
 catch{return false;}
};
const reasonable=(t,at)=>validTime(t)&&t<=at+72*3600000&&t>=at-MAX_AGE;
const clean=s=>typeof s==='string'?s.trim().slice(0,240):'';
const goodRow=(row,at)=>row&&typeof row.id==='string'&&row.id.length<=540&&
 /^[A-Z]+:/.test(row.id)&&TIMED.has(row.kind)&&
 typeof row.title==='string'&&row.title.length>8&&row.title.length<=240&&
 validUrl(row.href)&&reasonable(row.eventAt,at)&&
 validTime(row.firstCapturedAt)&&row.firstCapturedAt<=at+60000&&
 validTime(row.lastCapturedAt)&&row.lastCapturedAt<=at+60000&&
 row.firstCapturedAt<=row.lastCapturedAt&&
 Array.isArray(row.assets)&&row.assets.length<=12&&
 row.assets.every(s=>SYMBOL.test(s))&&
 typeof row.source==='string'&&row.source.length<=50&&
 typeof row.timeKind==='string'&&
 (row.kind==='SCHEDULE'?row.timeKind==='SCHEDULED':row.timeKind==='ARTICLE_OR_POST');
const empty=()=>({version:1,entries:[]});
export function createEventHistory({storage,now=()=>Date.now()}={}){
 function read(){
  if(!storage?.getItem||!storage?.setItem)throw Error('No persistent event storage');
  const raw=storage.getItem(KEY);
  if(raw===null)return empty();
  const parsed=JSON.parse(raw),at=now();
  if(!parsed||parsed.version!==1||!Array.isArray(parsed.entries)||
    parsed.entries.length>MAX_ROWS||!parsed.entries.every(x=>goodRow(x,at)))
    throw Error('Invalid local event archive');
  return parsed;
 }
 function store(data){
  storage.setItem(KEY,JSON.stringify(data));
 }
 function append(candidates){
  let history;
  try{history=read();}
  catch(e){return {state:'STORAGE_UNAVAILABLE',added:0,reason:String(e.message||e)};}
  const at=now();
  const rows=new Map(history.entries.map(x=>[x.id,x]));
  let added=0,changed=0;
  for(const item of candidates){
   if(!item||!validUrl(item.href)||!reasonable(item.eventAt,at)||
     !validTime(item.capturedAt)||item.capturedAt>at+60000||item.capturedAt<at-MAX_AGE||
     !TIMED.has(item.kind)||!clean(item.title)||clean(item.title).length<9)continue;
   const id=item.kind+':'+item.href;
   if(id.length>540)continue;
   const assets=(item.assets||[]).filter(s=>SYMBOL.test(s)).slice(0,10);
   const existing=rows.get(id);
   const row={id,kind:item.kind,title:clean(item.title),href:item.href,
    source:item.source.slice(0,50),eventAt:item.eventAt,
    timeKind:item.kind==='SCHEDULE'?'SCHEDULED':'ARTICLE_OR_POST',
    firstCapturedAt:existing?existing.firstCapturedAt:item.capturedAt,
    lastCapturedAt:existing?Math.max(existing.lastCapturedAt,item.capturedAt):item.capturedAt,
    assets:[...new Set([...(existing?.assets||[]),...assets])].slice(0,12),
    // Never upgrade an announced schedule into an observed real publication.
    unverifiedImpact:true};
   if(!goodRow(row,at))continue;
   if(!existing)added++;
   else if(row.lastCapturedAt!==existing.lastCapturedAt||
    row.assets.join(',')!==existing.assets.join(','))changed++;
   rows.set(id,row);
  }
  const retained=[...rows.values()].filter(x=>reasonable(x.eventAt,at))
   .sort((a,b)=>b.eventAt-a.eventAt||a.id.localeCompare(b.id))
   .slice(0,MAX_ROWS);
  if(!added&&!changed&&retained.length===history.entries.length)
   return {state:'OK',added:0,total:retained.length};
  try{store({version:1,entries:retained});}
  catch(e){return {state:'STORAGE_UNAVAILABLE',added:0,reason:String(e.message||e)};}
  return {state:'OK',added,total:retained.length};
 }
 function captureGlobal({news,macro,calendar}={}){
  const at=now();
  const events=routeGlobalEvents(news,macro,calendar,{now:at,max:8});
  const candidates=events.map(e=>{
   const result=e.group==='news'?news:e.group==='macro'?macro:calendar;
   return {kind:e.group==='calendar'?'SCHEDULE':e.group==='macro'?'MACRO':'NEWS',
    title:e.title,href:e.href,eventAt:e.observedAt,
    source:e.group==='calendar'?'BLS':'GDELT',
    capturedAt:validTime(result?.fetchedAt)?result.fetchedAt:at,assets:[]};
  });
  return append(candidates);
 }
 function captureAsset(symbol,{news,social}={}){
  if(!SYMBOL.test(symbol))return {state:'INVALID',added:0};
  const at=now(),candidates=[];
  for(const e of routeAssetNews(symbol,news,{max:12}))
   candidates.push({kind:'NEWS',title:e.title,href:e.url,
    eventAt:e.seenAt,source:'GDELT',
    capturedAt:validTime(news?.fetchedAt)?news.fetchedAt:at,
    assets:[symbol]});
  if(['OK','STALE','EMPTY'].includes(social?.state)){
   for(const p of social.posts||[]){
    if(!validTime(p.indexedAt)||!validUrl(p.href))continue;
    candidates.push({kind:'SOCIAL',title:p.text,href:p.href,
     eventAt:p.indexedAt,source:'Bluesky',
     capturedAt:validTime(social.fetchedAt)?social.fetchedAt:at,
     assets:[symbol]});
   }
  }
  return append(candidates);
 }
 function list({symbol=null,includeGlobal=false,limit=30}={}){
  if(symbol!==null&&!SYMBOL.test(symbol))return {state:'INVALID',events:[]};
  let history;try{history=read();}
  catch(e){return {state:'STORAGE_UNAVAILABLE',events:[],
   reason:String(e.message||e)};}
  const at=now();
  const filtered=history.entries.filter(x=>reasonable(x.eventAt,at)&&
   (symbol===null||x.assets.includes(symbol)||
     (includeGlobal&&x.kind==='MACRO')));
  return {state:'OK',events:filtered.slice(0,Math.max(1,Math.min(80,limit))),
   total:filtered.length,stored:history.entries.length};
 }
 return {captureGlobal,captureAsset,list};
}
