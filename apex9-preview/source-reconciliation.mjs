/**
 * Source-aware evidence ledger for APEX research UI.
 * Explicitly separates CEX Spot, USD market aggregates, wrapped-token DEX,
 * global context, blockchain activity, articles and user posts.
 * No price forecasts, no trades and no invented source confirmations.
 */
const SPECS=Object.freeze({
 'binance-ticker':{title:'Binance Spot',group:'VENUE_SPOT'},
 'binance-depth':{title:'Binance depth',group:'VISIBLE_ORDER_BOOK'},
 'bybit-depth':{title:'Bybit depth',group:'VISIBLE_ORDER_BOOK'},
 okx:{title:'OKX Spot',group:'VENUE_SPOT'},
 paprika:{title:'CoinPaprika',group:'GLOBAL_ASSET_USD'},
 cmc:{title:'CoinMarketCap Keyless',group:'GLOBAL_ASSET_USD'},
 dex:{title:'DEX Screener',group:'WRAPPED_TOKEN_DEX'},
 gecko:{title:'GeckoTerminal',group:'WRAPPED_TOKEN_DEX'},
 fear:{title:'Alternative.me',group:'GLOBAL_MOOD'},
 'coingecko-global':{title:'CoinGecko',group:'GLOBAL_CRYPTO'},
 'bitcoin-mempool':{title:'mempool.space',group:'BITCOIN_NETWORK'},
 'gdelt-news':{title:'GDELT',group:'NEWS_INDEX'},
 bluesky:{title:'Bluesky',group:'USER_DISCUSSION'}
});
const validTime=t=>Number.isSafeInteger(t)&&t>0;
const validPrice=p=>typeof p==='number'&&Number.isFinite(p)&&p>0;
const validNow=n=>validTime(n)?n:Date.now();
export const SOURCE_GROUPS=Object.freeze({
 VENUE_SPOT:'Котировка отдельной спотовой биржи (USDT)',
 VISIBLE_ORDER_BOOK:'Ограниченные публичные снимки стаканов',
 GLOBAL_ASSET_USD:'Агрегированная оценка актива (USD)',
 WRAPPED_TOKEN_DEX:'DEX-пул обёрнутого токена (USD)',
 GLOBAL_MOOD:'Настроение всего крипторынка',
 GLOBAL_CRYPTO:'Общий крипторынок',
 BITCOIN_NETWORK:'Показатели сети Bitcoin',
 NEWS_INDEX:'Индекс новостных публикаций',
 USER_DISCUSSION:'Непроверенные публичные обсуждения'
});
export const NON_CONNECTED=Object.freeze({
 cryptopanic:'KEY_OR_ENTITLEMENT_REQUIRED',
 newsdata:'SERVER_SECRET_REQUIRED',
 reddit:'APPROVED_OAUTH_REQUIRED'
});
export function reconcileSources(symbol,results={},{
 now=Date.now(),maxComparisonAgeMs=2*3600000
}={}){
 const at=validNow(now),entries=[];
 for(const [key,spec] of Object.entries(SPECS)){
  const r=results?.[key];
  if(!r)continue; // "not queried" must never be counted as offline
  const providerTime=r?.data?.observedAt??r?.data?.providerObservedAt??null;
  const localTime=r?.data?.receivedAt??null;
  const observedAt=providerTime??localTime;
  const timeOrigin=validTime(providerTime)?'PROVIDER':
   validTime(localTime)?'LOCAL_CAPTURE':'UNKNOWN';
  const validObservation=validTime(observedAt)&&observedAt<=at+60000;
  const recordedAt=validTime(r?.fetchedAt)?r.fetchedAt:null;
  const state=typeof r?.state==='string'?r.state:'INVALID';
  const usable=state==='OK'&&validObservation;
  entries.push({id:key,title:spec.title,group:spec.group,state,
   observedAt:validObservation?observedAt:null,
   fetchedAt:recordedAt,timeOrigin,usable,
   recordStatus:state==='STALE'?'ARCHIVED':
    state==='OK'?(usable?(timeOrigin==='LOCAL_CAPTURE'? 'LOCAL_CAPTURE_TIME':'TIMESTAMPED'):
     'NO_RELIABLE_TIMESTAMP'):
    state==='UNSUPPORTED'?'NOT_APPLICABLE':'UNAVAILABLE',
   source:r?.source==='CACHE'?'CACHE':r?.source==='NETWORK'?'NETWORK':'UNKNOWN'});
 }
 const quotes=entries.filter(e=>e.group==='GLOBAL_ASSET_USD'&&e.usable&&
  at-e.observedAt<=maxComparisonAgeMs).map(e=>({
   id:e.id,priceUsd:results[e.id].data?.priceUsd,observedAt:e.observedAt
  })).filter(x=>validPrice(x.priceUsd));
 let comparison={state:'INSUFFICIENT',sources:quotes.map(x=>x.id)};
 if(quotes.length>=2){
  const min=Math.min(...quotes.map(x=>x.priceUsd));
  const max=Math.max(...quotes.map(x=>x.priceUsd));
  const deltaPercent=(max-min)/((min+max)/2)*100;
  comparison={state:deltaPercent<=1?'CLOSE':'DIFFERENT',
   deltaPercent:Number(deltaPercent.toFixed(3)),
   sources:quotes.map(x=>x.id),
   note:'Расхождение публичных USD-оценок, не арбитраж и не прогноз'};
 }
 const byGroup={};
 for(const e of entries){
  const g=byGroup[e.group]||(byGroup[e.group]={checked:0,valid:0});
  g.checked++;if(e.usable)g.valid++;
 }
 const usable=entries.filter(e=>e.usable).length;
 return {symbol,checked:entries.length,usable,entries,byGroup,comparison,
  unavailable:Object.keys(NON_CONNECTED).map(id=>({id,state:NON_CONNECTED[id]})),
  state:usable?'PARTIAL_EVIDENCE':'NO_VERIFIED_OBSERVATIONS',
  scope:'OBSERVATIONS_ONLY_NOT_TRADE_OR_PREDICTION',
  warning:'Число провайдеров не является числом независимых подтверждений рынка'};
}
