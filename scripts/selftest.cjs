// A small deterministic integration test for the local algorithms and market adapter.
// Run with: npm test (requires dependencies installed, but does not need a network connection).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const modules = {};
const candles=[];
const start=1700000000000;
for(let i=0;i<120;i++) {
  const open=60000+i*20, close=open+10;
  candles.push([start+i*3600000,String(open),String(open+80),String(open-50),String(close),'10',start+(i+1)*3600000]);
}
let offline=false;
const mockHttp={get:async({url})=>{
  if(offline)throw Error('no connectivity');
  let data;
  if(url.includes('binance.com') && url.includes('ticker/24hr'))data={lastPrice:'62400',priceChangePercent:'2.5',highPrice:'63000',lowPrice:'59000',volume:'500'};
  else if(url.includes('bybit.com')&&url.includes('tickers'))data={result:{list:[{lastPrice:'62410',price24hPcnt:'0.025',highPrice24h:'63020',lowPrice24h:'59100',volume24h:'400'}]}};
  else if(url.includes('binance.com')&&url.includes('depth'))data={bids:[['62390','5']],asks:[['62410','4']]};
  else if(url.includes('bybit.com')&&url.includes('orderbook'))data={result:{b:[['62390','2']],a:[['62415','3']]}};
  else if(url.includes('klines'))data=candles;
  else if(url.includes('alternative.me'))data={data:[{value:'43',timestamp:'1700000000',value_classification:'Fear'}]};
  else throw Error('unexpected URL: '+url);
  return {status:200,data};
}};
function load(rel){
  if(modules[rel])return modules[rel].exports;
  const full=path.resolve(__dirname,'..',rel);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};modules[rel]=mod;
  const requireLocal=(name)=>name==='@capacitor/core'?{Capacitor:{isNativePlatform:()=>true},CapacitorHttp:mockHttp}:name.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(rel),name))+'.ts'):require(name);
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console,Date,Promise,AbortController,setTimeout,clearTimeout}, {filename:full})(requireLocal,mod,mod.exports);
  return mod.exports;
}
(async()=>{
 const m=load('src/lib/market.ts');
 const s=await m.fetchMarket('BTCUSDT');
 if(s.exchanges.binance.price!==62400||s.exchanges.bybit.price!==62410||s.comparison.spreadAbsolute!==10)throw Error('Unexpected live price snapshot');
 if(s.klinesSummary.count!==120||!s.smc)throw Error('SMC unavailable with supplied candles');
 const w=m.deriveOrderWalls(s);
 if(!w.walls.length||w.walls[0].usdValue<=0)throw Error('Order book not processed');
 const analysis=m.analyzeLocally(s,w);
 if(analysis.votes.length!==3||analysis.dataStatus.includes('86%'))throw Error('Local analysis failed');
 const sentiment=await m.fetchSentiment(s);
 if(sentiment.fearAndGreed.value!==43)throw Error('Fear & Greed parse failed');
 offline=true;let failed=false;try{await m.fetchMarket('BTCUSDT');}catch{failed=true;}
 if(!failed)throw Error('App must not invent quotes when both exchanges fail');
 console.log('PASS: market snapshot, SMC, order book, local analysis, sentiment, no fabricated offline quotes.');
})().catch(e=>{console.error(e);process.exit(1)});
