import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalContextAsset,parseCryptoGlobal,fetchCryptoGlobal,
 parseBitcoinMempool,fetchBitcoinMempool,parseAssetNews,fetchAssetNews,collectContext
} from './context-sources.mjs';
const now=1700000000000;
const global={data:{total_market_cap:{usd:1500000000},
 total_volume:{usd:70000000},market_cap_percentage:{btc:54.2},
 market_cap_change_percentage_24h_usd:1.6,updated_at:Math.floor((now-3000)/1000)}};
const mempool={count:1234,vsize:660000,total_fee:1000000};
const seen='20231114T221200Z';
const news={articles:[{title:'Bitcoin news',url:'https://example.com/a',seendate:seen,domain:'example.com',language:'English'}]};
const response=(body)=>({ok:true,status:200,json:async()=>body});
test('assets map to specific unambiguous news search terms',()=>{
 assert.equal(canonicalContextAsset('GRAMUSDT').name,'Gram');
 assert.equal(canonicalContextAsset('TONUSDT').name,'Gram');
 assert.equal(canonicalContextAsset('BTCUSDT').base,'BTC');
 assert.equal(canonicalContextAsset('ABCDUSDT'),null);
});
test('global data requires provider timestamp and never claims asset trend',()=>{
 const x=parseCryptoGlobal(global,now);
 assert.equal(x.btcDominancePercent,54.2);
 assert.equal(x.notDirectionalEvidence,true);
 assert.throws(()=>parseCryptoGlobal({data:{...global.data,updated_at:null}},now));
 assert.throws(()=>parseCryptoGlobal({data:{...global.data,updated_at:1}},now));
});
test('global rate limit returns status without invented metrics',async()=>{
 const x=await fetchCryptoGlobal({fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(x.state,'RATE_LIMITED');assert.equal(x.data,null);
});
test('bitcoin mempool counts do not pretend to identify whales',()=>{
 const x=parseBitcoinMempool(mempool,now);
 assert.equal(x.transactionCount,1234);assert.equal(x.notWhaleTransfers,true);
 assert.throws(()=>parseBitcoinMempool({...mempool,count:-2},now));
});
test('bitcoin-only adapter refuses unrelated symbols before network',async()=>{
 const r=await fetchBitcoinMempool('GRAMUSDT',{fetchImpl:async()=>{throw Error('should not call')}});
 assert.equal(r.state,'UNSUPPORTED');assert.equal(r.data,null);
});
test('news parser rejects unsafe URLs, duplicates, future and stale timestamps',()=>{
 const date='20231114T221200Z';
 const r=parseAssetNews({articles:[
  {title:'Ok',url:'https://example.com/one',seendate:date},
  {title:'Duplicate',url:'https://example.com/one',seendate:date},
  {title:'Unsafe',url:'javascript:alert(1)',seendate:date},
  {title:'Missing',url:'https://example.com/m',seendate:'bad'}
 ]},'BTCUSDT',now);
 assert.equal(r.articles.length,1);assert.equal(r.articles[0].title,'Ok');
 assert.equal(r.notDirectionalEvidence,true);
});
test('unsupported news search does not call API',async()=>{
 const r=await fetchAssetNews('UNKNOWNUSDT',{fetchImpl:async()=>{throw Error('should not call')}});
 assert.equal(r.state,'UNSUPPORTED');
});
test('context collector separates live data and unsupported coverage',async()=>{
 const f=async url=>{
  if(url.includes('coingecko'))return response(global);
  if(url.includes('gdelt'))return response({articles:[]});
  return response(mempool);
 };
 const r=await collectContext('GRAMUSDT',{fetchImpl:f,now:()=>now});
 assert.deepEqual(r.sources.map(x=>x.state),['OK','UNSUPPORTED','EMPTY']);
 assert.equal(r.coverage,1);
 assert.equal(r.sources[0].data.notDirectionalEvidence,true);
});
test('bitcoin network source appears only on bitcoin',async()=>{
 const f=async url=>{
  if(url.includes('coingecko'))return response(global);
  if(url.includes('mempool.space'))return response(mempool);
  return response({articles:[]});
 };
 const r=await collectContext('BTCUSDT',{fetchImpl:f,now:()=>now});
 assert.equal(r.sources[1].state,'OK');
 assert.equal(r.sources[1].data.transactionCount,1234);
});

test('asset news gate keeps normal market polling from bypassing daily quotas',async()=>{
 let calls=0;
 const guarded=async (symbol,fetcher)=>{
  calls++;
  if(symbol==='BTCUSDT')return {state:'LIMIT_REACHED',
   data:null,reason:'No further GDELT requests'};
  return fetcher();
 };
 const f=async url=>{
  if(url.includes('coingecko'))return response(global);
  if(url.includes('mempool.space'))return response(mempool);
  if(url.includes('gdelt'))throw Error('GDELT budget was bypassed');
  return response({});
 };
 const result=await collectContext('BTCUSDT',{fetchImpl:f,now:()=>now,
  newsGate:guarded});
 assert.equal(calls,1);
 assert.equal(result.sources[2].state,'LIMIT_REACHED');
 assert.equal(result.sources[0].state,'OK');
});
