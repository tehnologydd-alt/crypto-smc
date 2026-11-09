/** No-key evidence adapters. No orders, wallets, or account data.
 * DEX requires an exact prechecked network and token contract.
 */
export const FREE_ENDPOINTS=Object.freeze({
 fear:'https://api.alternative.me/fng/?limit=1&format=json',
 dex:'https://api.dexscreener.com',
 gecko:'https://api.geckoterminal.com/api/v2',
 okx:'https://www.okx.com/api/v5/market/ticker',
 paprika:'https://api.coinpaprika.com/v1/tickers'
});
const mapped=Object.freeze({
 ETHUSDT:Object.freeze({chain:'ethereum',geckoNetwork:'eth',
  address:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  label:'WETH · Ethereum (wrapped token)'}),
 SOLUSDT:Object.freeze({chain:'solana',geckoNetwork:'solana',
  address:'So11111111111111111111111111111111111111112',
  label:'WSOL · Solana (wrapped token)'})
});
export const dexTokenReference=symbol=>mapped[symbol]||null;
const num=x=>(typeof x==='number'||typeof x==='string')&&
 String(x).trim()!==''&&/^\d+(\.\d+)?$/.test(String(x))?Number(x):NaN;
const positive=x=>Number.isFinite(x)&&x>0&&x<1e14;
const nonnegative=x=>Number.isFinite(x)&&x>=0&&x<1e16;
const unsupported=()=>({state:'UNSUPPORTED',reason:'No confirmed contract address for this market'});
async function getJson(url,{fetchImpl=fetch,signal,headers={}}={}){
 try{
  const r=await fetchImpl(url,{method:'GET',cache:'no-store',
   credentials:'omit',signal,headers});
  if(r?.status===429||r?.status===418)return {state:'RATE_LIMITED',reason:'Source rate limit'};
  if(!r?.ok)return {state:'OFFLINE',reason:'HTTP '+String(r?.status||'?')};
  return {state:'OK',value:await r.json()};
 }catch(e){return {state:'OFFLINE',reason:String(e?.message||e).slice(0,130)};}
}
export function parseFearGreed(raw,{now=Date.now()}={}){
 const x=raw?.data?.[0],value=num(x?.value),observedAt=num(x?.timestamp)*1000;
 if(!Number.isInteger(value)||value<0||value>100||
  !Number.isSafeInteger(observedAt)||observedAt<=0||
  observedAt>now+60000||now-observedAt>4*86400000)
  return {state:'INVALID',reason:'Unverifiable index or timestamp'};
 return {state:'OK',data:{value,
  classification:String(x?.value_classification||'').slice(0,36),
  observedAt,provider:'Alternative.me',
  scope:'GLOBAL_CRYPTO_MOOD_NOT_ASSET_SIGNAL',
  attribution:'https://alternative.me/crypto/fear-and-greed-index/'}};
}
export async function fetchFearGreed(opts={}){
 const x=await getJson(FREE_ENDPOINTS.fear,opts);
 return x.state==='OK'?parseFearGreed(x.value,{now:(opts.now||Date.now)()}):x;
}
export function parseDexPairs(raw,{symbol,now=Date.now()}={}){
 const token=dexTokenReference(symbol);
 if(!token)return unsupported();
 if(!Array.isArray(raw)||raw.length>500)return {state:'INVALID',reason:'Invalid pairs response'};
 const pool=raw.filter(p=>p?.chainId===token.chain&&
  String(p.baseToken?.address||'').toLowerCase()===token.address.toLowerCase()&&
  positive(num(p.priceUsd))&&positive(num(p.liquidity?.usd))&&
  nonnegative(num(p.volume?.h24))&&
  typeof p.pairAddress==='string'&&p.pairAddress.length>=16)
  .sort((a,b)=>num(b.liquidity.usd)-num(a.liquidity.usd))[0];
 if(!pool)return {state:'EMPTY',reason:'No trusted base-token liquidity pool'};
 return {state:'OK',data:{symbol,tokenLabel:token.label,network:token.chain,
  market:'DEX',pool:pool.pairAddress,
  priceUsd:num(pool.priceUsd),liquidityUsd:num(pool.liquidity.usd),
  volume24hUsd:num(pool.volume.h24),observedAt:now,
  provider:'DEX Screener',scope:'DEX_WRAPPED_ASSET_NOT_SPOT_PRICE'}};
}
export async function fetchDexPairs(symbol,opts={}){
 const token=dexTokenReference(symbol);
 if(!token)return unsupported();
 const url=FREE_ENDPOINTS.dex+'/token-pairs/v1/'+token.chain+'/'+token.address;
 const r=await getJson(url,opts);
 return r.state==='OK'?parseDexPairs(r.value,{symbol,now:(opts.now||Date.now)()}):r;
}
export function parseGeckoPools(raw,{symbol,now=Date.now()}={}){
 const token=dexTokenReference(symbol);
 if(!token)return unsupported();
 if(!Array.isArray(raw?.data)||raw.data.length>120)
  return {state:'INVALID',reason:'Invalid GeckoTerminal response'};
 const address=(token.geckoNetwork+'_'+token.address).toLowerCase();
 const pool=raw.data.filter(p=>{
  const attrs=p?.attributes;
  return String(p?.relationships?.base_token?.data?.id||'').toLowerCase()===address&&
   positive(num(attrs?.base_token_price_usd))&&
   positive(num(attrs?.reserve_in_usd))&&
   nonnegative(num(attrs?.volume_usd?.h24));
 }).sort((a,b)=>num(b.attributes.reserve_in_usd)-num(a.attributes.reserve_in_usd))[0];
 if(!pool)return {state:'EMPTY',reason:'No matching token pool'};
 const a=pool.attributes;
 return {state:'OK',data:{symbol,tokenLabel:token.label,network:token.geckoNetwork,
  market:'DEX',pool:String(a.address||pool.id||'').slice(0,130),
  priceUsd:num(a.base_token_price_usd),liquidityUsd:num(a.reserve_in_usd),
  volume24hUsd:num(a.volume_usd.h24),observedAt:now,
  provider:'GeckoTerminal',scope:'DEX_WRAPPED_ASSET_NOT_SPOT_PRICE'}};
}
export async function fetchGeckoPools(symbol,opts={}){
 const token=dexTokenReference(symbol);
 if(!token)return unsupported();
 const url=FREE_ENDPOINTS.gecko+'/networks/'+token.geckoNetwork+
  '/tokens/'+token.address+'/pools?page=1';
 const r=await getJson(url,{...opts,
  headers:{Accept:'application/json;version=20230203'}});
 return r.state==='OK'?parseGeckoPools(r.value,{symbol,now:(opts.now||Date.now)()}):r;
}
export function parseOkxTicker(raw,{symbol,now=Date.now()}={}){
 if(!/^[A-Z0-9]{2,12}USDT$/.test(symbol||'')||raw?.code!=='0'||
  !Array.isArray(raw?.data)||raw.data.length!==1)
  return {state:'INVALID',reason:'Invalid OKX ticker response'};
 const p=raw.data[0],instId=symbol.slice(0,-4)+'-USDT';
 const last=num(p?.last),bid=num(p?.bidPx),ask=num(p?.askPx),at=Number(p?.ts);
 if(p?.instId!==instId||!positive(last)||!positive(bid)||!positive(ask)||
  bid>ask||!Number.isSafeInteger(at)||at>now+60000||now-at>20*60000)
  return {state:'INVALID',reason:'Wrong pair or stale OKX Spot observation'};
 return {state:'OK',data:{symbol,price:last,bid,ask,observedAt:at,
  venue:'OKX Spot',scope:'SPOT_QUOTE_NOT_EXECUTION',provider:'OKX'}};
}
export async function fetchOkxTicker(symbol,opts={}){
 if(!/^[A-Z0-9]{2,12}USDT$/.test(symbol||''))return unsupported();
 const instId=symbol.slice(0,-4)+'-USDT';
 const url=FREE_ENDPOINTS.okx+'?instId='+encodeURIComponent(instId);
 const r=await getJson(url,opts);
 return r.state==='OK'?parseOkxTicker(r.value,{symbol,now:(opts.now||Date.now)()}):r;
}

