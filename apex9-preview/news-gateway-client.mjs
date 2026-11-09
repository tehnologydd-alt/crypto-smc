/**
 * APEX read-only, same-origin HTTPS news gateway client.
 * Disabled by default. No vendor API credentials or configurable arbitrary URLs.
 * Production must serve this endpoint behind authenticated HTTPS on the SAME
 * origin as the web application. Android WebView does not enable it by default.
 */
import {consolidateArticles} from './news-source-fusion.mjs';
const COINS=new Set(['BTC','ETH','SOL','XRP','ADA','BNB','DOGE','LTC']);
export function parseNewsBundle(payload,{coin,now=Date.now()}={}){
 if(!COINS.has(coin)||payload?.coin!==coin||
  payload?.sourceScope!=='NEWS_CONTEXT_ONLY_NOT_TRADE_SIGNAL'||
  !['OK','NO_VERIFIED_NEWS'].includes(payload?.state)||
  !payload.providers||typeof payload.providers!=='object'||
  !Array.isArray(payload.articles)||payload.articles.length>50)
  return {state:'INVALID',articles:[]};
 const providers={};
 for(const key of ['cryptopanic','newsdata']){
  const state=payload.providers[key];
  if(typeof state!=='string'||state.length>50)return {state:'INVALID',articles:[]};
  providers[key]=state;
 }
 const input=payload.articles.filter(a=>
  Number.isSafeInteger(a?.observedAt)&&a.observedAt<=now+60000&&
  a.observedAt>=now-48*3600000&&
  ['CryptoPanic','NewsData.io'].includes(a?.source)&&
  a?.notDirectionalEvidence===true);
 const articles=consolidateArticles(input,{limit:18,perDomain:2});
 return {state:articles.length?'OK':'EMPTY',coin,providers,articles,
  scope:'CONTEXT_ONLY_NOT_PRICE_SIGNAL'};
}
export async function fetchNewsBundle(coin,{
 enabled=false,location=null,fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 if(!enabled)return {state:'NOT_CONFIGURED',articles:[]};
 if(!COINS.has(coin))return {state:'UNSUPPORTED',articles:[]};
 let base;
 try{
  if(location?.protocol!=='https:'||!location?.origin||
    !/^https:\/\//.test(location.origin))return {state:'INSECURE_ORIGIN',articles:[]};
  base=new URL('/v1/bundle?coin='+encodeURIComponent(coin),location.origin);
  if(base.origin!==location.origin)return {state:'INSECURE_ORIGIN',articles:[]};
 }catch{return {state:'INSECURE_ORIGIN',articles:[]};}
 try{
  const response=await fetchImpl(base.href,{
   method:'GET',credentials:'same-origin',redirect:'error',
   cache:'no-store',signal,headers:{Accept:'application/json'}
  });
  if(response?.status===401||response?.status===403)
   return {state:'AUTH_REQUIRED',articles:[]};
  if(response?.status===429)return {state:'RATE_LIMITED',articles:[]};
  if(!response?.ok)return {state:'OFFLINE',articles:[]};
  return parseNewsBundle(await response.json(),{coin,now:now()});
 }catch{return {state:'OFFLINE',articles:[]};}
}
