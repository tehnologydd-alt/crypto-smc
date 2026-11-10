import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLinearDerivatives,fetchLinearDerivatives,publicWalletNetwork,
 parsePublicWallet,fetchPublicWallet,summarizePublicDiscussion
} from './research-layer-core.mjs';
const at=Date.UTC(2026,10,10,9,0);
const eth='0x'+'a'.repeat(40);
const btc='1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const valid={retCode:0,time:at-2000,result:{category:'linear',list:[
 {symbol:'BTCUSDT',openInterest:'100.25',openInterestValue:'15000000',
  fundingRate:'-0.0001',markPrice:'100000',nextFundingTime:String(at+3600000)}
]}};
test('public derivatives are time-bounded, read-only and do not invent liquidations',()=>{
 const r=parseLinearDerivatives(valid,{symbol:'BTCUSDT',now:at});
 assert.equal(r.state,'OK');
 assert.equal(r.data.openInterestUsd,15000000);
 assert.equal(r.data.fundingRatePercent,-0.01);
 assert.equal(r.data.liquidationEvents.state,'NOT_CONNECTED');
 assert.equal(r.data.notDirectionalEvidence,true);
 assert.equal(Object.hasOwn(r.data,'tradingSignal'),false);
});
test('wrong symbol, invalid values, stale quotes or provider errors fail visibly',()=>{
 assert.equal(parseLinearDerivatives(valid,{symbol:'ETHUSDT',now:at}).state,'UNSUPPORTED');
 assert.equal(parseLinearDerivatives(valid,{symbol:'BTCUSDT',now:at+3600000}).state,'INVALID');
 assert.equal(parseLinearDerivatives({...valid,retCode:10006},{symbol:'BTCUSDT',now:at}).state,'RATE_LIMITED');
 const wrong={...valid,result:{...valid.result,list:[{...valid.result.list[0],openInterest:'nan'}]}};
 assert.equal(parseLinearDerivatives(wrong,{symbol:'BTCUSDT',now:at}).state,'INVALID');
});
test('read-only endpoint without keys, with HTTP access failures distinguishable',async()=>{
 let calls=0;
 const r=await fetchLinearDerivatives('BTCUSDT',{now:()=>at,
  fetchImpl:async(url,opts)=>{
   calls++;
   assert.equal(url,'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
   assert.equal(opts.method,'GET');
   assert.equal(opts.credentials,'omit');
   assert.equal(Object.hasOwn(opts,'body'),false);
   return {ok:true,json:async()=>valid};
  }});
 assert.equal(calls,1);assert.equal(r.state,'OK');
 assert.equal((await fetchLinearDerivatives('BTCUSDT',{
  fetchImpl:async()=>({ok:false,status:403})})).state,'ACCESS_DENIED');
 assert.equal((await fetchLinearDerivatives('BTCUSDT',{
  fetchImpl:async()=>({ok:false,status:429})})).state,'RATE_LIMITED');
 assert.equal((await fetchLinearDerivatives('INVALID_PAIR',{
  fetchImpl:async()=>{throw Error('must not call')}})).state,'UNSUPPORTED');
});
test('public wallet network classification rejects secrets and nonsense strings',()=>{
 assert.equal(publicWalletNetwork(eth),'ethereum');
 assert.equal(publicWalletNetwork(btc),'bitcoin');
 assert.equal(publicWalletNetwork('0x12345'),null);
 assert.equal(publicWalletNetwork('private_key'),null);
 assert.equal(publicWalletNetwork(''),null);
});
test('ETH balance uses integer wei; no inferred owner or whale identity',()=>{
 const r=parsePublicWallet({hash:eth,coin_balance:'1250000000000000000'},
  {address:eth,network:'ethereum',now:at});
 assert.equal(r.state,'OK');
 assert.equal(r.data.nativeUnit,'ETH');
 assert.equal(r.data.confirmedNativeBalance,1.25);
 assert.equal(r.data.ownerVerified,false);
 assert.equal(r.data.largeWalletVerified,false);
 assert.equal(parsePublicWallet({hash:'0x'+'b'.repeat(40),coin_balance:'1'},
  {address:eth,network:'ethereum',now:at}).state,'INVALID');
});
test('BTC confirmed balance is computed only from checked chain sums',()=>{
 const r=parsePublicWallet({address:btc,chain_stats:{
  funded_txo_sum:200000000,spent_txo_sum:60000000}},
  {address:btc,network:'bitcoin',now:at});
 assert.equal(r.state,'OK');assert.equal(r.data.confirmedNativeBalance,1.4);
 assert.equal(r.data.largeWalletVerified,false);
 assert.equal(parsePublicWallet({address:btc,chain_stats:{
  funded_txo_sum:1,spent_txo_sum:10}},
  {address:btc,network:'bitcoin',now:at}).state,'INVALID');
});
test('explicit wallet public GET calls are bounded to two fixed explorer hosts',async()=>{
 for(const [address,origin,payload] of [
  [eth,'https://eth.blockscout.com/api/v2/addresses/',{hash:eth,coin_balance:'0'}],
  [btc,'https://mempool.space/api/address/',{address:btc,chain_stats:{
   funded_txo_sum:2,spent_txo_sum:0}}]
 ]){
  const r=await fetchPublicWallet(address,{now:()=>at,
   fetchImpl:async(url,opts)=>{
    assert.equal(url,origin+encodeURIComponent(address));
    assert.equal(opts.credentials,'omit');
    return {ok:true,json:async()=>payload};
   }});
  assert.equal(r.state,'OK');
 }
});
test('social word counts use only supplied recent posts and never imply broad sentiment',()=>{
 const r=summarizePublicDiscussion({state:'OK',posts:[
  {text:'Bitcoin rally possible',indexedAt:at-1000},
  {text:'bearish update?',indexedAt:at-2000},
  {text:'hello world',indexedAt:at-3000},
  {text:'old bullish',indexedAt:at-30*3600000}
 ]},{now:at});
 assert.equal(r.posts,3);
 assert.equal(r.keywordUp,1);assert.equal(r.keywordDown,1);
 assert.equal(r.ambiguous,1);
 assert.equal(r.credibleSentiment,'NOT_ESTABLISHED');
 assert.equal(summarizePublicDiscussion({state:'OFFLINE'},{now:at}).state,'OFFLINE');
});