/** CoinPaprika free public ticker. Market context only, never an order price. */
const paprikaCoins=Object.freeze({
 BTCUSDT:'btc-bitcoin',ETHUSDT:'eth-ethereum',SOLUSDT:'sol-solana',
 XRPUSDT:'xrp-xrp',ADAUSDT:'ada-cardano',DOGEUSDT:'doge-dogecoin',
 BNBUSDT:'bnb-binance-coin',LTCUSDT:'ltc-litecoin'
});
export function parsePaprikaTicker(raw,{symbol,now=Date.now()}={}){
 const id=paprikaCoins[symbol];
 if(!id)return unsupported();
 const q=raw?.quotes?.USD;
 const price=num(q?.price),volume=num(q?.volume_24h),cap=num(q?.market_cap);
 const timestamp=Date.parse(raw?.last_updated||'');
 if(raw?.id!==id||!positive(price)||!nonnegative(volume)||
  !nonnegative(cap)||!Number.isFinite(timestamp)||
  timestamp>now+60000||now-timestamp>24*3600000)
  return {state:'INVALID',reason:'Invalid coin identity, price or timestamp'};
 return {state:'OK',data:{symbol,priceUsd:price,volume24hUsd:volume,
  marketCapUsd:cap,observedAt:timestamp,provider:'CoinPaprika',
  scope:'GLOBAL_ASSET_QUOTE_NOT_EXECUTION'}};
}
export async function fetchPaprikaTicker(symbol,opts={}){
 const id=paprikaCoins[symbol];
 if(!id)return unsupported();
 const r=await getJson(FREE_ENDPOINTS.paprika+'/'+encodeURIComponent(id),opts);
 return r.state==='OK'?parsePaprikaTicker(r.value,{
  symbol,now:(opts.now||Date.now)()}):r;
}
