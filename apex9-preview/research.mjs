/**
 * APEX 9.0 research preview: public, read-only collection for one spot asset.
 * No execution paths, no private API data, no fabricated metrics.
 */
import {fetchPublicDepth} from '../updates/v90-market-depth.mjs';
import {summarizeEvidence} from '../updates/v90-evidence.mjs';

const BASE='https://data-api.binance.vision';
const LIMIT_MS=180000;
const errorText=(error)=>String(error?.message||error||'unknown').slice(0,180);
const bounded=(x)=>Math.max(0,Math.min(1,x));
const finiteNumber=(value)=>typeof value==='number'?value:Number(value);

export function normalizeSymbol(input){
 const raw=typeof input==='string'?input.toUpperCase().trim().replace(/[\s/_-]/g,''):'';
 if(!/^[A-Z0-9]{2,20}$/.test(raw))return null;
 if(/(USDT|USDC|BTC|ETH|EUR)$/.test(raw))return raw;
 return raw.length<=15?raw+'USDT':null;
}

export function parseTicker(data,symbol,receivedAt){
 if(!data||data.symbol!==symbol)throw Error('Unexpected ticker symbol');
 const price=finiteNumber(data.lastPrice),changePercent=finiteNumber(data.priceChangePercent);
 const quoteVolume=finiteNumber(data.quoteVolume),closeTime=finiteNumber(data.closeTime);
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(changePercent)||
    !Number.isFinite(quoteVolume)||quoteVolume<0||
    !Number.isSafeInteger(closeTime)||closeTime<=0)throw Error('Malformed ticker fields');
 if(closeTime>receivedAt+60000)throw Error('Ticker timestamp is in the future');
 if(receivedAt-closeTime>LIMIT_MS)throw Error('Ticker is stale');
 return {symbol,venue:'binance',price,changePercent,quoteVolume,observedAt:closeTime,
  receivedAt,scope:'24H_SPOT_SNAPSHOT'};
}

export async function fetchSpotCatalog({fetchImpl=fetch}={}){
 try{
  const response=await fetchImpl(BASE+'/api/v3/exchangeInfo',
   {method:'GET',cache:'no-store',credentials:'omit'});
  if(response.status===429||response.status===418)
   return {state:'RATE_LIMITED',symbols:[],error:'Rate limit'};
  if(!response.ok)return {state:'OFFLINE',symbols:[],error:'HTTP '+response.status};
  const payload=await response.json();
  if(!Array.isArray(payload?.symbols))throw Error('Invalid exchangeInfo');
  const symbols=payload.symbols.filter(x=>x&&x.quoteAsset==='USDT'&&
    x.status==='TRADING'&&x.isSpotTradingAllowed!==false&&
    typeof x.symbol==='string'&&/^[A-Z0-9]{5,20}$/.test(x.symbol))
    .map(x=>x.symbol).sort();
  return {state:'OK',symbols:[...new Set(symbols)],error:null};
 }catch(error){return {state:'OFFLINE',symbols:[],error:errorText(error)};}
}

export async function fetchSpotTicker(symbol,{fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 if(!/^[A-Z0-9]{5,20}$/.test(symbol))
  return {state:'INVALID',data:null,error:'Invalid symbol'};
 try{
  const response=await fetchImpl(BASE+'/api/v3/ticker/24hr?symbol='+encodeURIComponent(symbol),
   {method:'GET',cache:'no-store',credentials:'omit',signal});
  if(response.status===429||response.status===418)
   return {state:'RATE_LIMITED',data:null,error:'Rate limit'};
  if(!response.ok)return {state:'OFFLINE',data:null,error:'HTTP '+response.status};
  const payload=await response.json();
  const stamp=now();
  try{return {state:'OK',data:parseTicker(payload,symbol,stamp),error:null};}
  catch(error){
   const reason=errorText(error);
   return {state:reason.includes('stale')?'STALE':'INVALID',data:null,error:reason};
  }
 }catch(error){return {state:'OFFLINE',data:null,error:errorText(error)};}
}

export function depthEvidence(book){
 if(!book||book.sampleScope!=='LIMITED_PUBLIC_SNAPSHOT')return null;
 const v=book.visibleDepthImbalance;
 if(!Number.isFinite(v)||v< -1||v>1)return null;
 return {
  id:'depth:'+book.venue+':'+book.symbol+':'+book.receivedAt,
  asset:book.symbol,layer:'liquidity',source:book.venue+' visible spot order book',
  sourceGroup:book.venue+'-spot-depth',observedAt:book.receivedAt,ingestedAt:book.receivedAt,
  polarity:v>0.12?1:v< -0.12?-1:0,intensity:bounded(Math.abs(v)),
  reliability:0.3,ttlMs:300000,
  note:'Visible limited depth only; spoofing, cancellations and hidden liquidity unknown.'
 };
}

export function tickerEvidence(ticker){
 if(!ticker||ticker.scope!=='24H_SPOT_SNAPSHOT')return null;
 const v=ticker.changePercent;
 if(!Number.isFinite(v))return null;
 return {
  id:'ticker:'+ticker.symbol+':'+ticker.observedAt,
  asset:ticker.symbol,layer:'market',source:'Binance spot 24h ticker',
  sourceGroup:'binance-spot-24h',observedAt:ticker.observedAt,ingestedAt:ticker.receivedAt,
  polarity:v>0.15?1:v< -0.15?-1:0,intensity:bounded(Math.abs(v)/10),
  reliability:0.35,ttlMs:180000,
  note:'Past 24h price change is context, not a future directional forecast.'
 };
}

/** One coherent snapshot; all adapters settle even when individual sources fail. */
export async function collectAsset(symbol,{fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 const code=normalizeSymbol(symbol);
 if(!code)return {symbol:null,sources:[],ticker:null,depth:[],evidence:[],
  assessment:summarizeEvidence([],symbol,now()),collectedAt:now()};
 const jobs=[
  fetchSpotTicker(code,{fetchImpl,now,signal}),
  fetchPublicDepth('binance',code,{fetchImpl,now,signal}),
  fetchPublicDepth('bybit',code,{fetchImpl,now,signal})
 ];
 const settled=await Promise.allSettled(jobs);
 const names=['binance-ticker','binance-depth','bybit-depth'];
 const sources=settled.map((result,i)=>{
  const item=result.status==='fulfilled'?result.value:
   {state:'OFFLINE',data:null,error:errorText(result.reason)};
  return {id:names[i],state:item.state,data:item.data??null,error:item.error??null};
 });
 const ticker=sources[0].state==='OK'?sources[0].data:null;
 const depth=sources.slice(1).filter(x=>x.state==='OK').map(x=>x.data);
 const evidence=[tickerEvidence(ticker),...depth.map(depthEvidence)].filter(Boolean);
 const collectedAt=now();
 return {symbol:code,ticker,depth,sources,evidence,collectedAt,
  assessment:summarizeEvidence(evidence,code,collectedAt)};
}
