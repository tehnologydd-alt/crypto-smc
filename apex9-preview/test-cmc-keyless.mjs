import test from 'node:test';
import assert from 'node:assert/strict';
import {cmcKeylessUrl,parseCmcKeyless,fetchCmcKeyless} from './cmc-keyless.mjs';
const now=Date.UTC(2026,10,9,12);
const sample=(opts={})=>({status:{error_code:'0'},data:[{
 id:1,name:'Bitcoin',symbol:'BTC',slug:'bitcoin',
 quotes:[{symbol:'USD',price:70000,market_cap:1.3e12,volume_24h:1e10,
 percent_change_24h:2.1,last_updated:new Date(now-5000).toISOString()}],
 ...opts
}]});
test('CoinMarketCap uses its public no-key endpoint and pinned asset ID',()=>{
 const url=cmcKeylessUrl('BTCUSDT');
 const u=new URL(url);
 assert.equal(u.origin,'https://pro-api.coinmarketcap.com');
 assert.equal(u.pathname,'/public-api/v2/simple/price');
 assert.equal(u.searchParams.get('id'),'1');
 assert.equal(u.searchParams.get('include_all'),'true');
 assert.equal(u.searchParams.get('convert'),'USD');
 assert.equal(cmcKeylessUrl('FAKEUSDT'),null);
 assert.equal(cmcKeylessUrl('__proto__USDT'),null);
});
test('validated public aggregate is never represented as a venue execution quote',()=>{
 const r=parseCmcKeyless(sample(),{symbol:'BTCUSDT',now});
 assert.equal(r.state,'OK');assert.equal(r.data.priceUsd,70000);
 assert.equal(r.data.scope,'USD_ASSET_AGGREGATE_NOT_SPOT_OR_DEX');
 assert.equal(r.data.observedAt,now-5000);
 assert.equal(r.data.notDirectionalEvidence,true);
});
test('identities, timestamp and price require strict matches',()=>{
 assert.equal(parseCmcKeyless(sample({id:1027}),{symbol:'BTCUSDT',now}).state,'INVALID');
 assert.equal(parseCmcKeyless(sample({slug:'bitcoin-scam'}),{symbol:'BTCUSDT',now}).state,'INVALID');
 assert.equal(parseCmcKeyless({...sample(),status:{error_code:1001}},
  {symbol:'BTCUSDT',now}).state,'INVALID');
 const bad=sample();bad.data[0].quotes[0].last_updated='2020-01-01T00:00:00.000Z';
 assert.equal(parseCmcKeyless(bad,{symbol:'BTCUSDT',now}).state,'INVALID');
 const badPrice=sample();badPrice.data[0].quotes[0].price='70000';
 assert.equal(parseCmcKeyless(badPrice,{symbol:'BTCUSDT',now}).state,'INVALID');
});
test('no key, no credential headers and HTTP 429 fails closed',async()=>{
 let seen=0;
 const ok=await fetchCmcKeyless('BTCUSDT',{now:()=>now,
  fetchImpl:async(url,opts)=>{
   seen++;assert.ok(url.includes('/public-api/'));
   assert.equal(opts.credentials,'omit');
   assert.equal(opts.headers.Accept,'application/json');
   assert.equal('Authorization' in opts.headers,false);
   return {ok:true,status:200,json:async()=>sample()};
  }});
 assert.equal(ok.state,'OK');assert.equal(seen,1);
 const limit=await fetchCmcKeyless('BTCUSDT',{fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(limit.state,'RATE_LIMITED');
});
