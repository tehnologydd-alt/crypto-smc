/**
 * Public Bluesky AppView search (no credentials). User-generated text is
 * unverified and NOT a trade/sentiment signal or an endorsed source.
 */
import {canonicalContextAsset} from './context-sources.mjs';
const BASE='https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';
const SEARCH=Object.freeze({
 BTC:'Bitcoin',ETH:'Ethereum',SOL:'Solana',XRP:'XRP',BNB:'BNB',
 ADA:'Cardano',DOGE:'Dogecoin',AVAX:'Avalanche',LINK:'Chainlink',
 DOT:'Polkadot',GRAM:'Toncoin',LTC:'Litecoin',BCH:'Bitcoin Cash',
 TRX:'TRON blockchain',SHIB:'Shiba Inu'
});
export function socialQuery(symbol){
 const asset=canonicalContextAsset(symbol);
 return asset&&SEARCH[asset.base]||null;
}
export function parseBlueskyPosts(payload,{symbol,receivedAt=Date.now()}={}){
 if(!socialQuery(symbol)||!Number.isSafeInteger(receivedAt)||
  !Array.isArray(payload?.posts)||payload.posts.length>100)
  return {state:'INVALID',posts:[],reason:'Malformed public search response'};
 const out=[],seen=new Set();
 for(const p of payload.posts){
  const handle=p?.author?.handle;
  const uri=p?.uri;
  const m=/^at:\/\/did:[a-z0-9:.-]+\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/.exec(uri||'');
  const text=typeof p?.record?.text==='string'?p.record.text.trim().slice(0,280):'';
  const stamp=Date.parse(p?.indexedAt||'');
  if(!m||typeof handle!=='string'||!/^[a-zA-Z0-9.-]{3,100}$/.test(handle)||
   !text||!Number.isFinite(stamp)||stamp>receivedAt+60000||
   receivedAt-stamp>24*3600000||seen.has(uri))continue;
  // This is a search-match, not a vetted fact, source authority or polarity.
  seen.add(uri);
  out.push({author:handle,text,indexedAt:stamp,
   href:'https://bsky.app/profile/'+encodeURIComponent(handle)+'/post/'+m[1],
   scope:'PUBLIC_USER_POST_UNVERIFIED',notDirectionalEvidence:true});
  if(out.length===6)break;
 }
 return {state:out.length?'OK':'EMPTY',posts:out,receivedAt,
  scope:'PUBLIC_POST_SEARCH_NOT_SENTIMENT',notDirectionalEvidence:true};
}
export async function fetchBlueskyPosts(symbol,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const q=socialQuery(symbol);
 if(!q)return {state:'UNSUPPORTED',posts:[],reason:'No unambiguous asset search term'};
 const url=BASE+'?'+new URLSearchParams({q,limit:'15',sort:'latest'}).toString();
 try{
  const r=await fetchImpl(url,{method:'GET',credentials:'omit',cache:'no-store',signal});
  if(r?.status===429||r?.status===418)return {state:'RATE_LIMITED',posts:[]};
  if(!r?.ok)return {state:'OFFLINE',posts:[],reason:'Bluesky HTTP '+(r?.status||'?')};
  return parseBlueskyPosts(await r.json(),{symbol,receivedAt:now()});
 }catch(e){return {state:'OFFLINE',posts:[],
  reason:String(e?.message||e).slice(0,140)};}
}
