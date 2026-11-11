import test from 'node:test';
import assert from 'node:assert/strict';
import {collectAsset,fetchSpotCatalog,fetchSpotTicker,normalizeSymbol,parseTicker} from './research.mjs';
const t=1700000000000;
const ticker={symbol:'GRAMUSDT',lastPrice:'2.125',priceChangePercent:'2.9',
 quoteVolume:'555555',closeTime:t-1000};
const book={lastUpdateId:123,bids:[['2.12','200']],asks:[['2.13','100']]};
const okx={code:'0',msg:'',data:[{bids:[['2.12','100','0','1']],
 asks:[['2.13','150','0','1']],ts:String(t-100),seqId:22}]};
function fakeFetch(url){
 if(url.includes('/ticker/24hr'))return Promise.resolve({ok:true,status:200,json:async()=>ticker});
 if(url.includes('binance.vision/api/v3/depth'))return Promise.resolve({ok:true,status:200,json:async()=>book});
 if(url.includes('okx.com'))return Promise.resolve({ok:true,status:200,json:async()=>okx});
 throw Error('Unexpected URL '+url);
}
test('GRAM text search maps to GRAMUSDT and supports full pairs',()=>{
 assert.equal(normalizeSymbol('gram'),'GRAMUSDT');
 assert.equal(normalizeSymbol('TON'),'GRAMUSDT');
 assert.equal(normalizeSymbol('TONUSDT'),'GRAMUSDT');
 assert.equal(normalizeSymbol('GRAMUSDT'),'GRAMUSDT');
 assert.equal(normalizeSymbol('btc/usdt'),'BTCUSDT');
 assert.equal(normalizeSymbol('btc usdt'),'BTCUSDT');
 assert.equal(normalizeSymbol('BTCUSDT&x'),null);
});
test('ticker parser rejects stale, future, malformed or mismatched inputs',()=>{
 assert.equal(parseTicker(ticker,'GRAMUSDT',t).price,2.125);
 assert.throws(()=>parseTicker(ticker,'BTCUSDT',t));
 assert.throws(()=>parseTicker({...ticker,closeTime:t-9999999},'GRAMUSDT',t));
 assert.throws(()=>parseTicker({...ticker,closeTime:t+90000},'GRAMUSDT',t));
});
test('collect independently reports 3 real source results without pretending forecast',async()=>{
 const r=await collectAsset('gram',{fetchImpl:fakeFetch,now:()=>t});
 assert.equal(r.symbol,'GRAMUSDT');assert.equal(r.ticker.price,2.125);
 assert.equal(r.depth.length,2);
 assert.equal(r.sources.filter(x=>x.state==='OK').length,3);
 assert.equal(r.assessment.assessment,'INSUFFICIENT');
 assert.equal(r.assessment.isCalibratedProbability,false);
 assert.deepEqual(r.assessment.coveredLayers,['market','liquidity']);
});
test('network failure does not invent data',async()=>{
 const r=await collectAsset('GRAMUSDT',{fetchImpl:async()=>{throw Error('blocked')},now:()=>t});
 assert.equal(r.ticker,null);assert.equal(r.depth.length,0);
 assert.equal(r.sources.filter(x=>x.state==='OFFLINE').length,3);
 assert.equal(r.assessment.contextBalance,null);
});
test('rate-limit source remains distinct from functioning alternate venue',async()=>{
 const r=await collectAsset('GRAMUSDT',{now:()=>t,fetchImpl:async(url)=>{
  if(url.includes('binance.vision'))return {ok:false,status:429};
  return {ok:true,status:200,json:async()=>okx};
 }});
 assert.equal(r.sources[0].state,'RATE_LIMITED');
 assert.equal(r.sources[1].state,'RATE_LIMITED');
 assert.equal(r.sources[2].state,'OK');
 assert.equal(r.assessment.assessment,'INSUFFICIENT');
});
test('catalog loads all valid trading spot USDT pairs, not a hardcoded subset',async()=>{
 const r=await fetchSpotCatalog({fetchImpl:async()=>({ok:true,status:200,json:async()=>({
  symbols:[{symbol:'GRAMUSDT',status:'TRADING',quoteAsset:'USDT',isSpotTradingAllowed:true},
   {symbol:'BTCUSDT',status:'TRADING',quoteAsset:'USDT'},
   {symbol:'XXXUSDT',status:'BREAK',quoteAsset:'USDT'},
   {symbol:'BTCEUR',status:'TRADING',quoteAsset:'EUR'}]
 })})});
 assert.equal(r.state,'OK');
 assert.deepEqual(r.symbols,['BTCUSDT','GRAMUSDT']);
});
test('invalid ticker input is rejected before fetch',async()=>{
 const r=await fetchSpotTicker('GRAMUSDT&bad',{fetchImpl:async()=>{throw Error('called')}});
 assert.equal(r.state,'INVALID');
});
