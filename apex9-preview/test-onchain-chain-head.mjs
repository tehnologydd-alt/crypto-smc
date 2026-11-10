import test from 'node:test';
import assert from 'node:assert/strict';
import {chainHeadSourceForAsset,supportedChainHeadSymbols,parseChainHead,
 collectChainHead,createChainHeadCache} from './onchain-chain-head.mjs';
const now=Date.UTC(2026,10,10,12,0);
const time=new Date(now).toISOString();
const cases=[
 ['AVAXUSDT',{jsonrpc:'2.0',result:'0x1388'},5000],
 ['BNBUSDT',{jsonrpc:'2.0',result:'0x2328'},9000],
 ['SOLUSDT',{jsonrpc:'2.0',result:123456},123456],
 ['ADAUSDT',[{block_no:77777,block_time:now/1000}],77777],
 ['XRPUSDT',{result:{status:'success',validated:true,
  ledger:{ledger_index:55555}}},55555],
 ['DOTUSDT',{jsonrpc:'2.0',result:{number:'0x2710'}},10000],
 ['TRXUSDT',{block_header:{raw_data:{number:45678}}},45678],
 ['DOGEUSDT',{height:98765,time},98765],
 ['LTCUSDT',{height:12345,time},12345]
];
test('nine named networks parse only trusted public blockchain-head fields',()=>{
 assert.equal(supportedChainHeadSymbols().length,9);
 for(const [symbol,payload,height] of cases){
  const source=chainHeadSourceForAsset(symbol);
  assert.ok(source?.url.startsWith('https://'),symbol);
  const r=parseChainHead(payload,symbol,{now});
  assert.equal(r.state,'OK',symbol);
  assert.equal(r.data.chainHeight,height,symbol);
  assert.equal(r.data.base,symbol.slice(0,-4));
  assert.equal(r.data.scope,'CHAIN_HEAD_ONLY');
  assert.equal(r.data.notTransactionCount,true);
  assert.equal(r.data.notDirectionalEvidence,true);
 }
});
test('unmapped assets do not inherit another asset network or make a request',async()=>{
 assert.equal(chainHeadSourceForAsset('SHIBUSDT'),null);
 assert.equal(chainHeadSourceForAsset('LINKUSDT'),null);
 assert.equal(chainHeadSourceForAsset('TONUSDT'),null);
 let called=false;
 const r=await collectChainHead('SHIBUSDT',{fetchImpl:async()=>{
  called=true;throw Error('must not call');}});
 assert.equal(r.state,'UNSUPPORTED');
 assert.equal(called,false);
});
test('rejects invalid or unconfirmed provider values, not fictitious block counts',()=>{
 assert.equal(parseChainHead({jsonrpc:'2.0',result:'0xgarbage'},
  'AVAXUSDT',{now}).state,'INVALID');
 assert.equal(parseChainHead({jsonrpc:'2.0',result:10.1},
  'SOLUSDT',{now}).state,'INVALID');
 assert.equal(parseChainHead({result:{status:'error',ledger:{ledger_index:200}}},
  'XRPUSDT',{now}).state,'INVALID');
 assert.equal(parseChainHead([{block_no:222,block_time:(now+4*3600000)/1000}],
  'ADAUSDT',{now}).state,'INVALID');
 assert.equal(parseChainHead([{block_no:222,block_time:(now-4*3600000)/1000}],
  'ADAUSDT',{now}).state,'STALE');
});
test('only fixed HTTPS read-only endpoints, network denials are distinct from errors',async()=>{
 for(const [symbol,payload] of cases){
  let calls=0;
  const source=chainHeadSourceForAsset(symbol);
  const r=await collectChainHead(symbol,{now:()=>now,
   fetchImpl:async(url,opts)=>{
    calls++;assert.equal(url,source.url);
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.method,
     ['koios','blockcypher'].includes(source.kind)?'GET':'POST');
    if(opts.method==='POST'&&source.kind!=='tron'){
     const body=JSON.parse(opts.body);
     assert.equal(body.method,source.method);
     assert.deepEqual(Object.keys(body).filter(k=>/private|key|seed/i.test(k)),[]);
    }
    return {ok:true,status:200,json:async()=>payload};
   }});
  assert.equal(r.state,'OK',symbol);assert.equal(calls,1);
 }
 assert.equal((await collectChainHead('AVAXUSDT',{
  fetchImpl:async()=>({ok:false,status:429})})).state,'RATE_LIMITED');
 assert.equal((await collectChainHead('SOLUSDT',{
  fetchImpl:async()=>({ok:false,status:403})})).state,'ACCESS_DENIED');
});
test('device cache is per asset and an offline status cannot overwrite history',()=>{
 const m=new Map(),storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};
 const cache=createChainHeadCache({storage,now:()=>now});
 assert.equal(cache.store('AVAXUSDT',parseChainHead(cases[0][1],'AVAXUSDT',{now})),true);
 assert.equal(cache.store('AVAXUSDT',{state:'OFFLINE'}),false);
 assert.equal(cache.history('AVAXUSDT').length,1);
 assert.equal(cache.history('BNBUSDT').length,0);
 const restored=createChainHeadCache({storage,now:()=>now+60000});
 assert.equal(restored.history('AVAXUSDT')[0].chainHeight,5000);
 const expired=createChainHeadCache({storage,now:()=>now+8*86400000});
 assert.equal(expired.history('AVAXUSDT').length,0);
});
