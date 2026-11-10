/**
 * Public DEX-pool discovery for unsupported token network adapters.
 *
 * DexScreener and GeckoTerminal return candidate pools found by TICKER.
 * Ticker equality does not authenticate a token's contract, chain, owner,
 * whale wallet or transaction history. Never aggregate candidate pools
 * into a verified token measure; never display as a trading signal.
 *
 * Two fixed API hosts, keyless reads only. Only one manual foreground
 * lookup per favorite asset (~4-minute UI refresh cadence). No crawling,
 * hidden retry, background worker, private credentials or cloud service.
 */
export const DEX_PROVIDERS=Object.freeze([
 'dexscreener','geckoterminal'
]);
const HOSTS=Object.freeze({
 dexscreener:'https://api.dexscreener.com',
 geckoterminal:'https://api.geckoterminal.com'
});
const SYMBOL=/^[A-Z0-9]{2,20}$/;
const value=(v)=>typeof v==='number'?v:
 typeof v==='string'&&v.trim()!==''?Number(v):NaN;
const nonnegative=v=>Number.isFinite(v)&&v>=0&&v<1e15;
const safeText=(s,max=80)=>typeof s==='string'?
 s.replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,max):'';
const toNumber=v=>nonnegative(value(v))?value(v):null;
const positive=v=>toNumber(v)!==null&&toNumber(v)>0;
const validTime=t=>Number.isSafeInteger(t)&&t>0;
const acceptedQuote=new Set([
 'USDT','USDC','DAI','WETH','WBNB','ETH','BNB','SOL','WBTC','BTC'
]);
export function baseOfSpotAsset(asset){
 if(typeof asset!=='string'||!SYMBOL.test(asset))return null;
 for(const suffix of ['USDT','USDC','EUR','BTC','ETH']){
  if(asset.endsWith(suffix)&&asset.length>suffix.length+1)
   return asset.slice(0,-suffix.length);
 }
 return null;
}
const response=(provider,asset,state,reason,pools=[],observedAt=null)=>({
 provider,asset,state,reason,pools,observedAt,
 scope:'TICKER_SEARCH_UNVERIFIED_TOKEN_IDENTITY',
 walletEvidence:false,notLiveOrderBook:true,notProductionProbability:true
});
const simplify=(x)=>({
 chain:safeText(x.chain,32),
 dex:safeText(x.dex,36),
 pair:safeText(x.pair,45),
 contract:safeText(x.contract,110),
 quote:safeText(x.quote,12),
 priceUsd:toNumber(x.priceUsd),
 liquidityUsd:toNumber(x.liquidityUsd),
 volume24hUsd:toNumber(x.volume24hUsd),
 buys24h:Number.isSafeInteger(x.buys24h)&&x.buys24h>=0?x.buys24h:null,
 sells24h:Number.isSafeInteger(x.sells24h)&&x.sells24h>=0?x.sells24h:null,
 identityVerified:false
});
const finalize=(provider,asset,candidates,observedAt)=>({
 ...response(provider,asset,candidates.length?'CANDIDATES':'NO_MATCH',
  candidates.length?
   'Совпадение по тикеру, контракт не подтверждён.':
   'Пул с этим точным базовым тикером не найден в ответе API.',
  candidates.sort((a,b)=>(b.liquidityUsd||0)-(a.liquidityUsd||0))
   .slice(0,3),observedAt),
 candidatesTotal:candidates.length
});
/** Strictly descriptive, fail-closed vendor parse. No quote inference. */
export function parseDexScreenerPools(asset,payload,{now=Date.now()}={}){
 const base=baseOfSpotAsset(asset);
 if(!base||!validTime(now)||!payload||
  !(Array.isArray(payload.pairs)||payload.pairs===null))
  return response('dexscreener',asset,'INVALID','Некорректный ответ поиска DEX Screener');
 const candidates=[];
 for(const entry of (payload.pairs||[]).slice(0,200)){
  if(!entry||typeof entry!=='object')continue;
  const baseSymbol=safeText(entry.baseToken?.symbol,20).toUpperCase();
  const quote=safeText(entry.quoteToken?.symbol,12).toUpperCase();
  if(baseSymbol!==base||!acceptedQuote.has(quote)||
   !safeText(entry.chainId)||!safeText(entry.pairAddress)||
   !positive(entry.liquidity?.usd))continue;
  candidates.push(simplify({
   chain:entry.chainId,dex:entry.dexId,
   pair:base+'/'+quote,contract:entry.baseToken?.address,
   quote,priceUsd:entry.priceUsd,liquidityUsd:entry.liquidity?.usd,
   volume24hUsd:entry.volume?.h24,
   buys24h:entry.txns?.h24?.buys,sells24h:entry.txns?.h24?.sells
  }));
 }
 return finalize('dexscreener',asset,candidates,now);
}
/** Public GeckoTerminal pool-search schema: data[].attributes with
 * name "TOKEN / QUOTE"; network from relationships.network.data.id.
 */
