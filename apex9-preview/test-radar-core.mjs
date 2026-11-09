import test from 'node:test';
import assert from 'node:assert/strict';
import {RADAR_LIMIT,RADAR_INTERVALS,parseRadarUniverse,fetchRadarUniverse,
 describeRadarFrame,filterRadarRows,validRadarInterval} from './radar-core.mjs';

const now=1800000000000;
const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT',
 'ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','TRXUSDT','LTCUSDT','BCHUSDT',
 'DOTUSDT','USDCUSDT','BADUSDT'];
const tick=(symbol,quoteVolume,extra={})=>({
 symbol,quoteVolume:String(quoteVolume),lastPrice:'10.25',
 priceChangePercent:'1.75',closeTime:now-20000,...extra
});
test('radar universe selects only fresh whitelisted Spot USDT nonstable pairs',()=>{
 const raw=[tick('BTCUSDT',120),tick('ETHUSDT',220),
  tick('XRPUSDT',300),tick('USDCUSDT',999999),
  tick('BADUSDT',1000,{lastPrice:'NaN'}),
  tick('DOGEUSDT',200,{closeTime:now-400000}),
  tick('HACKUSDT',999999),tick('SOLUSDT',400,{priceChangePercent:'Infinity'}),
  tick('ADAUSDT',80,{closeTime:now+70000})];
 const result=parseRadarUniverse(raw,{catalog:symbols,now});
 assert.equal(result.state,'OK');
 assert.deepEqual(result.rows.map(x=>x.symbol),['XRPUSDT','ETHUSDT','BTCUSDT']);
 assert.equal(result.rows[0].quoteVolume,300);
 assert.equal(result.rows[0].change24h,1.75);
});
test('radar universe is hard-capped at twelve with verified turnover ranking',()=>{
 const raw=symbols.map((symbol,i)=>tick(symbol,10+i));
 const result=parseRadarUniverse(raw,{catalog:symbols,now});
 assert.equal(result.rows.length,RADAR_LIMIT);
 assert.ok(!result.rows.some(x=>x.symbol==='USDCUSDT'));
 assert.equal(result.rows[0].symbol,'DOTUSDT');
 assert.equal(parseRadarUniverse(raw,{catalog:symbols,now,limit:13}).state,'INVALID');
 assert.equal(parseRadarUniverse(raw,{catalog:[],now}).state,'NEEDS_CATALOG');
});
test('a missing or stale feed never invents market entries',()=>{
 assert.equal(parseRadarUniverse({}, {catalog:symbols,now}).state,'INVALID');
 assert.equal(parseRadarUniverse([tick('ETHUSDT',10,{closeTime:now-300001})],
  {catalog:symbols,now}).state,'NO_FRESH_TICKERS');
 assert.equal(parseRadarUniverse([tick('ETHUSDT',10,{quoteVolume:'-1'})],
  {catalog:symbols,now}).rows.length,0);
});
test('read-only universe fetch preserves network failure and rate limit',async()=>{
 const blocked=await fetchRadarUniverse({
  catalog:symbols,fetchImpl:async()=>({status:429,ok:false}),now:()=>now});
 assert.equal(blocked.state,'RATE_LIMITED');
 const unavailable=await fetchRadarUniverse({
  catalog:symbols,fetchImpl:async()=>{throw Error('blocked network');},now:()=>now});
 assert.equal(unavailable.state,'OFFLINE');
 const aborter=new AbortController();aborter.abort();
 const aborted=await fetchRadarUniverse({
  catalog:symbols,signal:aborter.signal,
  fetchImpl:async()=>{throw Error('aborted');},now:()=>now});
 assert.equal(aborted.state,'CANCELLED');
 const api=[];
 const result=await fetchRadarUniverse({catalog:symbols,now:()=>now,
  fetchImpl:async(url,opts)=>{
   api.push({url,opts});
   return {status:200,ok:true,json:async()=>[tick('BTCUSDT',100)]};
  }});
 assert.equal(result.state,'OK');
 assert.equal(result.rows[0].symbol,'BTCUSDT');
 assert.equal(api.length,1);
 assert.match(api[0].url,/data-api\.binance\.vision\/api\/v3\/ticker\/24hr$/);
 assert.equal(api[0].opts.method,'GET');
 assert.equal(api[0].opts.credentials,'omit');
});
test('frame analysis rejects stale/unsupported source instead of upgrading to a signal',()=>{
 const raw={status:'OK',interval:'1h',direction:'UP',mode:'DIRECTIONAL',
  velocityPctPerBar:.21,volumeRatio:1.7,lastClosedAt:now-3600000,efficiency:.65};
 const found=describeRadarFrame(raw);
 assert.equal(found.state,'OK');
 assert.equal(found.direction,'UP');
 assert.equal(found.volumeRatio,1.7);
 assert.equal(describeRadarFrame({...raw,status:'STALE'}).state,'STALE');
 assert.equal(describeRadarFrame({...raw,interval:'5m'}).state,'OK'===undefined?'OK':'NO_DATA');
 assert.equal(describeRadarFrame(null).state,'NO_DATA');
 assert.deepEqual(RADAR_INTERVALS,['15m','1h','4h','1d']);
 assert.equal(validRadarInterval('5m'),false);
 assert.equal(validRadarInterval('4h'),true);
});
test('filter and sort use observed fields only; missing rows are excluded',()=>{
 const make=(symbol,direction,mode,movement,volumeRatio,quoteVolume)=>({
  symbol,quoteVolume,analysis:{state:'OK',direction,mode,movement,volumeRatio}
 });
 const raw=[make('BTCUSDT','UP','DIRECTIONAL',.11,1.4,1000),
  make('ETHUSDT','DOWN','RANGE',-.51,2.2,500),
  make('SOLUSDT','FLAT','MIXED',.03,1.1,650),
  {symbol:'BADUSDT',quoteVolume:9000,analysis:{state:'STALE',direction:'UP'}}];
 assert.deepEqual(filterRadarRows(raw).map(x=>x.symbol),
  ['BTCUSDT','SOLUSDT','ETHUSDT']);
 assert.deepEqual(filterRadarRows(raw,{filter:'up'}).map(x=>x.symbol),['BTCUSDT']);
 assert.deepEqual(filterRadarRows(raw,{filter:'range'}).map(x=>x.symbol),['ETHUSDT']);
 assert.deepEqual(filterRadarRows(raw,{filter:'changing'}).map(x=>x.symbol),['BTCUSDT']);
 assert.deepEqual(filterRadarRows(raw,{sort:'movement'}).map(x=>x.symbol),
  ['ETHUSDT','BTCUSDT','SOLUSDT']);
 assert.deepEqual(filterRadarRows(raw,{sort:'volume'}).map(x=>x.symbol),
  ['ETHUSDT','BTCUSDT','SOLUSDT']);
});
