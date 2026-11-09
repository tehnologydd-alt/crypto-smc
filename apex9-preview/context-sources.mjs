/**
 * APEX 9.0 — public macro/news/BTC-chain context adapters.
 * Research metadata ONLY; no news sentiment, wallet identities, trade signals,
 * predictive probabilities or synthetic cross-asset evidence.
 * All requests are public HTTPS GET, without credentials.
 */
import {consolidateArticles} from './news-source-fusion.mjs';
const COINGECKO='https://api.coingecko.com/api/v3/global';
const MEMPOOL='https://mempool.space/api/mempool';
const GDELT='https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_ARTICLES=12;
const MAX_AGE_NEWS_MS=48*3600_000;
const MAX_GLOBAL_LAG_MS=2*3600_000;
const valid=(n)=>typeof n==='number'&&Number.isFinite(n);
const nonnegative=(n)=>valid(n)&&n>=0;
const error=(x)=>String(x?.message||x||'Network error').slice(0,160);
const fail=(state,message)=>({state,error:message,data:null});
const ok=(data)=>({state:'OK',error:null,data});
const mapName=Object.freeze({
 BTC:'Bitcoin',ETH:'Ethereum',GRAM:'Gram',SOL:'Solana',XRP:'Ripple XRP',
 ADA:'Cardano',BNB:'Binance Coin',DOGE:'Dogecoin',AVAX:'Avalanche',DOT:'Polkadot',
 LINK:'Chainlink',TRX:'Tron',LTC:'Litecoin',BCH:'Bitcoin Cash',SHIB:'Shiba Inu'
});
function getBase(symbol){
 if(typeof symbol!=='string'||!/^[A-Z0-9]{5,20}$/.test(symbol))return null;
 for(const quote of ['USDT','USDC','BTC','ETH','EUR']){
  if(symbol.endsWith(quote)&&symbol.length>quote.length)return symbol.slice(0,-quote.length);
 }
 return null;
}
export function canonicalContextAsset(symbol){
 const rawBase=getBase(symbol);
 const base=rawBase==='TON'?'GRAM':rawBase;
 return base&&Object.hasOwn(mapName,base)?{base,name:mapName[base]}:null;
}

async function publicJson(url,{fetchImpl=fetch,signal}={}){
 try{
  const res=await fetchImpl(url,{method:'GET',credentials:'omit',cache:'no-store',signal});
  if(res?.status===429||res?.status===418)return fail('RATE_LIMITED','Provider rate limited');
  if(!res?.ok)return fail('OFFLINE','HTTP '+(res?.status??'unknown'));
  const data=await res.json();
  return ok(data);
 }catch(e){
  return fail('OFFLINE',error(e));
 }
}

