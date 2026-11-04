import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { AssetInfo, Candle, ExchangeData, OrderBookLevel, PriceSnapshot, WhaleRadarData, SentimentData, LocalAnalysis } from '../types/crypto';
import { calculateSMC } from './smc';

export const ASSETS: AssetInfo[] = [
  { symbol:'BTCUSDT',base:'BTC',quote:'USDT',name:'Bitcoin',network:'Bitcoin' },
  { symbol:'ETHUSDT',base:'ETH',quote:'USDT',name:'Ethereum',network:'Ethereum' },
  { symbol:'SOLUSDT',base:'SOL',quote:'USDT',name:'Solana',network:'Solana' },
  { symbol:'BNBUSDT',base:'BNB',quote:'USDT',name:'BNB',network:'BNB Chain' },
  { symbol:'XRPUSDT',base:'XRP',quote:'USDT',name:'Ripple',network:'XRP Ledger' },
  { symbol:'AVAXUSDT',base:'AVAX',quote:'USDT',name:'Avalanche',network:'Avalanche' },
  { symbol:'SUIUSDT',base:'SUI',quote:'USDT',name:'Sui',network:'Sui' },
  { symbol:'NEARUSDT',base:'NEAR',quote:'USDT',name:'NEAR Protocol',network:'NEAR' },
  { symbol:'LINKUSDT',base:'LINK',quote:'USDT',name:'Chainlink',network:'Ethereum' },
  { symbol:'DOGEUSDT',base:'DOGE',quote:'USDT',name:'Dogecoin',network:'Dogecoin' },
];

async function jsonGet(url: string): Promise<any> {
  // Native networking bypasses browser CORS and does not require AI Studio/Cloud Run.
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, connectTimeout:6500, readTimeout:9000 });
    if (response.status < 200 || response.status >= 300) throw Error(`HTTP ${response.status}`);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const result = await fetch(url, {signal:controller.signal, cache:'no-store'});
    if (!result.ok) throw Error(`HTTP ${result.status}`);
    return result.json();
  } finally { clearTimeout(timer); }
}

const num = (value:any):number => { const n=Number(value); return Number.isFinite(n)?n:NaN; };
const levels=(rows:any):OrderBookLevel[] => Array.isArray(rows) ? rows.map((r:any)=>({price:num(r[0]),amount:num(r[1])})).filter((r:OrderBookLevel)=>r.price>0 && r.amount>0).slice(0,30) : [];
async function maybe(url:string):Promise<any|null> { try {return await jsonGet(url);}catch(e){console.warn('API недоступен',url, e);return null;} }

