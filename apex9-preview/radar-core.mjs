/**
 * APEX Radar — bounded public-market discovery, not trading recommendations.
 * The universe is ranked by VERIFIED Binance Spot USDT quote turnover only.
 * History remains the sole source for observed trend/velocity/range classification.
 */
import {CANDLE_INTERVALS} from './candles.mjs';

export const RADAR_INTERVALS=Object.freeze(['15m','1h','4h','1d']);
export const RADAR_LIMIT=12;
export const RADAR_SOURCE='Binance Spot /api/v3/ticker/24hr';
const URL='https://data-api.binance.vision/api/v3/ticker/24hr';
const EXCLUDED_BASES=new Set(['USDC','FDUSD','TUSD','BUSD','DAI','USDP','EUR','EURC',
 'AEUR','PAX','PYUSD','USTC','UST','USD1']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const number=x=>typeof x==='number'?x:
 typeof x==='string'&&x.trim()!==''?Number(x):NaN;
const SYMBOL=/^[A-Z0-9]{5,20}$/;
const TICKER_AGE_MS=180000;
const errorText=error=>String(error?.message||error||'Ошибка сети').slice(0,160);

export function parseRadarUniverse(raw,{catalog=[],now=Date.now(),limit=RADAR_LIMIT}={}){
 if(!Array.isArray(raw)||!Array.isArray(catalog)||
  !Number.isSafeInteger(now)||now<1||
  !Number.isSafeInteger(limit)||limit<1||limit>RADAR_LIMIT)
  return {state:'INVALID',rows:[],reason:'Неверные данные рынка или каталога'};
 const listed=new Set(catalog.filter(s=>typeof s==='string'&&SYMBOL.test(s)&&s.endsWith('USDT')));
 if(!listed.size)return {state:'NEEDS_CATALOG',rows:[],reason:'Список торговых пар ещё не получен'};
 const bySymbol=new Map();
 for(const item of raw){
  const symbol=item?.symbol;
  if(typeof symbol!=='string'||!listed.has(symbol)||!symbol.endsWith('USDT')||
   EXCLUDED_BASES.has(symbol.slice(0,-4)))continue;
  const quoteVolume=number(item.quoteVolume),change24h=number(item.priceChangePercent),
   lastPrice=number(item.lastPrice),observedAt=number(item.closeTime);
  if(!finite(quoteVolume)||quoteVolume<=0||!finite(change24h)||
   Math.abs(change24h)>1000||!finite(lastPrice)||lastPrice<=0||
   !Number.isSafeInteger(observedAt)||observedAt<=0||
   observedAt>now+60000||now-observedAt>TICKER_AGE_MS)continue;
  const entry={symbol,quoteVolume,change24h,lastPrice,observedAt};
  const prior=bySymbol.get(symbol);
  if(!prior||entry.observedAt>prior.observedAt)bySymbol.set(symbol,entry);
 }
 const rows=[...bySymbol.values()].sort((a,b)=>
  b.quoteVolume-a.quoteVolume||a.symbol.localeCompare(b.symbol)).slice(0,limit);
 return {state:rows.length?'OK':'NO_FRESH_TICKERS',rows,
  reason:rows.length?null:'Нет актуальных тикеров для разрешённых Spot-пар'};
}
export async function fetchRadarUniverse({
 catalog=[],fetchImpl=fetch,now=()=>Date.now(),signal,limit=RADAR_LIMIT
}={}){
 if(!Array.isArray(catalog)||catalog.length===0)
  return {state:'NEEDS_CATALOG',rows:[],reason:'Каталог Spot ещё не загружен'};
 try{
  const response=await fetchImpl(URL,{
   method:'GET',cache:'no-store',credentials:'omit',signal
  });
  if(response?.status===429||response?.status===418)
   return {state:'RATE_LIMITED',rows:[],reason:'Биржа ограничила запросы радара'};
  if(!response?.ok)return {state:'OFFLINE',rows:[],reason:'Binance HTTP '+response?.status};
  return parseRadarUniverse(await response.json(),{catalog,now:now(),limit});
 }catch(error){
  return {state:signal?.aborted?'CANCELLED':'OFFLINE',rows:[],
   reason:errorText(error)};
 }
}

export function describeRadarFrame(summary){
 if(!summary||summary.status!=='OK'||!RADAR_INTERVALS.includes(summary.interval))
  return {state:!summary?'NO_DATA':summary.status!=='OK'?summary.status:'INVALID_INTERVAL',
   direction:'UNKNOWN',mode:'UNKNOWN',
   movement:null,volumeRatio:null,lastClosedAt:null,efficiency:null};
 const direction=['UP','DOWN','FLAT'].includes(summary.direction)?
  summary.direction:'UNKNOWN';
 const mode=['DIRECTIONAL','RANGE','MIXED'].includes(summary.mode)?
  summary.mode:'UNKNOWN';
 return {state:'OK',direction,mode,
  movement:finite(summary.velocityPctPerBar)?summary.velocityPctPerBar:null,
  volumeRatio:finite(summary.volumeRatio)?summary.volumeRatio:null,
  lastClosedAt:Number.isSafeInteger(summary.lastClosedAt)?summary.lastClosedAt:null,
  efficiency:finite(summary.efficiency)?summary.efficiency:null};
}
export function filterRadarRows(rows,{filter='all',sort='turnover'}={}){
 const accepted=new Set(['all','up','down','range','changing']);
 const sorter=new Set(['turnover','movement','volume']);
 if(!Array.isArray(rows))return [];
 const selected=accepted.has(filter)?filter:'all';
 const sorted=sorter.has(sort)?sort:'turnover';
 const eligible=rows.filter(r=>r?.analysis?.state==='OK').filter(r=>
  selected==='all'||selected==='up'&&r.analysis.direction==='UP'||
  selected==='down'&&r.analysis.direction==='DOWN'||
  selected==='range'&&r.analysis.mode==='RANGE'||
  selected==='changing'&&r.analysis.mode==='DIRECTIONAL');
 const metric=(r)=>sorted==='movement'?Math.abs(r.analysis.movement??0):
  sorted==='volume'?(r.analysis.volumeRatio??-1):r.quoteVolume;
 return eligible.sort((a,b)=>metric(b)-metric(a)||a.symbol.localeCompare(b.symbol));
}
export function validRadarInterval(interval){return Boolean(CANDLE_INTERVALS[interval])&&RADAR_INTERVALS.includes(interval);}
