import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chainForWhaleAsset,parseEthereumTransfers,parseBitcoinLargeOutputs,
 collectWhaleObservations,parseWhaleHistory,validateWhaleEvent,
 formatNativeAmount,WHALE_OBSERVATION_VERSION}
 from './whale-observer.mjs';

const now=Date.UTC(2026,10,11,13,30),BTC='BTCUSDT',ETH='ETHUSDT';
const txid='a'.repeat(64),from='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40);
const btcAddress='bc1q'+'a'.repeat(36);
const ethTx=(overrides={})=>({
 hash:'0x'+txid,value:'100000000000000000001',status:'ok',
 result:'success',timestamp:new Date(now-60000).toISOString(),
 from:{hash:from},to:{hash:to},...overrides
});
const btcTx=(overrides={})=>({
 txid,status:{confirmed:false},vout:[
  {value:12000000000,scriptpubkey_address:btcAddress},
  {value:200000,scriptpubkey_address:btcAddress}
 ],...overrides
});
const ok=json=>({ok:true,status:200,json:async()=>json});

test('only natively supported BTC / ETH pairs are mapped, never TON/GRAM/USDT',()=>{
 for(const [asset,chain] of [[BTC,'bitcoin'],[ETH,'ethereum'],
  ['BTCUSDC','bitcoin'],['ETHEUR','ethereum']])
  assert.equal(chainForWhaleAsset(asset),chain);
 for(const asset of ['GRAMUSDT','TONUSDT','USDTUSDT','WETHUSDT','ETH;BTC',null])
  assert.equal(chainForWhaleAsset(asset),null);
 assert.equal(formatNativeAmount('10000000000','bitcoin'),'100 BTC');
 assert.equal(formatNativeAmount('100000000000000000001','ethereum'),
  '100.000000000000000001 ETH');
});

test('Ethereum validated native values remain exact BigInt with block timestamp',()=>{
 const parsed=parseEthereumTransfers(ETH,{
  items:[ethTx(),ethTx({hash:'0x'+'b'.repeat(64),value:'99999999999999999999'}),
   ethTx({hash:'0x'+'c'.repeat(64),result:'error'}),
   ethTx({hash:'0x'+'d'.repeat(64),status:'pending'}),
   ethTx({hash:'0x'+'e'.repeat(64),timestamp:new Date(now+300000).toISOString()}),
   ethTx({hash:'0x'+'f'.repeat(64),to:{hash:from}})]
 },now);
 assert.equal(parsed.state,'OK');
 assert.equal(parsed.scanned,6);
 assert.equal(parsed.events.length,1);
 const item=parsed.events[0];
 assert.equal(item.version,WHALE_OBSERVATION_VERSION);
 assert.equal(item.amountAtomic,'100000000000000000001');
 assert.equal(item.confirmation,'VALIDATED_AT_FETCH');
 assert.equal(item.timeBasis,'BLOCK_TIMESTAMP');
 assert.equal(item.observedAt,now-60000);
 assert.equal(item.walletOwner,'UNKNOWN');
 assert.equal(item.exchangeLabel,null);
 assert.equal(item.tradeDirection,null);
 assert.equal(item.isWhaleIdentityVerified,false);
 assert.equal(validateWhaleEvent(item,ETH,now),true);
});

test('BTC records individual UTXO output, not total value or known recipient',()=>{
 const items=parseBitcoinLargeOutputs(BTC,btcTx(),now);
 assert.equal(items.length,1);
 assert.equal(items[0].amountAtomic,'12000000000');
 assert.equal(items[0].to,btcAddress);
 assert.equal(items[0].from,null);
 assert.equal(items[0].addressRole,'OUTPUT_MAY_BE_CHANGE');
 assert.equal(items[0].timeBasis,'CLIENT_SEEN');
 assert.equal(items[0].observedAt,now);
 assert.equal(items[0].confirmation,'UNCONFIRMED_AT_FETCH');
 assert.equal(parseBitcoinLargeOutputs(BTC,btcTx({
  status:{confirmed:true}}),now).length,0);
});

test('BTC provider reads at most recent ten plus three exact transactions',async()=>{
 const calls=[];
 const recent=Array.from({length:10},(_,i)=>({
  txid:String(i%10).repeat(64),value:14000000000,fee:1000,vsize:200
 }));
 const result=await collectWhaleObservations(BTC,{now:()=>now,
  fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(url.endsWith('/recent'))return ok(recent);
   const id=url.split('/').at(-1);
   return ok(btcTx({txid:id}));
  }});
 assert.equal(result.state,'OK');
 assert.equal(result.scanned,10);
 assert.equal(result.lookups,3);
 assert.equal(result.events.length,3);
 assert.equal(result.completeMarketCoverage,false);
 assert.equal(result.coverage,'RECENT_10_ONLY');
 assert.equal(calls.length,4);
 assert.ok(calls.every(x=>x.opts.credentials==='omit'&&x.opts.method==='GET'));
 assert.ok(calls.every(x=>x.url.startsWith('https://mempool.space/api/')));
});

