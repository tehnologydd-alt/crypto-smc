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
  url=new URL('https://newsdata.io/api/1/latest');
  url.searchParams.set('apikey',secret);
  url.searchParams.set('qInTitle',coin==='BTC'?'Bitcoin':
   coin==='ETH'?'Ethereum':coin);
  url.searchParams.set('language','en');
 }
 return url;
}
export function normalizeProviderNews(provider,raw,now=Date.now()){
 const entries=provider==='cryptopanic'?raw?.results:raw?.results;
 if(!Array.isArray(entries))return {state:'INVALID',articles:[]};
 const articles=[];
 for(const entry of entries.slice(0,60)){
  const title=String(entry?.title||'').trim().slice(0,220);
  const href=String(entry?.url||entry?.link||'');
  const timestamp=Date.parse(provider==='cryptopanic'?entry?.published_at:
   entry?.pubDate);
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
  if(response.status===429||response.status===403)
   return {state:'RATE_LIMITED',articles:[]};
  if(!response.ok)return {state:'OFFLINE',articles:[]};
  let raw;
  try{raw=await response.json();}
  catch{return {state:'INVALID',articles:[]};}
  const result=normalizeProviderNews(provider,raw,now());
  if(result.state==='OK'||result.state==='EMPTY')
   cache.set(key,{at:now(),result});
  return result;
 }
 return {load};
}
export function startLocalGateway({gateway=createNewsGateway(),
 port=8787,host='127.0.0.1'}={}){
 if(host!=='127.0.0.1'&&host!=='::1')
  throw Error('Only loopback is allowed without authentication');
 const server=createServer(async(req,res)=>{
  const u=new URL(req.url||'/', 'http://localhost');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','null');
  if(req.method!=='GET'||u.pathname!=='/v1/news'){
   res.statusCode=404;res.end(JSON.stringify({state:'NOT_FOUND'}));return;
  }
  const r=await gateway.load(u.searchParams.get('provider'),
   u.searchParams.get('coin'));
  res.end(JSON.stringify(r));
 });
 server.listen(port,host);
 return server;
}
