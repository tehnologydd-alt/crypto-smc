import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { AssetInfo, PriceSnapshot, SMCData, WhaleRadarData, SentimentData, OrderBookLevel } from '../types/crypto';

const assets: AssetInfo[] = [
  {symbol:'BTCUSDT',base:'BTC',quote:'USDT',name:'Bitcoin',network:'Bitcoin'},
  {symbol:'ETHUSDT',base:'ETH',quote:'USDT',name:'Ethereum',network:'Ethereum'},
  {symbol:'SOLUSDT',base:'SOL',quote:'USDT',name:'Solana',network:'Solana'},
  {symbol:'BNBUSDT',base:'BNB',quote:'USDT',name:'BNB',network:'BNB Chain'},
  {symbol:'XRPUSDT',base:'XRP',quote:'USDT',name:'Ripple',network:'XRP Ledger'},
  {symbol:'AVAXUSDT',base:'AVAX',quote:'USDT',name:'Avalanche',network:'Avalanche'},
  {symbol:'SUIUSDT',base:'SUI',quote:'USDT',name:'Sui',network:'Sui'},
  {symbol:'NEARUSDT',base:'NEAR',quote:'USDT',name:'NEAR Protocol',network:'NEAR'},
  {symbol:'LINKUSDT',base:'LINK',quote:'USDT',name:'Chainlink',network:'Ethereum'},
  {symbol:'DOGEUSDT',base:'DOGE',quote:'USDT',name:'Dogecoin',network:'Dogecoin'},
];
const N = (n: unknown): number => { const v = Number(n); return Number.isFinite(v) ? v : 0; };
const valid = (v: number) => Number.isFinite(v) && v > 0;

