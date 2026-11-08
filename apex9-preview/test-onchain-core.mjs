import test from 'node:test';
import assert from 'node:assert/strict';
import {chainForAsset,parseBitcoinNetwork,parseEthereumNetwork,collectOnChainNetwork,
 parseOnChainHistory,summarizeOnChainHistory} from './onchain-core.mjs';
const now=1794139200000;
const btc={count:5050,vsize:1770707,total_fee:555111};
const fees={fastestFee:5,halfHourFee:4,hourFee:3,economyFee:2,minimumFee:1};
const eth={total_transactions:'3650000000',transactions_today:'1730200',
 total_blocks:'24445000',average_block_time:12000,network_utilization_percentage:62.1,
 gas_prices:{average:.7},gas_price_updated_at:new Date(now-120000).toISOString()};
test('direct network mapping never conflates unrelated tokens with BTC or Ethereum',()=>{
 assert.equal(chainForAsset('BTCUSDT'),'bitcoin');
 assert.equal(chainForAsset('ETHUSDT'),'ethereum');
 assert.equal(chainForAsset('GRAMUSDT'),null);
 assert.equal(chainForAsset('WBTCUSDT'),null);
 assert.equal(chainForAsset('TONUSDT'),null);
});
test('BTC capture timestamp is explicit and fees optional',()=>{
 const r=parseBitcoinNetwork(btc,{fees,receivedAt:now});
 assert.equal(r.observedAt,now);assert.equal(r.timestampScope,'CLIENT_CAPTURE_NO_PROVIDER_TIMESTAMP');
 assert.equal(r.feeRates.hourFee,3);
 const none=parseBitcoinNetwork(btc,{receivedAt:now});
 assert.equal(none.feeRates,null);
 assert.throws(()=>parseBitcoinNetwork({...btc,count:-1},{receivedAt:now}));
});
test('Ethereum counters use verified values but no spurious price claims',()=>{
 const r=parseEthereumNetwork(eth,now);
 assert.equal(r.averageBlockTimeSeconds,12);
 assert.equal(r.averageGasGwei,.7);
 assert.equal(r.networkUtilizationPct,62.1);
 assert.equal(r.notWhaleEvidence,true);
 const stale={...eth,gas_price_updated_at:new Date(now-7200000).toISOString()};
 assert.equal(parseEthereumNetwork(stale,now).averageGasGwei,null);
 assert.throws(()=>parseEthereumNetwork({...eth,network_utilization_percentage:110},now));
});
test('public read-only endpoint with no credentials, without an exchange order',async()=>{
 const calls=[];
 const r=await collectOnChainNetwork('BTCUSDT',{now:()=>now,fetchImpl:async(url,opts)=>{
  calls.push({url,opts});return {ok:true,status:200,json:async()=>url.includes('/fees/')?fees:btc};
 }});
 assert.equal(r.state,'OK');
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.opts.method==='GET'&&x.opts.credentials==='omit'));
 assert.equal(r.data.mempoolCount,5050);
 const ethResponse=await collectOnChainNetwork('ETHUSDT',{now:()=>now,fetchImpl:async()=>({
  ok:true,status:200,json:async()=>eth
 })});
 assert.equal(ethResponse.data.totalBlocks,24445000);
});
test('partial BTC fee outage does not invent data or hide valid mempool',async()=>{
 const result=await collectOnChainNetwork('BTCUSDT',{now:()=>now,fetchImpl:async url=>
  url.includes('/fees/')?{ok:false,status:429}:{ok:true,status:200,json:async()=>btc}
 });
 assert.equal(result.state,'OK');assert.equal(result.data.feeRates,null);
});
test('unavailable source or unsupported chain gives no synthetic observations',async()=>{
 let calls=0;
 const a=await collectOnChainNetwork('GRAMUSDT',{fetchImpl:async()=>{calls++;throw Error('No');}});
 assert.equal(a.state,'UNSUPPORTED');assert.equal(calls,0);
 const b=await collectOnChainNetwork('ETHUSDT',{fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(b.state,'OFFLINE');assert.equal(b.data,null);
});
test('offline cache history is distinct by source and age',()=>{
 const data=parseBitcoinNetwork(btc,{fees,receivedAt:now-600000});
 const a={source:'mempool:bitcoin:network',observedAt:data.observedAt,
  collectedAt:data.collectedAt,payload:JSON.stringify(data)};
 const invalid={...a,source:'blockscout:ethereum:stats'};
 assert.equal(parseOnChainHistory([a,invalid],'bitcoin').length,1);
 const study=summarizeOnChainHistory([a],{chain:'bitcoin',now});
 assert.equal(study.state,'HISTORICAL');
 assert.equal(study.latest.mempoolCount,5050);
});
