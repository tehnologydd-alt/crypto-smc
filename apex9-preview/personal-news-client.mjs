/**
 * Personal Android-only news API bridge. No keys in APK, URL parameters,
 * localStorage, network JS calls, logs or cached webpage files.
 * The native Capacitor plugin performs fixed-origin HTTPS with Keystore keys.
 */
import {consolidateArticles} from './news-source-fusion.mjs';
const COINS=new Set(['BTC','ETH','SOL','XRP','ADA','BNB','DOGE','LTC']);
const PROVIDERS=['cryptopanic','newsdata'];
const native=()=>globalThis.window?.Capacitor?.Plugins?.ApexNative||null;
const pendingBundles=new WeakMap();
export function personalNewsCapable(){const n=native();
 return Boolean(n?.getPersonalNewsStatus&&n?.fetchPersonalNews&&
  n?.setPersonalNewsKey&&n?.removePersonalNewsKey);
}
export async function personalNewsStatus({plugin=native()}={}){
 if(!plugin?.getPersonalNewsStatus)return {native:false,providers:{}};
 try{
  const response=await plugin.getPersonalNewsStatus();
  const providers={};
  for(const key of PROVIDERS){
   const item=response?.providers?.[key];
   providers[key]={configured:item?.configured===true,mode:'PERSONAL_DEVICE_KEYSTORE'};
  }
  return {native:true,providers};
 }catch{return {native:true,state:'STORAGE_UNAVAILABLE',providers:{}};}
}
export async function changePersonalNewsKey(provider,key,{
 plugin=native()
}={}){
 if(!PROVIDERS.includes(provider))return {state:'INVALID'};
 if(!plugin?.setPersonalNewsKey)return {state:'ANDROID_ONLY'};
 if(typeof key!=='string'||key.length<12||key.length>300||
  !/^[A-Za-z0-9_.-]+$/.test(key))return {state:'INVALID'};
 try{
  await plugin.setPersonalNewsKey({provider,key});
  return {state:'SAVED',provider}; // never return the key
 }catch{return {state:'STORAGE_UNAVAILABLE'};}
}
export async function removePersonalNewsKey(provider,{
 plugin=native()
}={}){
 if(!PROVIDERS.includes(provider))return {state:'INVALID'};
 if(!plugin?.removePersonalNewsKey)return {state:'ANDROID_ONLY'};
 try{await plugin.removePersonalNewsKey({provider});return {state:'REMOVED'};}
 catch{return {state:'STORAGE_UNAVAILABLE'};}
}
export function parsePersonalProvider(provider,raw,now=Date.now()){
 if(!PROVIDERS.includes(provider)||!Array.isArray(raw?.results)||
  raw.results.length>60)return {state:'INVALID',articles:[]};
 const articles=[];
 for(const entry of raw.results){
  const title=String(entry?.title||'').trim().slice(0,220);
  const href=String(provider==='cryptopanic'?
   (entry?.original_url||entry?.url||''):
   (entry?.link||''));
  const dateRaw=provider==='cryptopanic'?entry?.published_at:entry?.pubDate;
  if(typeof dateRaw!=='string'||dateRaw.length>48)continue;
  let timestamp=dateRaw.trim();
  if(provider==='newsdata'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(timestamp))
   timestamp=timestamp.replace(' ','T')+'Z';
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(timestamp))
   continue;
  const seen=Date.parse(timestamp);
  let u;try{u=new URL(href);}catch{continue;}
  if(u.protocol!=='https:'||u.username||u.password||
   !Number.isFinite(seen)||seen>now+60000||now-seen>48*3600000||
   title.length<10)continue;
  articles.push({title,href:u.href,observedAt:seen,
   source:provider==='newsdata'?'NewsData.io':'CryptoPanic',
   timeKind:'PUBLISHED',domain:u.hostname,
   notDirectionalEvidence:true});
 }
 return {state:articles.length?'OK':'EMPTY',articles};
}
/**
 * Explicit, quota-consuming test for exactly ONE provider on the phone.
 * A cached hit does not consume another upstream request.
 * Return only diagnostics, never raw API payloads or keys.
 */
