/**
 * APEX key-protected news gateway, Node 22+, single local process.
 * No automatic background polling. Never expose API credentials to WebView.
 * Defaults to localhost; for public deployment add authentication and shared
 * atomic rate limiting. Limits below are conservative local budgets, not claims
 * about the vendor's current plan.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {consolidateArticles} from '../apex9-preview/news-source-fusion.mjs';
const POLICY=Object.freeze({
 cryptopanic:{daily:4,monthly:100,gap:6*3600000},
 newsdata:{daily:4,monthly:100,gap:6*3600000}
});
const CONFIG=Object.freeze({
 cryptopanic:{env:'APEX_CRYPTOPANIC_TOKEN'},
 newsdata:{env:'APEX_NEWSDATA_KEY'}
});
const validCoin=/^(BTC|ETH|SOL|XRP|ADA|BNB|DOGE|LTC)$/;
const day=at=>new Date(at).toISOString().slice(0,10);
const month=at=>new Date(at).toISOString().slice(0,7);
export function providerRequest(provider,coin,secret){
 if(!CONFIG[provider]||!validCoin.test(coin)||typeof secret!=='string'||!secret.trim())
  return null;
 let url;
 if(provider==='cryptopanic'){
  url=new URL('https://cryptopanic.com/api/developer/v2/posts/');
  url.searchParams.set('auth_token',secret);
  url.searchParams.set('public','true');
  url.searchParams.set('currencies',coin);
  url.searchParams.set('kind','news');
 }else{
  url=new URL('https://newsdata.io/api/1/crypto');
  url.searchParams.set('apikey',secret);
  url.searchParams.set('coin',coin.toLowerCase());
  url.searchParams.set('language','en');
  url.searchParams.set('timezone','Etc/UTC');
  url.searchParams.set('timeframe','48');
  url.searchParams.set('removeduplicate','1');
 }
 return url;
}
/** NewsData.io may return a timezone-naive pubDate when the request
 * explicitly selects Etc/UTC. Interpret ONLY that documented response
 * shape as UTC; reject unknown date formats instead of guessing. */
