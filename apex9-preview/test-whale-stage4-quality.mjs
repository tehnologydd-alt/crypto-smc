import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceReliability} from './source-reliability.mjs';
import {auditSpotDepthQuality} from './spot-depth-quality.mjs';
import {mapOrderBlocksToViewport,ORDER_BLOCK_VERSION}
 from './order-blocks-chart.mjs';

const DAY=86400000,HR=3600000,NOW=Date.UTC(2026,10,11,16);
const store=()=>{
 const data=new Map();
 return {getItem:key=>data.get(key)||null,
  setItem:(key,value)=>data.set(key,value)};
};
test('Binance and OKX request availability uses REAL finished attempts only',()=>{
 const reliability=createSourceReliability({storage:store(),now:()=>NOW});
 for(let i=0;i<14;i++){
  const at=NOW-(i<7?2:1)*DAY+(i%7)*HR;
  assert.equal(reliability.record({
   provider:'binance-depth',
   result:{state:'OK',data:{exchangeTimestamp:at-1000}},
   at
  }),true);
  assert.equal(reliability.record({
   provider:'okx-depth',
   result:i===8?{state:'RATE_LIMITED',data:null}:
    {state:'OK',data:{exchangeTimestamp:at-1000}},
   at
  }),true);
 }
 const binance=reliability.summary('binance-depth');
 const okx=reliability.summary('okx-depth');
 assert.equal(binance.state,'OBSERVED');
 assert.equal(okx.state,'OBSERVED');
 assert.equal(binance.availabilityPercent,100);
 assert.equal(okx.availabilityPercent,92.9);
 assert.equal(binance.freshness.checked,0);
 assert.equal(okx.freshness.checked,13);
 assert.equal(okx.freshness.confirmed,13);
 const report=auditSpotDepthQuality({
  'binance-depth':binance,'okx-depth':okx},{now:NOW});
 assert.equal(report.state,'DESCRIPTIVE');
 assert.equal(report.superior,null); // no unpaired winner claim
 assert.equal(report.predictive,false);
 assert.equal(report.changesForecasts,false);
 assert.equal(report.comparability,'UNMATCHED_LOCAL_REQUESTS');
 assert.deepEqual(report.sources.map(x=>x.attempts),[14,14]);
 assert.equal(report.sources[0].freshnessPercent,null);
 assert.equal(report.sources[1].freshnessPercent,100);
});
test('12 requests from only one day never unlock an availability percentage',()=>{
 const reliability=createSourceReliability({storage:store(),now:()=>NOW});
 for(let i=0;i<14;i++)reliability.record({
  provider:'okx-depth',result:{state:'OK',
   data:{exchangeTimestamp:NOW-i*2000}},
  at:NOW-i*2000
 });
 const report=auditSpotDepthQuality({
  'binance-depth':reliability.summary('binance-depth'),
  'okx-depth':reliability.summary('okx-depth')
 },{now:NOW});
 assert.equal(report.state,'COLLECTING');
 assert.equal(report.sources[0].availabilityPercent,null);
 assert.equal(report.sources[1].availabilityPercent,null);
 assert.equal(report.sources[1].attempts,14);
 assert.equal(report.superior,null);
});
test('inconsistent persisted reliability counters fail closed',()=>{
 const source={provider:'binance-depth',state:'OBSERVED',
  attempts:12,ok:12,failures:1,uniqueDays:2,
  rateLimited:0,invalid:0,lastAt:NOW,
  availabilityPercent:100,freshness:{checked:0,confirmed:0,percent:null}};
 const valid={...source,provider:'okx-depth',
  ok:11,failures:1,freshness:{checked:11,confirmed:10,percent:90.9},
  availabilityPercent:91.7};
 const report=auditSpotDepthQuality({
  'binance-depth':source,'okx-depth':valid},{now:NOW});
 assert.equal(report.state,'INVALID');
 assert.equal(report.sources.length,0);
 assert.equal(report.superior,null);
});
test('zone coverage is bounded by last verified consecutive H1 candle',()=>{
 const t=NOW-10*HR;
 const bars=[0,1,2,3,5,6,7].map((i)=>({
  t:t+i*HR,closeAt:t+(i+1)*HR-1,
  open:100,close:101,high:102,low:99,volume:10,closed:true
 }));
 const zone={version:ORDER_BLOCK_VERSION,interval:'1h',
  kind:'DEMAND',low:99,high:101,
  originCloseAt:bars[0].closeAt,confirmedAt:bars[1].closeAt,
  coverageEndsAt:bars[3].closeAt,invalidatedAt:null};
 const result=mapOrderBlocksToViewport([zone],bars,{interval:'1h'});
 assert.equal(result.length,1);
 assert.deepEqual(result[0].segments,[{from:1,to:3}]);
 const gap=mapOrderBlocksToViewport([{
  ...zone,coverageEndsAt:bars.at(-1).closeAt}],bars,{interval:'1h'});
 assert.equal(gap.length,1);
 assert.deepEqual(gap[0].segments,[{from:1,to:3}]);
 const before=mapOrderBlocksToViewport([zone],bars.slice(0,1),{
  interval:'1h'});
 assert.deepEqual(before,[]);
});
test('chart and UI only paint cached W marks; no new background worker',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const chart=read('./candle-chart.mjs');
 const app=read('./app.mjs');
 const source=read('./free-source-dashboard.mjs');
 const html=read('./index.html');
 const worker=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexSyncWorker.kt');
 const front=read('./foreground-depth-policy.mjs');
 const frozen=read('./source-provider-forward-audit.mjs');
 const native=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
 assert.ok(chart.includes('this.refreshWhaleMarks()'));
 assert.ok(chart.includes('for(const mark of this.whaleMarks)'));
 assert.ok(chart.includes('i=mark.index-start'));
 assert.ok(app.includes('freeSourceDashboard.recordSpotDepthResults(symbol,sample.sources)'));
 assert.ok(app.includes('seq===pending&&chosen===symbol'));
 assert.ok(source.includes("['binance-depth','okx-depth']"));
 assert.ok(source.includes("renderSpotDepthQuality()"));
 assert.ok(html.includes('id="depth-quality-panel"'));
 assert.ok(html.includes('id="chart-whale-toggle"'));
 assert.ok(html.includes('id="chart-ob-toggle"'));
 assert.ok(front.includes("new Set(['binance','okx'])"));
 assert.ok(frozen.includes("id:'bybit:spot:depth'"));
 assert.equal(worker.includes('collectWhaleObservations'),false);
 assert.equal(worker.includes('fetchPublicDepth('),false);
 assert.ok(native.includes('"okx:spot:depth"'));
 assert.equal(read('./spot-depth-quality.mjs').includes('fetch('),false);
});