test('Ethereum samples exactly one page of validated native transfers',async()=>{
 const calls=[];
 const r=await collectWhaleObservations(ETH,{now:()=>now,
  fetchImpl:async(url,opts)=>{calls.push({url,opts});return ok({
   items:[ethTx()],next_page_params:{block_number:10,index:2}
  });}});
 assert.equal(r.state,'OK');
 assert.equal(r.scanned,1);
 assert.equal(r.events.length,1);
 assert.equal(r.coverage,'LATEST_PAGE_ONLY');
 assert.equal(r.completeMarketCoverage,false);
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.includes('filter=validated&type=coin_transfer'));
});

test('rate limits and invalid answers never produce invented whale events',async()=>{
 const throttled=await collectWhaleObservations(ETH,{now:()=>now,
  fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(throttled.state,'RATE_LIMITED');
 assert.deepEqual(throttled.events,[]);
 const unsupported=await collectWhaleObservations('GRAMUSDT',{
  fetchImpl:()=>{throw Error('must not poll unsupported chain')}});
 assert.equal(unsupported.state,'UNSUPPORTED');
 assert.deepEqual(unsupported.events,[]);
 const corrupt=await collectWhaleObservations(BTC,{now:()=>now,
  fetchImpl:async()=>ok({transactions:[btcTx()]})});
 assert.equal(corrupt.state,'INVALID');
 assert.deepEqual(corrupt.events,[]);
});

test('partial BTC details preserve only actual successful records',async()=>{
 const recent=[{txid,value:14000000000},{txid:'b'.repeat(64),value:14000000000}];
 const result=await collectWhaleObservations(BTC,{now:()=>now,
  fetchImpl:async url=>{
   if(url.endsWith('/recent'))return ok(recent);
   if(url.endsWith('b'.repeat(64)))return {ok:false,status:503};
   return ok(btcTx());
  }});
 assert.equal(result.state,'PARTIAL');
 assert.equal(result.events.length,1);
 assert.equal(result.lookups,2);
 assert.match(result.reason,/OFFLINE/);
});

test('only matching source and timestamp payloads survive native Room read',()=>{
 const ev=parseEthereumTransfers(ETH,{items:[ethTx()]},now).events[0];
 const row={asset:ETH,source:ev.source,kind:'whale',sourceState:'OK',
  observedAt:ev.observedAt,collectedAt:ev.collectedAt,payload:JSON.stringify(ev)};
 const rows=[row,{...row}, {...row,asset:BTC},
  {...row,collectedAt:ev.collectedAt-60000},
  {...row,payload:'{bad'},
  {...row,source:'mempool:bitcoin:tx'},
  {...row,kind:'onchain'}];
 const parsed=parseWhaleHistory(rows,ETH,{now});
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].txid,txid);
 assert.deepEqual(parseWhaleHistory(rows,BTC,{now}),[]);
});

test('stage 1 is favorite-only, separate from forecast outcomes and chart rendering',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const app=read('./app.mjs');
 const dash=read('./whale-dashboard.mjs');
 const html=read('./index.html');
 const bridge=read('./mobile-bridge.mjs');
 const daemon=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexSyncWorker.kt');
 const native=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
 const dao=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt');
 const pack=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(app.includes("import {initWhaleDashboard} from './whale-dashboard.mjs'"));
 assert.ok(app.includes('void whaleDashboard.refresh(chosen)'));
 assert.ok(app.includes('whaleDashboard.clear(symbol)'));
 assert.ok(dash.includes('favorites.includes(next)'));
 assert.ok(dash.includes("document.body.dataset.view!=='asset'"));
 assert.ok(dash.includes("dataset.assetArea!=='data'"));
 assert.ok(dash.includes('await saveMobileWhaleObservations(next,report)'));
 assert.ok(html.includes('id="whale-history"'));
 assert.ok(html.includes('id="whale-refresh"'));
 assert.ok(bridge.includes('export async function getMobileWhaleHistory('));
 assert.ok(bridge.includes('export async function saveMobileWhaleObservations('));
 assert.ok(native.includes('fun getWhaleHistory(call: PluginCall)'));
 assert.ok(native.includes('validatedWhalePayload('));
 assert.ok(dao.includes('suspend fun whaleHistoryForSource('));
 assert.ok(pack.includes("'whale-observer.mjs'"));
 assert.ok(pack.includes("'whale-dashboard.mjs'"));
 assert.equal(daemon.includes('collectWhaleObservations'),false);
 assert.equal(read('./whale-observer.mjs').includes('setInterval('),false);
});
