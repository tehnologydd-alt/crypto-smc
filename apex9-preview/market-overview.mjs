/**
 * Overview derives a read-only GLOBAL crypto snapshot only from CoinGecko.
 * Never reuse the selected asset's 24-hour movement as a market-wide result.
 * All values must be sourced and time-checked; no directional signal is inferred.
 */
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const validTime=n=>Number.isSafeInteger(n)&&n>0;
const MAX_AGE_MS=2*60*60*1000;

export function globalMarketSnapshot(context,{now=Date.now()}={}){
 const item=Array.isArray(context?.sources)?
  context.sources.find(x=>x?.id==='coingecko-global'):null;
 if(!item)return {state:'WAITING',reason:'Ожидаем данные CoinGecko'};
 if(item.state!=='OK')return {state:item.state||'UNAVAILABLE',
  reason:'CoinGecko: '+(item.state||'источник недоступен')};
 const data=item.data;
 if(data?.scope!=='GLOBAL_CRYPTO_NOT_ASSET'||
  !valid(data.marketCapUsd)||data.marketCapUsd<=0||
  !valid(data.totalVolumeUsd)||data.totalVolumeUsd<0||
  !valid(data.btcDominancePercent)||data.btcDominancePercent<0||
  data.btcDominancePercent>100||
  !valid(data.marketCapChange24hPercent)||
  Math.abs(data.marketCapChange24hPercent)>1000||
  !validTime(data.observedAt)||!validTime(now)||
  data.observedAt>now+60000)
  return {state:'INVALID',reason:'Непроверенный формат глобального снимка'};
 const age=now-data.observedAt;
 return {
  state:age>MAX_AGE_MS?'STALE':'OK',
  reason:age>MAX_AGE_MS?'Снимок устарел · CoinGecko':'CoinGecko · общая капитализация',
  marketCapUsd:data.marketCapUsd,
  totalVolumeUsd:data.totalVolumeUsd,
  btcDominancePercent:data.btcDominancePercent,
  marketCapChange24hPercent:data.marketCapChange24hPercent,
  observedAt:data.observedAt
 };
}