export function parseGeckoTerminalPools(asset,payload,{now=Date.now()}={}){
 const base=baseOfSpotAsset(asset);
 if(!base||!validTime(now)||!payload||!Array.isArray(payload.data))
  return response('geckoterminal',asset,'INVALID','Некорректный ответ GeckoTerminal');
 const candidates=[];
 for(const entry of payload.data.slice(0,200)){
  if(entry?.type!=='pool'||!entry.attributes)continue;
  const attr=entry.attributes;
  const pairName=safeText(attr.name,60).toUpperCase();
  const tokens=/^([A-Z0-9]+)\s*\/\s*([A-Z0-9]+)/.exec(pairName);
  if(!tokens||tokens[1]!==base||!acceptedQuote.has(tokens[2])||
   !safeText(entry.relationships?.network?.data?.id)||
   !safeText(attr.address)||!positive(attr.reserve_in_usd))continue;
  candidates.push(simplify({
   chain:entry.relationships.network.data.id,
   dex:entry.relationships?.dex?.data?.id||'DEX',
   pair:tokens[1]+'/'+tokens[2],contract:'', // pool address is NOT a token contract
   quote:tokens[2],priceUsd:attr.base_token_price_usd,
   liquidityUsd:attr.reserve_in_usd,
   volume24hUsd:attr.volume_usd?.h24,
   buys24h:attr.transactions?.h24?.buys,
   sells24h:attr.transactions?.h24?.sells
  }));
 }
 return finalize('geckoterminal',asset,candidates,now);
}
const reason=x=>String(x?.message||x||'Ошибка API').slice(0,100);
export async function fetchDexCandidates(provider,asset,{
 fetchImpl=fetch,now=()=>Date.now(),signal
}={}){
 const base=baseOfSpotAsset(asset);
 if(!Object.hasOwn(HOSTS,provider)||!base)
  return response(provider,asset,'UNSUPPORTED','Нет корректного тикера Spot-актива');
 const query=base; // broad pool search, strict exact-base filter below
 const path=provider==='dexscreener'?
  '/latest/dex/search?q='+encodeURIComponent(query):
  '/api/v2/search/pools?query='+encodeURIComponent(query);
 const url=HOSTS[provider]+path;
 try{
  const reply=await fetchImpl(url,{method:'GET',credentials:'omit',
   cache:'no-store',signal,...(provider==='geckoterminal'?{
    headers:{Accept:'application/json;version=20230203'}
   }:{})});
  if([429,418].includes(reply?.status))
   return response(provider,asset,'RATE_LIMITED','Лимит публичного API');
  if([401,403,451].includes(reply?.status))
   return response(provider,asset,'ACCESS_DENIED','Доступ к API ограничен: HTTP '+reply.status);
  if(!reply?.ok)return response(provider,asset,'OFFLINE',
   'HTTP '+String(reply?.status||'?'));
  const payload=await reply.json();
  return provider==='dexscreener'?
   parseDexScreenerPools(asset,payload,{now:now()}):
   parseGeckoTerminalPools(asset,payload,{now:now()});
 }catch(e){
  return response(provider,asset,'OFFLINE',reason(e));
 }
}
export async function collectDexMarket(asset,options={}){
 const outcomes=await Promise.allSettled(DEX_PROVIDERS.map(provider=>
  fetchDexCandidates(provider,asset,options)));
 const sources=outcomes.map((r,i)=>r.status==='fulfilled'?r.value:
  response(DEX_PROVIDERS[i],asset,'OFFLINE',reason(r.reason)));
 const available=sources.filter(x=>x.state==='CANDIDATES');
 return {asset,sources,
  state:available.length?'CANDIDATES':
   sources.every(x=>x.state==='NO_MATCH')?'NO_MATCH':
   sources.some(x=>x.state==='NO_MATCH')?'PARTIAL':'UNAVAILABLE',
  tokenIdentityVerified:false,networkTelemetry:false,
  totalCandidates:available.reduce((sum,x)=>sum+x.candidatesTotal,0),
  note:'Поиск DEX-пулов только по тикеру. Это не подтверждение контракта, '+
   'сетевых транзакций или движения кошельков. Показатели разных пулов '+
   'и сетей нельзя складывать как ликвидность одного актива.'};
}