export function parseCryptoGlobal(raw,receivedAt){
 const data=raw?.data;
 if(!data||!Number.isSafeInteger(receivedAt))throw Error('Invalid global data');
 const usdCap=data.total_market_cap?.usd;
 const btcDominance=data.market_cap_percentage?.btc;
 const change24h=data.market_cap_change_percentage_24h_usd;
 const usdVolume=data.total_volume?.usd;
 if(!nonnegative(usdCap)||usdCap===0||!nonnegative(usdVolume)||
    !valid(btcDominance)||btcDominance<0||btcDominance>100||
    !valid(change24h)||Math.abs(change24h)>1000)throw Error('Invalid global metrics');
 const observedAt=valid(data.updated_at)&&data.updated_at>0?
  Math.round(data.updated_at*1000):null;
 if(observedAt===null)throw Error('Missing provider update time');
 if(observedAt>receivedAt+60000||receivedAt-observedAt>MAX_GLOBAL_LAG_MS)
  throw Error('Stale or future global timestamp');
 return {scope:'GLOBAL_CRYPTO_NOT_ASSET',provider:'CoinGecko',observedAt,receivedAt,
  marketCapUsd:usdCap,totalVolumeUsd:usdVolume,btcDominancePercent:btcDominance,
  marketCapChange24hPercent:change24h,notDirectionalEvidence:true};
}
export async function fetchCryptoGlobal({fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 const result=await publicJson(COINGECKO,{fetchImpl,signal});
 if(result.state!=='OK')return result;
 try{return ok(parseCryptoGlobal(result.data,now()));}
 catch(e){return fail('INVALID',error(e));}
}

export function parseBitcoinMempool(raw,receivedAt){
 if(!raw||!Number.isSafeInteger(receivedAt))throw Error('Invalid mempool response');
 const count=raw.count,vsize=raw.vsize,totalFee=raw.total_fee;
 if(!Number.isSafeInteger(count)||count<0||
    !Number.isSafeInteger(vsize)||vsize<0||
    !nonnegative(totalFee))throw Error('Invalid BTC mempool counts');
 return {scope:'BITCOIN_NETWORK_MEMPOOL',provider:'mempool.space',
  receivedAt,providerObservedAt:null,transactionCount:count,
  virtualSizeVBytes:vsize,totalFeesSats:totalFee,
  notWhaleTransfers:true,notDirectionalEvidence:true};
}
export async function fetchBitcoinMempool(symbol,{fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 if(getBase(symbol)!=='BTC')
  return fail('UNSUPPORTED','This on-chain adapter only covers Bitcoin network activity');
 const result=await publicJson(MEMPOOL,{fetchImpl,signal});
 if(result.state!=='OK')return result;
 try{return ok(parseBitcoinMempool(result.data,now()));}
 catch(e){return fail('INVALID',error(e));}
}

export function parseGdeltDate(s){
 if(typeof s!=='string'||!/^[0-9]{8}T[0-9]{6}Z$/.test(s))return null;
 const date=Date.parse(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+
  'T'+s.slice(9,11)+':'+s.slice(11,13)+':'+s.slice(13,15)+'Z');
 return Number.isFinite(date)?date:null;
}
export function parseAssetNews(raw,symbol,receivedAt){
 const asset=canonicalContextAsset(symbol);
 if(!asset)throw Error('Unsupported asset for named news search');
 if(!Number.isSafeInteger(receivedAt)||!Array.isArray(raw?.articles))
  throw Error('Malformed GDELT articles');
 const seen=new Set(),articles=[];
 for(const item of raw.articles){
  const seenAt=parseGdeltDate(item?.seendate);
  let url;
  try{url=new URL(item?.url);}catch{continue;}
  if(url.protocol!=='https:'||seen.has(url.href)||seenAt===null||
     seenAt>receivedAt+60000||receivedAt-seenAt>MAX_AGE_NEWS_MS)continue;
  const title=typeof item.title==='string'?item.title.trim().slice(0,300):'';
  if(!title)continue;
  seen.add(url.href);
  articles.push({title,url:url.href,seenAt,
   domain:typeof item.domain==='string'?item.domain.slice(0,80):url.hostname,
   language:typeof item.language==='string'?item.language.slice(0,35):'',
   provider:'GDELT',scope:'SEARCH_MATCH_NOT_SENTIMENT',
   notVerifiedCausation:true});
  if(articles.length>=MAX_ARTICLES)break;
 }
 return {scope:'SEARCH_MATCH_NOT_SENTIMENT',asset:symbol,term:asset.name,
  receivedAt,articles:consolidateArticles(articles,{limit:MAX_ARTICLES,perDomain:3}),
  notDirectionalEvidence:true};
}
export async function fetchAssetNews(symbol,{fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 const asset=canonicalContextAsset(symbol);
 if(!asset)return fail('UNSUPPORTED','No unambiguous supported news query for this asset');
 // GRAM is the native coin of the TON network, not an unrelated 'gram' keyword.
 const query=asset.base==='GRAM'?'"Gram" "TON"':'"'+asset.name+'"';
 const url=GDELT+'?query='+encodeURIComponent(query)+
  '&mode=artlist&maxrecords=15&timespan=24h&format=json&sort=datedesc';
 const response=await publicJson(url,{fetchImpl,signal});
 if(response.state!=='OK')return response;
 try{
  const data=parseAssetNews(response.data,symbol,now());
  return {...ok(data),state:data.articles.length?'OK':'EMPTY'};
 }catch(e){return fail('INVALID',error(e));}
}

/**
 * Explicit source-by-source state. It is intentionally independent of the
 * predictive evidence fusion module, until time-series validity is tested.
 */
export async function collectContext(symbol,opts={}){
 const keys=['coingecko-global','bitcoin-mempool','gdelt-news'];
 const news=typeof opts.newsGate==='function'&&canonicalContextAsset(symbol)?
  opts.newsGate(symbol,()=>fetchAssetNews(symbol,opts)):
  fetchAssetNews(symbol,opts);
 const settled=await Promise.allSettled([
  fetchCryptoGlobal(opts),fetchBitcoinMempool(symbol,opts),news
 ]);
 const sources=settled.map((r,i)=>{
  const value=r.status==='fulfilled'?r.value:fail('OFFLINE',error(r.reason));
  return {id:keys[i],...value};
 });
 return {symbol,receivedAt:(opts.now||Date.now)(),sources,
  coverage:sources.filter(x=>x.state==='OK').length,
  claim:'Context-only observations; no causal, sentiment, whale or price forecast inference'};
}