export async function checkPersonalNewsProvider(provider,coin,{
 plugin=native(),now=()=>Date.now()
}={}){
 if(!PROVIDERS.includes(provider)||!COINS.has(coin))
  return {state:'UNSUPPORTED',provider,articleCount:0};
 if(!plugin?.fetchPersonalNews)
  return {state:'ANDROID_ONLY',provider,articleCount:0};
 try{
  const response=await plugin.fetchPersonalNews({provider,coin});
  if(response?.state!=='OK'){
   const allowed=new Set(['NOT_CONFIGURED','INVALID_CREDENTIALS',
    'FORBIDDEN_OR_LIMITED','RATE_LIMITED','DAILY_LIMIT','MONTHLY_LIMIT',
    'WAIT_INTERVAL','CLOCK_ERROR','STORAGE_UNAVAILABLE','OFFLINE',
    'INVALID','UNSUPPORTED']);
   const state=allowed.has(response?.state)?response.state:'INVALID';
   const nextAt=Number.isSafeInteger(response?.nextAt)&&response.nextAt>0?
    response.nextAt:null;
   return {provider,state,articleCount:0,cached:false,nextAt};
  }
  const parsed=parsePersonalProvider(provider,response.raw,now());
  return {provider,state:parsed.state,articleCount:parsed.articles.length,
   cached:response.cached===true,
   newestPublishedAt:parsed.articles.length?
    Math.max(...parsed.articles.map(a=>a.observedAt)):null};
 }catch{return {provider,state:'OFFLINE',articleCount:0,cached:false};}
}
export function personalNewsDiagnosticLabel(result){
 const state=result?.state||'INVALID';
 const labels={
  OK:'Соединение работает',EMPTY:'Ответ получен · подходящих свежих публикаций нет',
  NOT_CONFIGURED:'Ключ не настроен',INVALID_CREDENTIALS:'Неверный или недействующий ключ',
  FORBIDDEN_OR_LIMITED:'Доступ или тариф не разрешает запрос',
  RATE_LIMITED:'Ограничение запросов сервиса',
  DAILY_LIMIT:'Внутренний суточный лимит исчерпан',
  MONTHLY_LIMIT:'Внутренний месячный лимит исчерпан',
  WAIT_INTERVAL:'Интервал между запросами не завершён',
  CLOCK_ERROR:'Время устройства требует проверки',
  STORAGE_UNAVAILABLE:'Защищённое хранилище недоступно',
  OFFLINE:'Сервис или интернет недоступен',
  INVALID:'Ответ не соответствует ожидаемому формату',
  UNSUPPORTED:'Актив или источник не поддерживается',
  ANDROID_ONLY:'Проверка работает только в Android'
 };
 const label=labels[state]||labels.INVALID;
 if(state!=='OK')return label;
 return label+' · публикаций '+result.articleCount+
  (result.cached?' · кеш устройства':' · прямой ответ API');
}
export async function fetchPersonalNewsBundle(coin,{
 plugin=native(),now=()=>Date.now()
}={}){
 if(!COINS.has(coin))return {state:'UNSUPPORTED',articles:[],providers:{}};
 if(!plugin?.fetchPersonalNews)return {state:'ANDROID_ONLY',articles:[],providers:{}};
 let inflight=pendingBundles.get(plugin);
 if(!inflight){inflight=new Map();pendingBundles.set(plugin,inflight);}
 if(inflight.has(coin))return inflight.get(coin);
 const task=(async()=>{
 const results=await Promise.all(PROVIDERS.map(async provider=>{
  try{
   const response=await plugin.fetchPersonalNews({provider,coin});
   if(response?.state!=='OK')return {provider,state:String(response?.state||'OFFLINE').slice(0,50),articles:[]};
   const parsed=parsePersonalProvider(provider,response.raw,now());
   return {provider,...parsed};
  }catch{return {provider,state:'OFFLINE',articles:[]};}
 }));
 const providers=Object.fromEntries(results.map(x=>[x.provider,x.state]));
 const articles=consolidateArticles(results.flatMap(x=>x.articles),
  {limit:18,perDomain:2});
 return {coin,state:articles.length?'OK':'NO_VERIFIED_NEWS',
  providers,articles,scope:'NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL'};
 })();
 inflight.set(coin,task);
 try{return await task;}finally{inflight.delete(coin);}
}
