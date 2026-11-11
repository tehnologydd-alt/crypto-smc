import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 baseOfSpotAsset,parseDexScreenerPools,parseGeckoTerminalPools,
 fetchDexCandidates,collectDexMarket,DEX_PROVIDERS
} from './onchain-dex-discovery.mjs';

const now=Date.UTC(2026,10,11,12);
const pair=(overrides={})=>({
 chainId:'ethereum',dexId:'uniswap',
 pairAddress:'0xpool',
 baseToken:{symbol:'TRB',address:'0xRealOrFakeUnverified'},
 quoteToken:{symbol:'WETH',address:'0xWrapped'},
 liquidity:{usd:55000},
 volume:{h24:9000},
 txns:{h24:{buys:40,sells:27}},
 priceUsd:'44.2',
 ...overrides
});
const gecko=(overrides={})=>({
 type:'pool',
 attributes:{
  name:'TRB / WETH',address:'0xPool',
  base_token_price_usd:'44.2',reserve_in_usd:'55000',
  volume_usd:{h24:'9000'},
  transactions:{h24:{buys:50,sells:31}},
  ...overrides
 },
 relationships:{network:{data:{id:'eth'}},dex:{data:{id:'uniswap_v3'}}}
});

test('only exact base asset tickers produce non-authoritative candidate pools',()=>{
 assert.equal(baseOfSpotAsset('TRBUSDT'),'TRB');
 assert.equal(baseOfSpotAsset('BTCUSDT'),'BTC');
 assert.equal(baseOfSpotAsset('TRB&KEY=123'),null);
 const result=parseDexScreenerPools('TRBUSDT',{
  pairs:[
   pair(),
   pair({baseToken:{symbol:'TRBB',address:'0xOther'},liquidity:{usd:1e6}}),
   pair({quoteToken:{symbol:'RANDOM'},liquidity:{usd:1e7}}),
   pair({chainId:'solana',baseToken:{symbol:'TRB',address:'anotherCoin'},
    liquidity:{usd:95000}})
  ]
 },{now});
 assert.equal(result.state,'CANDIDATES');
 assert.equal(result.candidatesTotal,2);
 assert.equal(result.pools[0].chain,'solana');
 assert.equal(result.pools[0].identityVerified,false);
 assert.equal(result.pools[1].contract,'0xRealOrFakeUnverified');
 assert.equal(result.walletEvidence,false);
 assert.equal(result.scope,'TICKER_SEARCH_UNVERIFIED_TOKEN_IDENTITY');
});

test('invalid and missing DEX responses never become fake token observations',()=>{
 assert.equal(parseDexScreenerPools('TRBUSDT',{pairs:[]},{now}).state,'NO_MATCH');
 assert.equal(parseDexScreenerPools('TRBUSDT',{pairs:null},{now}).state,'NO_MATCH');
 assert.equal(parseDexScreenerPools('TRBUSDT',{error:'oops'},{now}).state,'INVALID');
 assert.equal(parseDexScreenerPools('TRBUSDT',{
  pairs:[pair({liquidity:{usd:-1}})]},{now}).state,'NO_MATCH');
 const g=parseGeckoTerminalPools('TRBUSDT',{
  data:[gecko(),
   gecko({name:'TRBB / WETH'}),
   gecko({name:'TRB / WETH',reserve_in_usd:'invalid'})]
 },{now});
 assert.equal(g.state,'CANDIDATES');
 assert.equal(g.candidatesTotal,1);
 assert.equal(g.pools[0].chain,'eth');
 assert.equal(g.pools[0].contract,'');
 assert.equal(g.pools[0].volume24hUsd,9000);
 assert.equal(g.pools[0].buys24h,50);
 assert.equal(parseGeckoTerminalPools('TRBUSDT',{
  data:[]},{now}).state,'NO_MATCH');
});

test('both fixed providers use credential-free HTTP and do not change investment models',async()=>{
 let count=0;
 const called=[];
 const fetchImpl=async (url,opts)=>{
  count++;
  called.push({url,opts});
  if(url.startsWith('https://api.dexscreener.com/'))
   return {ok:true,status:200,json:async()=>({pairs:[pair()]})};
  if(url.startsWith('https://api.geckoterminal.com/'))
   return {ok:true,status:200,json:async()=>({data:[gecko()]})};
  throw Error('Unknown host');
 };
 const result=await collectDexMarket('TRBUSDT',{
  fetchImpl,now:()=>now
 });
 assert.equal(result.state,'CANDIDATES');
 assert.equal(count,2);
 assert.deepEqual(DEX_PROVIDERS,['dexscreener','geckoterminal']);
 assert.equal(result.sources[0].state,'CANDIDATES');
 assert.equal(result.sources[1].state,'CANDIDATES');
 assert.equal(result.tokenIdentityVerified,false);
 assert.equal(result.networkTelemetry,false);
 assert.ok(called[0].url.includes('q=TRB'));
 assert.ok(called[1].url.includes('query=TRB'));
 assert.ok(called.every(x=>x.opts.method==='GET'&&
  x.opts.credentials==='omit'&&x.opts.cache==='no-store'));
});