export function parseProviderPublicationDate(value,provider){
 if(typeof value!=='string'||value.length>48)return NaN;
 let date=value.trim();
 if(provider==='newsdata'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(date))
  date=date.replace(' ','T')+'Z';
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(date))
  return NaN;
 return Date.parse(date);
}
export function normalizeProviderNews(provider,raw,now=Date.now()){
 const entries=raw?.results;
 if(!Array.isArray(entries))return {state:'INVALID',articles:[]};
 const articles=[];
 for(const entry of entries.slice(0,60)){
  const title=String(entry?.title||'').trim().slice(0,220);
  // Link to the original publisher, not the aggregator's copy, when supplied.
  const href=String(provider==='cryptopanic'?
   (entry?.original_url||entry?.url||''):(entry?.link||entry?.url||''));
  const timestamp=parseProviderPublicationDate(provider==='cryptopanic'?
   entry?.published_at:entry?.pubDate,provider);
  let url;
  try{url=new URL(href);}catch{continue;}
  if(url.protocol!=='https:'||url.username||url.password||
   !Number.isFinite(timestamp)||timestamp>now+60000||
   now-timestamp>48*3600000||title.length<10)continue;
  articles.push({title,href:url.href,observedAt:timestamp,source:
   provider==='cryptopanic'?'CryptoPanic':'NewsData.io',
   domain:url.hostname,notDirectionalEvidence:true});
 }
 return {state:articles.length?'OK':'EMPTY',articles};
}
function readLedger(file){
 try{return JSON.parse(readFileSync(file,'utf8'));}catch(e){
  if(e.code==='ENOENT')return {};
  throw e;
 }
}
function saveLedger(file,value){
 const temp=file+'.tmp';
 writeFileSync(temp,JSON.stringify(value),{mode:0o600});
 renameSync(temp,file);
}
export function createNewsGateway({
 env=process.env,fetchImpl=fetch,now=()=>Date.now(),
 ledgerFile=resolve(process.cwd(),'.apex-news-gateway-ledger.json')
}={}){
 let busy=false;
 const cache=new Map();
 async function load(provider,coin){
  if(!CONFIG[provider]||!validCoin.test(coin))return {state:'INVALID'};
  const secret=env[CONFIG[provider].env];
  if(!secret)return {state:'NOT_CONFIGURED',articles:[]};
  const at=now(),p=POLICY[provider],key=provider+':'+coin;
  const previous=cache.get(key);
  if(previous&&at-previous.at<6*3600000)
   return {...previous.result,source:'CACHE'};
  // Reserve synchronously, ahead of HTTP. Fail closed if ledger unavailable.
  if(busy)return {state:'BUSY',articles:[]};
  busy=true;
  try{
   let data;
   try{data=readLedger(ledgerFile);}catch{return {state:'STORAGE_UNAVAILABLE',articles:[]};}
   const prev=data[provider]||{};
   if(prev.last>at+60000)return {state:'CLOCK_ERROR',articles:[]};
   const daily=prev.day===day(at)?prev.daily||0:0;
   const monthly=prev.month===month(at)?prev.monthly||0:0;
   if(daily>=p.daily||monthly>=p.monthly)return {state:'LIMIT_REACHED',articles:[]};
   if(prev.last&&at-prev.last<p.gap)return {state:'WAIT_INTERVAL',articles:[]};
   data[provider]={day:day(at),month:month(at),daily:daily+1,
    monthly:monthly+1,last:at};
   try{saveLedger(ledgerFile,data);}
   catch{return {state:'STORAGE_UNAVAILABLE',articles:[]};}
  }finally{busy=false;}
  const url=providerRequest(provider,coin,secret);
  let response;
  try{
   response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',
    signal:AbortSignal.timeout(8500)});
  }catch{return {state:'OFFLINE',articles:[]};}
  if(response.status===401)return {state:'INVALID_CREDENTIALS',articles:[]};
  if(response.status===403)return {state:'FORBIDDEN_OR_LIMITED',articles:[]};
  if(response.status===429)return {state:'RATE_LIMITED',articles:[]};
  if(!response.ok)return {state:'OFFLINE',articles:[]};
  let raw;
  try{raw=await response.json();}
  catch{return {state:'INVALID',articles:[]};}
  const result=normalizeProviderNews(provider,raw,now());
  if(result.state==='OK'||result.state==='EMPTY')
   cache.set(key,{at:now(),result});
  return result;
 }

 function status(){
  const providers={};
  let ledger;
  try{ledger=readLedger(ledgerFile);}catch{
   for(const key of Object.keys(POLICY))providers[key]={state:'STORAGE_UNAVAILABLE'};
   return {state:'STORAGE_UNAVAILABLE',providers};
  }
  const at=now();
  for(const [key,p] of Object.entries(POLICY)){
   const previous=ledger[key]||{};
   const daily=previous.day===day(at)?previous.daily||0:0;
   const monthly=previous.month===month(at)?previous.monthly||0:0;
   const configured=Boolean(env[CONFIG[key].env]);
   providers[key]={state:configured?'READY_TO_REQUEST':'NOT_CONFIGURED',
    configured,dayRemaining:Math.max(0,p.daily-daily),
    monthRemaining:Math.max(0,p.monthly-monthly),
    nextAt:previous.last?previous.last+p.gap:0};
  }
  return {state:'OK',providers,scope:'LOCAL_ONLY_NOT_PUBLIC_APK'};
 }
 async function bundle(coin){
  if(!validCoin.test(coin||''))return {state:'INVALID',articles:[],providers:{}};
  const names=['cryptopanic','newsdata'];
  const [crypto,news]=await Promise.all(names.map(id=>load(id,coin)));
  const providers={cryptopanic:crypto.state,newsdata:news.state};
  const sourceArticles=[...(crypto.articles||[]),...(news.articles||[])];
  const articles=consolidateArticles(sourceArticles,{limit:18,perDomain:3});
  return {state:articles.length?'OK':'NO_VERIFIED_NEWS',
   coin,articles,providers,coverage:names.filter(id=>providers[id]==='OK').length,
   sourceScope:'NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL'};
 }
 return {load,status,bundle};
}
export function startLocalGateway({gateway=createNewsGateway(),
 port=8787,host='127.0.0.1',proxyOrigin=null}={}){
 if(host!=='127.0.0.1'&&host!=='::1')
  throw Error('Only loopback is allowed without authentication');
 if(proxyOrigin!==null){
  let parsed;
  try{parsed=new URL(proxyOrigin);}catch{throw Error('Invalid HTTPS proxy origin');}
  if(parsed.protocol!=='https:'||parsed.origin!==proxyOrigin||
     parsed.username||parsed.password||parsed.search||parsed.hash)
   throw Error('Invalid HTTPS proxy origin');
 }
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  // Loopback only; a remote Android connection needs authenticated HTTPS.
  const hostHeader=String(req.headers.host||'');
  const portText=String(server.address()?.port||port);
  const permittedHosts=new Set(['127.0.0.1:'+portText,
   'localhost:'+portText,'[::1]:'+portText]);
  const origin=String(req.headers.origin||'');
  const fetchSite=String(req.headers['sec-fetch-site']||'');
  const allowedOrigins=[
   'http://127.0.0.1:'+portText,
   'http://localhost:'+portText,'http://[::1]:'+portText];
  if(proxyOrigin)allowedOrigins.push(proxyOrigin);
  if(!permittedHosts.has(hostHeader)||
    (origin&&!allowedOrigins.includes(origin))||
    (fetchSite&&!['same-origin','none'].includes(fetchSite))){
   res.statusCode=403;res.end(JSON.stringify({state:'FORBIDDEN'}));return;
  }
  let u;
  try{u=new URL(req.url||'/', 'http://localhost');}
  catch{res.statusCode=400;res.end(JSON.stringify({state:'INVALID'}));return;}
  if(req.method!=='GET'){
   res.statusCode=405;res.end(JSON.stringify({state:'METHOD_NOT_ALLOWED'}));return;
  }
  try{
   let result;
   if(u.pathname==='/v1/status')result=gateway.status();
   else if(u.pathname==='/v1/news')result=await gateway.load(
    u.searchParams.get('provider'),u.searchParams.get('coin'));
   else if(u.pathname==='/v1/bundle')result=await gateway.bundle(
    u.searchParams.get('coin'));
   else{
    res.statusCode=404;result={state:'NOT_FOUND'};
   }
   res.end(JSON.stringify(result));
  }catch{
   res.statusCode=503;res.end(JSON.stringify({state:'GATEWAY_UNAVAILABLE'}));
  }
 });
 server.listen(port,host);
 return server;
}
