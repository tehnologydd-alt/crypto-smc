/**
 * APEX single-user Cloudflare pilot.
 * Same-origin static web + authenticated read-only news API.
 * D1 owns atomic provider quotas and cached sanitized results.
 * Never expose vendor tokens or make trades.
 */
import {providerRequest,normalizeProviderNews} from '../apex9-news-gateway/provider-core.mjs';
import {consolidateArticles} from '../apex9-preview/news-source-fusion.mjs';
const COINS=/^(BTC|ETH|SOL|XRP|ADA|BNB|DOGE|LTC)$/;
const KEYS=Object.freeze({
 cryptopanic:'APEX_CRYPTOPANIC_TOKEN',
 newsdata:'APEX_NEWSDATA_KEY'
});
const SIX_HOURS=6*60*60*1000;
const MAX_DAY=4,MAX_MONTH=100;
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',...extra}});
const day=at=>new Date(at).toISOString().slice(0,10);
const month=at=>new Date(at).toISOString().slice(0,7);

async function sameSecret(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!b||
    a.length>512||b.length>512)return false;
 // Hash and compare fixed length so differing input lengths are not exposed.
 const enc=new TextEncoder();
 const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),
  crypto.subtle.digest('SHA-256',enc.encode(b))]);
 let diff=0;
 const u=new Uint8Array(x),v=new Uint8Array(y);
 for(let i=0;i<u.length;i++)diff|=u[i]^v[i];
 return diff===0;
}
export async function authorized(request,env){
 if(!env?.APEX_SITE_USER||!env?.APEX_SITE_PASSWORD)return false;
 const header=request.headers.get('Authorization')||'';
 if(!header.startsWith('Basic ')||header.length>700)return false;
 let decoded;
 try{decoded=atob(header.slice(6));}catch{return false;}
 const index=decoded.indexOf(':');
 if(index<1)return false;
 return (await sameSecret(decoded.slice(0,index),env.APEX_SITE_USER))&&
  (await sameSecret(decoded.slice(index+1),env.APEX_SITE_PASSWORD));
}
const notAllowed=request=>{
 const origin=new URL(request.url).origin;
 const from=request.headers.get('Origin');
 const site=request.headers.get('Sec-Fetch-Site');
 return (from!==null&&from!==origin)||
  (site!==null&&!['same-origin','none'].includes(site));
};
async function readQuota(db,key,at){
 const row=await db.prepare('SELECT day_key, day_used, month_key, month_used, last_at FROM news_quota WHERE provider=?')
  .bind(key).first();
 const usedDay=row?.day_key===day(at)?row.day_used:0;
 const usedMonth=row?.month_key===month(at)?row.month_used:0;
 return {usedDay,usedMonth,nextAt:row?.last_at?row.last_at+SIX_HOURS:0};
}
export async function reserveQuota(db,key,at){
 // One SQLite statement atomically reserves a counted outbound attempt.
 // If any limit is reached or storage is unavailable, fail closed.
 const stmt=`INSERT INTO news_quota
  (provider,day_key,day_used,month_key,month_used,last_at)
 VALUES (?1,?2,1,?3,1,?4)
 ON CONFLICT(provider) DO UPDATE SET
  day_key=excluded.day_key,
  day_used=CASE WHEN news_quota.day_key=excluded.day_key
   THEN news_quota.day_used+1 ELSE 1 END,
  month_key=excluded.month_key,
  month_used=CASE WHEN news_quota.month_key=excluded.month_key
   THEN news_quota.month_used+1 ELSE 1 END,
  last_at=excluded.last_at
 WHERE excluded.last_at>=news_quota.last_at+?5
  AND (news_quota.day_key<>excluded.day_key OR news_quota.day_used<?6)
  AND (news_quota.month_key<>excluded.month_key OR news_quota.month_used<?7)
 RETURNING provider`;
 const saved=await db.prepare(stmt).bind(key,day(at),month(at),at,
  SIX_HOURS,MAX_DAY,MAX_MONTH).first();
 return Boolean(saved);
}
async function loadFromCache(db,provider,coin,at){
 const item=await db.prepare('SELECT stored_at, payload FROM news_cache WHERE provider=? AND coin=?')
  .bind(provider,coin).first();
 if(!item)return null;
 const age=at-item.stored_at;
 if(age<0||age>48*3600000)return null;
 let payload;
 try{payload=JSON.parse(item.payload);}catch{return null;}
 if(!Array.isArray(payload)||payload.length>60)return null;
 return {state:age<SIX_HOURS?'CACHED':'STALE',articles:payload};
}
async function providerNews(provider,coin,env,at,fetchImpl){
 const secret=env[KEYS[provider]];
 if(!secret)return {state:'NOT_CONFIGURED',articles:[]};
 let cached;
 try{cached=await loadFromCache(env.DB,provider,coin,at);}
 catch{return {state:'STORAGE_UNAVAILABLE',articles:[]};}
 if(cached?.state==='CACHED')return cached;
 let reserved=false;
 try{reserved=await reserveQuota(env.DB,provider,at);}
 catch{return {state:'STORAGE_UNAVAILABLE',articles:cached?.articles||[]};}
 if(!reserved)return {state:'WAIT_OR_LIMIT',articles:cached?.articles||[]};
 const url=providerRequest(provider,coin,secret);
 let response;
 try{
  response=await fetchImpl(url.href,{redirect:'error',method:'GET',
   signal:AbortSignal.timeout(8500)});
 }catch{return {state:'OFFLINE',articles:cached?.articles||[]};}
 if(response.status===401)return {state:'INVALID_CREDENTIALS',articles:[]};
 if(response.status===403)return {state:'FORBIDDEN_OR_LIMITED',articles:[]};
 if(response.status===429)return {state:'RATE_LIMITED',articles:[]};
 if(!response.ok)return {state:'OFFLINE',articles:cached?.articles||[]};
 let parsed;
 try{parsed=normalizeProviderNews(provider,await response.json(),at);}
 catch{return {state:'INVALID',articles:[]};}
 if(!['OK','EMPTY'].includes(parsed.state))return parsed;
 const articles=consolidateArticles(parsed.articles,{limit:30,perDomain:5});
 try{
  await env.DB.prepare(`INSERT INTO news_cache (provider,coin,stored_at,payload)
   VALUES(?,?,?,?)
   ON CONFLICT(provider,coin) DO UPDATE SET stored_at=excluded.stored_at,
    payload=excluded.payload`).bind(provider,coin,at,JSON.stringify(articles)).run();
 }catch{
  // We already reserved the upstream attempt: never repeat on failed storage.
  return {state:'CACHE_WRITE_ERROR',articles};
 }
 return {state:parsed.state,articles};
}
export async function newsResponse(coin,env,{
 at=Date.now(),fetchImpl=fetch
}={}){
 if(!COINS.test(coin||''))return {state:'INVALID',articles:[],providers:{}};
 if(!env?.DB)return {state:'STORAGE_UNAVAILABLE',articles:[],providers:{}};
 const ids=['cryptopanic','newsdata'];
 const results=await Promise.all(ids.map(p=>providerNews(p,coin,env,at,fetchImpl)));
 const providers=Object.fromEntries(ids.map((p,i)=>[p,results[i].state]));
 const articles=consolidateArticles(results.flatMap(r=>r.articles||[]),
  {limit:18,perDomain:2});
 return {state:articles.length?'OK':'NO_VERIFIED_NEWS',coin,
  articles,providers,coverage:ids.filter((_,i)=>results[i].state==='OK').length,
  sourceScope:'NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL'};
}
export async function statusResponse(env,{at=Date.now()}={}){
 if(!env?.DB)return {state:'STORAGE_UNAVAILABLE',providers:{}};
 const providers={};
 for(const id of Object.keys(KEYS)){
  if(!env[KEYS[id]]){
   providers[id]={state:'NOT_CONFIGURED',configured:false};
   continue;
  }
  try{
   const q=await readQuota(env.DB,id,at);
   providers[id]={state:'READY',configured:true,
    dayRemaining:Math.max(0,MAX_DAY-q.usedDay),
    monthRemaining:Math.max(0,MAX_MONTH-q.usedMonth),
    nextAt:q.nextAt};
  }catch{providers[id]={state:'STORAGE_UNAVAILABLE'};}
 }
 return {state:'OK',providers,scope:'SINGLE_USER_CLOUDFLARE_PILOT'};
}
export default {
 async fetch(request,env){
  const u=new URL(request.url);
  const secure={'X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer',
   'X-Frame-Options':'DENY','Cache-Control':'no-store'};
  if(u.protocol!=='https:')return json({state:'HTTPS_REQUIRED'},403);
  if(!await authorized(request,env))
   return json({state:'AUTH_REQUIRED'},401,{
    ...secure,'WWW-Authenticate':'Basic realm="APEX Research", charset="UTF-8"'});
  if(notAllowed(request))return json({state:'FORBIDDEN'},403,secure);
  if(!['GET','HEAD'].includes(request.method))
   return json({state:'METHOD_NOT_ALLOWED'},405,secure);
  if(u.pathname.startsWith('/v1/')){
   if(request.method!=='GET')return json({state:'METHOD_NOT_ALLOWED'},405,secure);
   try{
    if(u.pathname==='/v1/status')return json(await statusResponse(env),200,secure);
    if(u.pathname==='/v1/bundle')return json(
     await newsResponse(u.searchParams.get('coin'),env),200,secure);
    return json({state:'NOT_FOUND'},404,secure);
   }catch{return json({state:'GATEWAY_UNAVAILABLE'},503,secure);}
  }
  if(!env?.ASSETS)return json({state:'ASSETS_UNAVAILABLE'},503,secure);
  const response=await env.ASSETS.fetch(request);
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(secure))headers.set(key,value);
  return new Response(response.body,{status:response.status,headers});
 }
};
