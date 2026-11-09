import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeSourceBudget} from './free-source-budget.mjs';
import {parseFearGreed,parseOkxTicker,parseDexPairs,parseGeckoPools,
 fetchDexPairs,fetchGeckoPools,fetchOkxTicker,dexTokenReference,
 parsePaprikaTicker,fetchPaprikaTicker} from './free-source-adapters.mjs';
const at=Date.UTC(2026,10,9,15);
const memory=()=>{const m=new Map();return{
 getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),m};};
test('resets daily counts without bypassing hourly source spacing',async()=>{
 const storage=memory();let t=Date.UTC(2026,10,9,23,55),calls=0;
 const b=createFreeSourceBudget({storage,now:()=>t});
 const fetcher=async()=>{calls++;return {state:'OK',data:{value:1}};};
 assert.equal((await b.load('okx',fetcher,{key:'BTCUSDT'})).state,'OK');
 t+=10*60000;
 assert.equal((await b.load('okx',fetcher,{key:'ETHUSDT'})).state,'WAIT_INTERVAL');
 assert.equal(b.status('okx').used,0);
 assert.equal(b.status('okx').monthlyUsed,1);
 t+=3600000;
 assert.equal((await b.load('okx',fetcher,{key:'ETHUSDT'})).state,'OK');
 assert.equal(calls,2);
});
test('failed requests consume the quota and never generate fake source values',async()=>{
 const b=createFreeSourceBudget({storage:memory(),now:()=>at});let calls=0;
 assert.equal((await b.load('dex',async()=>{
  calls++;return {state:'RATE_LIMITED'};},{key:'ETHUSDT'})).state,'RATE_LIMITED');
 assert.equal(b.status('dex').used,1);
 assert.equal((await b.load('dex',async()=>{calls++;},{key:'ETHUSDT'})).state,'WAIT_INTERVAL');
 assert.equal(calls,1);
});
test('fresh cached data persists between controllers and symbols are isolated',async()=>{
 const s=memory();let calls=0;
 const fetcher=async()=>{calls++;return {state:'OK',data:{price:1}};};
 const a=createFreeSourceBudget({storage:s,now:()=>at});
 assert.equal((await a.load('okx',fetcher,{key:'BTCUSDT'})).source,'NETWORK');
 const b=createFreeSourceBudget({storage:s,now:()=>at+60000});
 assert.equal((await b.load('okx',fetcher,{key:'BTCUSDT'})).source,'CACHE');
 assert.equal(calls,1);
 assert.equal((await b.load('okx',fetcher,{key:'ETHUSDT'})).state,'WAIT_INTERVAL');
 assert.equal(createFreeSourceBudget({storage:null,now:()=>at})
  .status('fear').state,'STORAGE_UNAVAILABLE');
});
test('Fear & Greed is market-wide context, not an asset signal',()=>{
 const raw={data:[{value:'56',value_classification:'Neutral',
  timestamp:String(Math.floor((at-86400000)/1000))}]};
 const a=parseFearGreed(raw,{now:at});
 assert.equal(a.state,'OK');assert.equal(a.data.value,56);
 assert.equal(a.data.scope,'GLOBAL_CRYPTO_MOOD_NOT_ASSET_SIGNAL');
 assert.equal(parseFearGreed({data:[{value:'101',timestamp:'1'}]},{now:at}).state,'INVALID');
});
test('OKX observation is fresh and strictly scoped to the requested Spot pair',async()=>{
 const payload={code:'0',data:[{instId:'BTC-USDT',last:'100',
  bidPx:'99.8',askPx:'100.2',ts:String(at-10000)}]};
 assert.equal(parseOkxTicker(payload,{symbol:'BTCUSDT',now:at}).state,'OK');
 assert.equal(parseOkxTicker(payload,{symbol:'ETHUSDT',now:at}).state,'INVALID');
 const fetchImpl=async(url,init)=>{
  assert.match(url,/instId=BTC-USDT$/);assert.equal(init.credentials,'omit');
  return {ok:true,json:async()=>payload};
 };
 assert.equal((await fetchOkxTicker('BTCUSDT',{now:()=>at,fetchImpl})).state,'OK');
});
test('DEX and Gecko match exact chain and contract, not ticker lookalikes',async()=>{
 const token=dexTokenReference('ETHUSDT');
 const wrong={chainId:'ethereum',baseToken:{address:'0xbad'},
  pairAddress:'0x'+'1'.repeat(40),priceUsd:'3100',
  liquidity:{usd:1000000},volume:{h24:500000}};
 const good={...wrong,baseToken:{address:token.address}};
 assert.equal(parseDexPairs([wrong],{symbol:'ETHUSDT',now:at}).state,'EMPTY');
 assert.equal(parseDexPairs([wrong,good],{symbol:'ETHUSDT',now:at}).state,'OK');
 const gecko={data:[{id:'eth_any',relationships:{base_token:{
  data:{id:'eth_'+token.address.toLowerCase()}}},
  attributes:{base_token_price_usd:'3100',reserve_in_usd:'1000000',
   volume_usd:{h24:'25000'},address:'0xabcd'}}]};
 assert.equal(parseGeckoPools(gecko,{symbol:'ETHUSDT',now:at}).state,'OK');
 assert.equal(parseGeckoPools(gecko,{symbol:'BTCUSDT',now:at}).state,'UNSUPPORTED');
 const dfetch=async(url,init)=>{assert.ok(url.includes(token.address));
  assert.equal(init.credentials,'omit');return {ok:true,json:async()=>[good]};};
 assert.equal((await fetchDexPairs('ETHUSDT',{fetchImpl:dfetch,now:()=>at})).state,'OK');
 const gfetch=async(url,init)=>{assert.match(url,/\/networks\/eth\/tokens\//);
  assert.match(init.headers.Accept,/version=20230203/);
  return {ok:true,json:async()=>gecko};};
 assert.equal((await fetchGeckoPools('ETHUSDT',{fetchImpl:gfetch,now:()=>at})).state,'OK');
});

test('CoinPaprika rejects wrong asset, stale or malformed snapshots',async()=>{
 const raw={id:'btc-bitcoin',last_updated:new Date(at-60000).toISOString(),
  quotes:{USD:{price:85000,volume_24h:100000,market_cap:1500000000}}};
 assert.equal(parsePaprikaTicker(raw,{symbol:'BTCUSDT',now:at}).state,'OK');
 assert.equal(parsePaprikaTicker(raw,{symbol:'ETHUSDT',now:at}).state,'INVALID');
 assert.equal(parsePaprikaTicker({...raw,last_updated:'2020-01-01T00:00:00Z'},
  {symbol:'BTCUSDT',now:at}).state,'INVALID');
 assert.equal(parsePaprikaTicker(raw,{symbol:'XYZUSDT',now:at}).state,'UNSUPPORTED');
 const fetchImpl=async(url,init)=>{
  assert.match(url,/\/v1\/tickers\/btc-bitcoin$/);
  assert.equal(init.credentials,'omit');
  return {ok:true,json:async()=>raw};
 };
 assert.equal((await fetchPaprikaTicker('BTCUSDT',
  {fetchImpl,now:()=>at})).state,'OK');
});

test('adding CoinMarketCap budget keeps existing public source usage intact',async()=>{
 const storage=memory();
 const b=createFreeSourceBudget({storage,now:()=>at});
 assert.equal((await b.load('okx',async()=>({state:'OK',data:{price:5}}),
  {key:'BTCUSDT'})).state,'OK');
 const key='apex9:no-key-budget:v1';
 const old=JSON.parse(storage.getItem(key));
 delete old.daily.cmc;delete old.monthly.cmc;delete old.last.cmc;
 storage.setItem(key,JSON.stringify(old));
 const next=createFreeSourceBudget({storage,now:()=>at});
 assert.equal(next.status('okx').used,1);
 assert.equal(next.status('cmc').used,0);
 assert.equal(next.status('cmc').limit,6);
 assert.equal((await next.load('cmc',async()=>({state:'OK',data:{priceUsd:100}}),
  {key:'BTCUSDT'})).state,'OK');
 assert.equal(next.status('cmc').used,1);
 assert.equal(next.status('okx').used,1);
});
