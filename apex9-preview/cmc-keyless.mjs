/**
 * CoinMarketCap keyless public endpoint (no key, no account).
 * Use fixed CMC asset IDs; never infer identity from duplicate tickers.
 * Read-only USD market aggregate; not a venue execution price.
 */
const URL_ROOT='https://pro-api.coinmarketcap.com/public-api/v2/simple/price';
export const CMC_ASSETS=Object.freeze({
 BTCUSDT:Object.freeze({id:1,symbol:'BTC',slug:'bitcoin'}),
 ETHUSDT:Object.freeze({id:1027,symbol:'ETH',slug:'ethereum'}),
 SOLUSDT:Object.freeze({id:5426,symbol:'SOL',slug:'solana'}),
 XRPUSDT:Object.freeze({id:52,symbol:'XRP',slug:'xrp'}),
 ADAUSDT:Object.freeze({id:2010,symbol:'ADA',slug:'cardano'}),
 BNBUSDT:Object.freeze({id:1839,symbol:'BNB',slug:'bnb'}),
 DOGEUSDT:Object.freeze({id:74,symbol:'DOGE',slug:'dogecoin'}),
 LTCUSDT:Object.freeze({id:2,symbol:'LTC',slug:'litecoin'})
});
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<1e14;
const nonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<1e16;
export function cmcKeylessUrl(symbol){
 const asset=CMC_ASSETS[symbol];if(!asset)return null;
 const u=new URL(URL_ROOT);
 u.searchParams.set('id',String(asset.id));
 u.searchParams.set('convert','USD');
 u.searchParams.set('include_all','true');
 return u.href;
}
export function parseCmcKeyless(raw,{symbol,now=Date.now()}={}){
 const asset=CMC_ASSETS[symbol];
 if(!asset)return {state:'UNSUPPORTED'};
 if(!raw||!['0',0].includes(raw.status?.error_code)||
   !Array.isArray(raw.data)||raw.data.length!==1)
  return {state:'INVALID',reason:'CMC status or asset list invalid'};
 const x=raw.data[0];
 const q=Array.isArray(x?.quotes)&&x.quotes.length===1?x.quotes[0]:null;
 const t=Date.parse(q?.last_updated||'');
 if(x?.id!==asset.id||x.symbol!==asset.symbol||x.slug!==asset.slug||
  q?.symbol!=='USD'||!positive(q.price)||
  !nonnegative(q.market_cap)||!nonnegative(q.volume_24h)||
  typeof q.percent_change_24h!=='number'||!Number.isFinite(q.percent_change_24h)||
  Math.abs(q.percent_change_24h)>1000||!Number.isSafeInteger(t)||
  t>now+60000||now-t>2*3600000)
  return {state:'INVALID',reason:'CMC asset identity, numeric value or freshness invalid'};
 return {state:'OK',data:{symbol,priceUsd:q.price,
  marketCapUsd:q.market_cap,volume24hUsd:q.volume_24h,
  change24hPercent:q.percent_change_24h,observedAt:t,
  provider:'CoinMarketCap Keyless',
  scope:'USD_ASSET_AGGREGATE_NOT_SPOT_OR_DEX',
  notDirectionalEvidence:true}};
}
export async function fetchCmcKeyless(symbol,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const url=cmcKeylessUrl(symbol);
 if(!url)return {state:'UNSUPPORTED',reason:'No verified CMC asset ID'};
 try{
  const r=await fetchImpl(url,{method:'GET',credentials:'omit',
   cache:'no-store',signal,headers:{Accept:'application/json'}});
  if(r?.status===429)return {state:'RATE_LIMITED'};
  if(!r?.ok)return {state:'OFFLINE',reason:'CMC HTTP '+(r?.status||'?')};
  return parseCmcKeyless(await r.json(),{symbol,now:now()});
 }catch(e){return {state:'OFFLINE',
  reason:String(e?.message||e||'Network unavailable').slice(0,100)};}
}