test('one API outage does not erase genuine independent DEX result',async()=>{
 const result=await collectDexMarket('TRBUSDT',{
  fetchImpl:async url=>url.includes('dexscreener')?
   {ok:true,status:200,json:async()=>({pairs:[pair()]})}:
   {ok:false,status:503},now:()=>now
 });
 assert.equal(result.state,'CANDIDATES');
 assert.equal(result.sources[0].pools.length,1);
 assert.equal(result.sources[1].state,'OFFLINE');
 const limited=await fetchDexCandidates('geckoterminal','TRBUSDT',{
  fetchImpl:async()=>({ok:false,status:429}),now:()=>now});
 assert.equal(limited.state,'RATE_LIMITED');
 const denied=await fetchDexCandidates('geckoterminal','TRBUSDT',{
  fetchImpl:async()=>({ok:false,status:403}),now:()=>now});
 assert.equal(denied.state,'ACCESS_DENIED');
 const invalid=await fetchDexCandidates('bad-host','TRBUSDT',{
  fetchImpl:()=>{throw Error('MUST NOT CALL');},now:()=>now
 });
 assert.equal(invalid.state,'UNSUPPORTED');
});

test('unsupported token fallback is a distinct layer from native network and Room',()=>{
 const src=readFileSync(new URL('./onchain-dashboard.mjs',import.meta.url),'utf8');
 const staged=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(src.includes('await refreshDex(asset,force,seq)'));
 assert.ok(src.includes('collectDexMarket(asset,{'));
 assert.ok(src.includes('Снимки не сохраняются как ончейн-история Room')||
  src.includes('не сохраняются как ончейн-история Room'));
 assert.ok(staged.includes("'onchain-dex-discovery.mjs'"));
});


test('GeckoTerminal real JSON: network is embedded in resource.id, not relationships.network',()=>{
 for(const symbol of ['AAVE','ZEC','TRB']){
  const id='eth_0x8888',tokenId='eth_0xaaaa',
   quoteId='eth_0xbbbb';
  const result=parseGeckoTerminalPools(symbol+'USDT',{
   data:[{type:'pool',id,attributes:{
    name:symbol+' / USDC 0.3%',address:'0x8888',
    reserve_in_usd:'125000',base_token_price_usd:'10',
    volume_usd:{h24:'2500'},
    transactions:{h24:{buys:19,sells:8}}
   },relationships:{
    base_token:{data:{id:tokenId,type:'token'}},
    quote_token:{data:{id:quoteId,type:'token'}},
    dex:{data:{id:'uniswap_v3',type:'dex'}}
   }}],
   included:[
    {type:'token',id:tokenId,attributes:{symbol,address:'0xaaaa'}},
    {type:'token',id:quoteId,attributes:{symbol:'USDC',address:'0xbbbb'}}
   ]
  },{now});
  assert.equal(result.state,'CANDIDATES',symbol);
  assert.equal(result.pools[0].chain,'eth');
  assert.equal(result.pools[0].contract,'0xaaaa');
  assert.equal(result.pools[0].identityVerified,false);
  assert.equal(result.pools[0].poolAddress,'0x8888');
 }
});
test('unverifiable network IDs are not silently reported as absent tokens',()=>{
 const result=parseGeckoTerminalPools('AAVEUSDT',{data:[
  {type:'pool',id:'unknown',attributes:{
   name:'AAVE / USDC',address:'0x8888',reserve_in_usd:'12000'
  }}
 ]},{now});
 assert.equal(result.state,'UNVERIFIED_SCHEMA');
 assert.match(result.reason,/ID сети/);
});
test('suspicious advertised DEX liquidity is clearly flagged but not promoted',()=>{
 const result=parseDexScreenerPools('ZECUSDT',{pairs:[
  {...pair({baseToken:{symbol:'ZEC',address:'SolanaUnverified'},
   chainId:'solana',quoteToken:{symbol:'USDC',address:'U'},
   liquidity:{usd:1_650_344_957},volume:{h24:37}})}
 ]},{now});
 assert.equal(result.state,'CANDIDATES');
 assert.equal(result.pools[0].lowActivityWarning,true);
 assert.equal(result.pools[0].identityVerified,false);
});