export async function fetchMarket(symbol:string):Promise<PriceSnapshot> {
  const asset = ASSETS.find(a=>a.symbol===symbol);
  if (!asset) throw Error('Неизвестный символ');
  const [bTicker,yTicker,bDepth,yDepth,bCandles] = await Promise.all([
    maybe(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
    maybe(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`),
    maybe(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=100`),
    maybe(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=50`),
    maybe(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=120`),
  ]);
  const y = yTicker?.result?.list?.[0];
  const yBook = yDepth?.result;
  const binance:ExchangeData|null = bTicker && num(bTicker.lastPrice)>0 ? {
    name:'Binance',price:num(bTicker.lastPrice),change24h:num(bTicker.priceChangePercent),high24h:num(bTicker.highPrice),low24h:num(bTicker.lowPrice),volume24h:num(bTicker.volume),
    orderBook:{topBids:levels(bDepth?.bids),topAsks:levels(bDepth?.asks)},status:'LIVE'
  }:null;
  const bybit:ExchangeData|null = y && num(y.lastPrice)>0 ? {
    name:'Bybit',price:num(y.lastPrice),change24h:num(y.price24hPcnt)*100,high24h:num(y.highPrice24h),low24h:num(y.lowPrice24h),volume24h:num(y.volume24h),
    orderBook:{topBids:levels(yBook?.b),topAsks:levels(yBook?.a)},status:'LIVE'
  }:null;
  if (!binance && !bybit) throw Error('Обе биржи недоступны. Проверь интернет и доступность API.');
  const price = binance?.price ?? bybit!.price;
  const candles:Candle[] = Array.isArray(bCandles) ? bCandles.filter((r:any)=>Array.isArray(r) && r.length>=7).map((r:any)=>({
    time:num(r[0]),open:num(r[1]),high:num(r[2]),low:num(r[3]),close:num(r[4]),volume:num(r[5])
  })).filter((x:Candle)=>x.open>0 && x.high>0 && x.low>0 && x.close>0 && Number.isFinite(x.volume)) : [];
  const completed = candles.filter(c=>c.time+3600000<=Date.now());
  const spread = binance && bybit ? Math.abs(binance.price - bybit.price) : null;
  return {
    timestamp:Date.now(),symbol,asset,
    exchanges:{binance,bybit},
    comparison:{spreadAbsolute:spread,spreadPercent:spread!==null ? spread/price*100:null,cheaperExchange:binance&&bybit ? (binance.price<=bybit.price?'Binance':'Bybit'):null},
    klinesSummary:{count:completed.length,candles:completed},
    smc:calculateSMC(completed,price),
  };
}

export function deriveOrderWalls(s:PriceSnapshot):WhaleRadarData {
  const all = [s.exchanges.binance,s.exchanges.bybit].filter((ex):ex is ExchangeData=>!!ex);
  const walls=all.flatMap(ex=>[
    ...ex.orderBook.topBids.map((b,i)=>({id:`${ex.name}-b-${i}`,exchange:ex.name,side:'BID' as const,price:b.price,amount:b.amount,usdValue:b.price*b.amount})),
    ...ex.orderBook.topAsks.map((a,i)=>({id:`${ex.name}-a-${i}`,exchange:ex.name,side:'ASK' as const,price:a.price,amount:a.amount,usdValue:a.price*a.amount}))
  ]).sort((a,b)=>b.usdValue-a.usdValue);
  const bidLiquidityUsd=walls.filter(w=>w.side==='BID').reduce((sum,w)=>sum+w.usdValue,0);
  const askLiquidityUsd=walls.filter(w=>w.side==='ASK').reduce((sum,w)=>sum+w.usdValue,0);
  const total=bidLiquidityUsd+askLiquidityUsd;
  return {symbol:s.symbol,timestamp:s.timestamp,source:'Публичные видимые заявки Binance / Bybit, ограниченная глубина стакана; не ончейн-транзакции',
    walls:walls.slice(0,12),bidLiquidityUsd,askLiquidityUsd,imbalance:total>0?(bidLiquidityUsd-askLiquidityUsd)/total:null};
}

export async function fetchSentiment(s:PriceSnapshot):Promise<SentimentData> {
  const fng = await maybe('https://api.alternative.me/fng/?limit=1');
  const value=fng?.data?.[0];
  const index = value && Number.isFinite(num(value.value)) && num(value.value)>=0 && num(value.value)<=100 ? {
    value:num(value.value),classification:String(value.value_classification||'Unknown'),timestamp:num(value.timestamp)*1000
  } : null;
  const marketChange24h=s.exchanges.binance?.change24h ?? s.exchanges.bybit?.change24h ?? 0;
  return {asset:s.asset.base,fearAndGreed:index,marketChange24h,
    description:'Fear & Greed — общерыночный индекс, не индивидуальный сентимент монеты. Изменение цены — по данным биржи. Мониторинг соцсетей и ML в этой автономной версии не подключены.'};
}

export function analyzeLocally(s:PriceSnapshot, walls:WhaleRadarData):LocalAnalysis {
  const price=s.exchanges.binance?.price ?? s.exchanges.bybit?.price ?? 0;
  const d=s.exchanges.binance?.change24h ?? s.exchanges.bybit?.change24h ?? 0;
  const votes:LocalAnalysis['votes']=[];
  const candles=s.klinesSummary.candles;
  if (candles.length>=24) {
    const first=candles[candles.length-13].close;
    const last=candles[candles.length-1].close;
    const move=(last-first)/first*100;
    const bias=move>0.5?'UP':move< -0.5?'DOWN':'NEUTRAL';
    votes.push({name:'Динамика 12 закрытых свечей',bias,reason:`Изменение за 12 часов: ${move.toFixed(2)}%`});
  }
  votes.push({name:'Изменение цены за 24ч',bias:d>1?'UP':d< -1?'DOWN':'NEUTRAL',reason:`24 часа: ${d.toFixed(2)}%`});
  if(walls.imbalance!==null) votes.push({name:'Видимая ликвидность стакана',bias:walls.imbalance>0.15?'UP':walls.imbalance< -0.15?'DOWN':'NEUTRAL',reason:`Разница заявок BID/ASK: ${(walls.imbalance*100).toFixed(1)}%, это не фактические сделки`});
  const up=votes.filter(v=>v.bias==='UP').length;
  const down=votes.filter(v=>v.bias==='DOWN').length;
  const bias:LocalAnalysis['bias']=up>=2&&up>down?'UP':down>=2&&down>up?'DOWN':'NEUTRAL';
  const support=s.smc?.supportLevels[0]??null, resistance=s.smc?.resistanceLevels[0]??null;
  return {symbol:s.symbol,timestamp:s.timestamp,bias,votes,support,resistance,
    conclusion:bias==='NEUTRAL'?'Недостаточно согласованных наблюдений для направленного вывода.':bias==='UP'?'Большинство локальных правил указывает на положительную краткосрочную динамику.':'Большинство локальных правил указывает на отрицательную краткосрочную динамику.',
    dataStatus:`Результат вычислен на устройстве по ${votes.length} правилам. Не нейросеть, не прогноз вероятности, не торговый сигнал. Текущая цена: ${price}.`};
}
