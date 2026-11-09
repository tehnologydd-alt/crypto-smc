/**
 * Keyless, on-device RSS news bridge. Native Android performs bounded HTTPS
 * requests to fixed publisher RSS feeds; JS accepts only attributed metadata.
 */
import {consolidateArticles} from './news-source-fusion.mjs';
const allowed=new Set(['Cointelegraph RSS','Decrypt RSS','CoinDesk RSS']);
const states=new Set(['OK','STALE','WAIT_INTERVAL','DAILY_LIMIT','CLOCK_ERROR',
 'STORAGE_UNAVAILABLE','OFFLINE']);
const native=()=>globalThis.window?.Capacitor?.Plugins?.ApexNative||null;
export function parsePublicRssResponse(raw,{now=Date.now()}={}){
 const state=raw?.state;
 if(!states.has(state))return {state:'INVALID',articles:[],provider:'PUBLIC_RSS'};
 if(!['OK','STALE'].includes(state))
  return {state,articles:[],provider:'PUBLIC_RSS',
   nextAt:Number.isSafeInteger(raw?.nextAt)?raw.nextAt:null};
 if(!Array.isArray(raw.articles)||raw.articles.length>80)
  return {state:'INVALID',articles:[],provider:'PUBLIC_RSS'};
 const articles=[];
 for(const a of raw.articles){
  if(!allowed.has(a?.source)||a?.timeKind!=='PUBLISHED'||
   a?.notDirectionalEvidence!==true||
   typeof a?.title!=='string'||a.title.length<12||
   a.title.length>220||
   !Number.isSafeInteger(a?.observedAt)||a.observedAt<=0||
   a.observedAt>now+60000||now-a.observedAt>48*3600000)
   continue;
  let uri;
  try{uri=new URL(a.href);}catch{continue;}
  if(uri.protocol!=='https:'||uri.username||uri.password||!uri.hostname.includes('.'))
   continue;
  articles.push({title:a.title,href:uri.href,
   observedAt:a.observedAt,timeKind:'PUBLISHED',source:a.source,
   notDirectionalEvidence:true});
 }
 const safe=consolidateArticles(articles,{limit:18,perDomain:6});
 return {state:safe.length?(state==='STALE'?'STALE':'OK'):'EMPTY',
  articles:safe,provider:'PUBLIC_RSS',cached:raw.cached===true,
  fetchedAt:Number.isSafeInteger(raw.fetchedAt)?raw.fetchedAt:null,
  reason:typeof raw.reason==='string'?raw.reason.slice(0,45):null,
  sourceScope:'PUBLIC_RSS_HEADLINES_NOT_VERIFIED_EVENTS'};
}
export async function fetchPublicRssNews({plugin=native(),now=()=>Date.now()}={}){
 if(!plugin?.fetchPublicRssNews)
  return {state:'ANDROID_ONLY',provider:'PUBLIC_RSS',articles:[]};
 try{return parsePublicRssResponse(await plugin.fetchPublicRssNews(),
  {now:now()});}
 catch{return {state:'OFFLINE',provider:'PUBLIC_RSS',articles:[]};}
}