export async function getJson(url: string): Promise<any> {
  if (Capacitor.isNativePlatform()) {
    const result = await CapacitorHttp.get({url,connectTimeout:8000,readTimeout:8000,headers:{Accept:'application/json'}});
    if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}: ${new URL(url).host}`);
    return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
  }
  const controller = new AbortController();
  const tm = setTimeout(() => controller.abort(),8000);
  try {
    const response = await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(tm); }
}

const attempt = async (urls: string[]) => {
  let reason: unknown;
  for (const url of urls) {
    try { return await getJson(url); } catch (e) { reason=e; }
  }
  throw reason || new Error('Источники данных недоступны');
};

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
function candleFromBinance(row:any[]):Candle {
  return {time:N(row[0]),open:N(row[1]),high:N(row[2]),low:N(row[3]),close:N(row[4]),volume:N(row[5])};
}
function candlesFromBybit(value:any):Candle[] {
  const list = value?.result?.list;
  if(!Array.isArray(list)) throw new Error('Нет свечей Bybit');
  return list.map(candleFromBinance).sort((a:Candle,b:Candle)=>a.time-b.time);
}
function cleanCandles(rows:Candle[]):Candle[] {
  // Exclude unfinished current 1h candle, keep confirmed structure.
  const currentHour = Math.floor(Date.now()/3600000)*3600000;
  return rows.filter(c=>valid(c.close)&&valid(c.high)&&valid(c.low)&&c.low<=c.high&&c.time<currentHour);
}
export function calculateSMC(candles:Candle[],currentPrice:number):SMCData {
  const ob:SMCData['orderBlocks']=[];
  const sup:number[]=[];const res:number[]=[];
  if(candles.length < 10) throw new Error('Недостаточно закрытых свечей для анализа SMC');
  for(let i=2;i<candles.length-2;i++){
    const p=candles[i],a=candles[i-1],b=candles[i-2],d=candles[i+1],e=candles[i+2];
    if(p.low<=a.low&&p.low<=b.low&&p.low<=d.low&&p.low<=e.low) sup.push(p.low);
    if(p.high>=a.high&&p.high>=b.high&&p.high>=d.high&&p.high>=e.high) res.push(p.high);
    if(p.close<p.open&&d.close>d.open&&e.close>e.open&&e.close>p.high){
      ob.push({type:'bullish',levelLow:p.low,levelHigh:p.high,strength:Math.min(95,50+Math.round(p.volume/Math.max(1,a.volume)*10)),label:'OB+ (1H)',mitigated:candles.slice(i+3).some(c=>c.low<=p.low),time:p.time});
    }
    if(p.close>p.open&&d.close<d.open&&e.close<e.open&&e.close<p.low){
      ob.push({type:'bearish',levelLow:p.low,levelHigh:p.high,strength:Math.min(95,50+Math.round(p.volume/Math.max(1,a.volume)*10)),label:'OB- (1H)',mitigated:candles.slice(i+3).some(c=>c.high>=p.high),time:p.time});
    }
  }
  const active=[...ob.filter(o=>o.type==='bullish'&&!o.mitigated&&o.levelHigh<currentPrice).slice(-2), ...ob.filter(o=>o.type==='bearish'&&!o.mitigated&&o.levelLow>currentPrice).slice(-2)];
  const last=candles.slice(-3);const fvg:SMCData['fvg']={present:false};
  if(last.length===3&&last[2].low>last[0].high) Object.assign(fvg,{present:true,type:'bullish',bottom:last[0].high,top:last[2].low,description:'Бычий дисбаланс FVG'});
  if(last.length===3&&last[2].high<last[0].low) Object.assign(fvg,{present:true,type:'bearish',bottom:last[2].high,top:last[0].low,description:'Медвежий дисбаланс FVG'});
  const lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high)),half=(hi+lo)/2;
  return {orderBlocks:active,supportLevels:[...new Set(sup.filter(x=>x<currentPrice))].sort((a,b)=>b-a).slice(0,3),resistanceLevels:[...new Set(res.filter(x=>x>currentPrice))].sort((a,b)=>a-b).slice(0,3),marketStructure:candles.at(-1)!.close>candles.at(-10)!.close?'BULLISH_EXPANSION':'BEARISH_RETRACTION',fvg,discountZone:{min:lo,max:half},premiumZone:{min:half,max:hi}};
}
function book(rows:any):OrderBookLevel[]{return Array.isArray(rows)?rows.slice(0,10).map((r:any)=>({price:N(r[0]),amount:N(r[1])})).filter((b:OrderBookLevel)=>valid(b.price)&&valid(b.amount)):[];}
function ticker(exchange:'Binance'|'Bybit',value:any){
  if(exchange==='Binance') return {name:exchange,price:N(value?.lastPrice),change24h:N(value?.priceChangePercent),high24h:N(value?.highPrice),low24h:N(value?.lowPrice),volume24h:N(value?.volume)};
  const v=value?.result?.list?.[0]||{};
  return {name:exchange,price:N(v.lastPrice),change24h:N(v.price24hPcnt)*100,high24h:N(v.highPrice24h),low24h:N(v.lowPrice24h),volume24h:N(v.volume24h)};
}

export async function getMarketSnapshot(symbol:string):Promise<PriceSnapshot>{
  if(!assets.some(a=>a.symbol===symbol)) throw new Error('Недопустимый торговый символ');
  const requests=await Promise.allSettled([
    attempt([`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,`https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`]),
    getJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`),
    attempt([`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=120`,`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=60&limit=120`]),
    getJson(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=20`),
    getJson(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=25`),
  ]);
  const value=(idx:number)=>requests[idx].status==='fulfilled'?(requests[idx] as PromiseFulfilledResult<any>).value:null;
  const b=ticker('Binance',value(0));const y=ticker('Bybit',value(1));
  if(!valid(b.price)&&!valid(y.price)) throw new Error('Ни Binance, ни Bybit не вернули актуальную цену');
  const klines=value(2);
  if(!klines) throw new Error('Не удалось получить свечи для прогноза');
  const candles=cleanCandles(Array.isArray(klines)?klines.map(candleFromBinance):candlesFromBybit(klines));
  const price=valid(b.price)?b.price:y.price;
  const smc=calculateSMC(candles,price);
  const bd=value(3)||{}, yd=value(4)?.result||{};
  const bx={name:'Binance' as const,price:b.price||0,change24h:b.change24h,high24h:b.high24h,low24h:b.low24h,volume24h:b.volume24h,orderBook:{topBids:book(bd.bids).slice(0,5),topAsks:book(bd.asks).slice(0,5)},status:valid(b.price)?'LIVE':'UNAVAILABLE'};
  const by={name:'Bybit' as const,price:y.price||0,change24h:y.change24h,high24h:y.high24h,low24h:y.low24h,volume24h:y.volume24h,orderBook:{topBids:book(yd.b).slice(0,5),topAsks:book(yd.a).slice(0,5)},status:valid(y.price)?'LIVE':'UNAVAILABLE'};
  const pair=valid(b.price)&&valid(y.price),sp=pair?Math.abs(b.price-y.price):0;
  return {timestamp:Date.now(),symbol,asset:assets.find(a=>a.symbol===symbol)!,exchanges:{binance:bx,bybit:by},comparison:{spreadAbsolute:sp,spreadPercent:pair?sp/b.price*100:0,cheaperExchange:pair&&y.price<b.price?'Bybit':'Binance',arbitragePossible:pair&&sp/b.price>0.0008},klinesSummary:{count:candles.length,candles:candles.slice(-40)},smc};
}

export function getWhaleRadar(snapshot:PriceSnapshot):WhaleRadarData {
  const books=[snapshot.exchanges.binance,snapshot.exchanges.bybit];
  const entries=books.flatMap(ex=>[...ex.orderBook.topBids.map(b=>({...b,exchange:ex.name,side:'BID'})),...ex.orderBook.topAsks.map(b=>({...b,exchange:ex.name,side:'ASK'}))]);
  const usd=entries.map(b=>b.price*b.amount),avg=usd.length?usd.reduce((a,b)=>a+b,0)/usd.length:0;
  const large=entries.filter(b=>b.price*b.amount>=Math.max(50000,avg*1.5)).sort((a,b)=>b.price*b.amount-a.price*a.amount).slice(0,8);
  const bigBuy=large.filter(x=>x.side==='BID').length,bigSell=large.length-bigBuy;
  const blank={outflowUsd:0,inflowUsd:0,net:'UNAVAILABLE'};
  return {
    baseAsset:snapshot.asset.base,
    scope:'Заявки стакана Binance/Bybit. Ончейн-транзакции, ETF и идентификация кошельков недоступны',
    trackedEntitiesCount:0,
    whaleDominanceIndex:large.length?Math.round(bigBuy/large.length*100):0,
    onchainAvailable:false,
    sentimentWhale:large.length?`ВИДИМЫЕ ЗАЯВКИ: ${bigBuy} BUY / ${bigSell} SELL`:'Нет достаточных данных',
    summaryRu:large.length?`Найдены ${large.length} заметных лимитных заявок в доступной глубине стакана Binance и Bybit. Это НЕ подтверждённые ончейн-переводы или сделки китов.`:'Заявки стакана недоступны. Ончейн-источник пока не подключён.',
    netflow24h:{binance:{...blank},bybit:{...blank},coinbase:{...blank},okx:{...blank},kraken:{...blank},totalGlobalExchangeNetflow:{...blank}},
    etfInstitutionalFlow24h:null,
    recentAlerts:large.map((x,i)=>({id:`book-${snapshot.timestamp}-${i}`,time:snapshot.timestamp,amountFormatted:`${x.amount.toLocaleString('ru-RU')} ${snapshot.asset.base} (${Math.round(x.amount*x.price).toLocaleString('ru-RU')} USDT)`,usdValue:x.amount*x.price,from:`${x.exchange} Spot — лимитная заявка`,to:x.side==='BID'?'Сторона покупателей (BID)':'Сторона продавцов (ASK)',type:'ORDER_BOOK_LIQUIDITY',category:'EXCHANGE' as const,entityTag:x.exchange,description:'Видимая заявка в стакане; может быть отменена. Это не перевод между кошельками.',impact:x.side==='BID'?'BULLISH' as const:'BEARISH' as const,confidence:0})),
  };
}
export async function getSentiment(symbol:string):Promise<SentimentData>{
  let fng={value:0,classification:'Недоступно',timestamp:0};let available=false;
  try {const j=await getJson('https://api.alternative.me/fng/?limit=1');const d=j?.data?.[0];if(d&&Number.isFinite(+d.value)){fng={value:+d.value,classification:String(d.value_classification||'Neutral'),timestamp:N(d.timestamp)*1000};available=true;}}catch{}
  return {asset:symbol.replace('USDT',''),fearAndGreed:fng,fearAndGreedAvailable:available,socialDataAvailable:false,mlModelMetrics:{name:'Нет подтверждённого социального источника',sentimentScore:0,classification:'DATA_UNAVAILABLE',sentimentDistribution:{positive:0,neutral:0,negative:0},socialVolumeSpikes:{twitterX:'Нет данных',reddit:'Нет данных',telegramAlpha:'Нет данных'},viralKeywords:[],divergenceDetected:false,summaryRu:'X/Reddit/Telegram не подключены. Никакие значения социальных настроений не симулируются.'}};
}
