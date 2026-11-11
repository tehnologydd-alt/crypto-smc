import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBitcoinLargeOutputs} from './whale-observer.mjs';
import {analyzeStructuralOrderBlocks,mapOrderBlocksToViewport,
 mapWhaleEventsToViewport,ORDER_BLOCK_RULES,ORDER_BLOCK_VERSION}
 from './order-blocks-chart.mjs';
import {analyzeStructure} from './candles.mjs';

const H=3600000,T=Date.UTC(2026,10,11,12),asset='BTCUSDT';
const closes=[100,99,98,101,103,102,101,99,100,101,
 105,104,102,101,103,106,105,103,102,104,108,107,105,102,
 104,109,107,103,100,99,97,95];
const candles=closes.map((close,i)=>{
 const t=T+i*H,open=i?closes[i-1]:100;
 return {t,closeAt:t+H-1,open,close,
  high:Math.max(open,close)+1,low:Math.min(open,close)-1,
  volume:100+i,closed:true};
});
const sourceTx=(time)=>{
 const events=parseBitcoinLargeOutputs(asset,{
  txid:'a'.repeat(64),status:{confirmed:false},
  vout:[{value:14000000000,scriptpubkey_address:'bc1q'+'a'.repeat(36)},
        {value:18000000000,scriptpubkey_address:'bc1q'+'b'.repeat(36)}]
 },time);
 assert.equal(events.length,2);
 return events;
};
test('zones depend on CLOSED BOS/CHoCH source bars, not predicted future candles',()=>{
 const r=analyzeStructuralOrderBlocks(candles,{interval:'1h'});
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.source,'BINANCE_SPOT_CLOSED_OHLC');
 assert.equal(r.noFutureZones,true);
 assert.ok(r.zones.length<=ORDER_BLOCK_RULES.maxZones);
 const breaks=analyzeStructure(candles).events
  .filter(e=>['BOS','CHoCH'].includes(e.type));
 for(const z of r.zones){
  assert.ok(breaks.some(e=>e.time===z.confirmedAt));
  // Pivot confirmation predates the break. Zones must NEVER start there.
  assert.ok(breaks.every(e=>e.time!==z.confirmedAt||
   e.confirmedAt<=e.time));
  assert.ok(z.originCloseAt<z.confirmedAt);
  assert.ok(z.low>0&&z.high>z.low);
  assert.equal(z.inferredOrders,false);
  assert.equal(z.whaleAttributed,false);
  assert.equal(z.predictive,false);
  assert.ok(['DEMAND','SUPPLY'].includes(z.kind));
 }
});
test('never infer a zone from unfinished or malformed price structure',()=>{
 const raw=candles.map(x=>({...x}));
 raw[5].close=raw[5].high+1;
 assert.equal(analyzeStructuralOrderBlocks(raw,{interval:'1h'}).state,'INVALID');
 assert.equal(analyzeStructuralOrderBlocks(candles.slice(0,7),{
  interval:'1h'}).state,'COLLECTING');
 const withOpen=candles.concat({...candles.at(-1),t:candles.at(-1).t+H,
  closeAt:candles.at(-1).closeAt+H,closed:false,close:1e20});
 assert.deepEqual(analyzeStructuralOrderBlocks(withOpen,{
  interval:'1h'}).zones,analyzeStructuralOrderBlocks(candles,{
  interval:'1h'}).zones);
});
test('zone viewport starts no earlier than confirmation and stops at gaps',()=>{
 const source=analyzeStructuralOrderBlocks(candles,{interval:'1h'});
 const zone=source.zones[0]||{
  version:ORDER_BLOCK_VERSION,id:'TEST',interval:'1h',kind:'DEMAND',
  low:99,high:101,originCloseAt:candles[4].closeAt,
  confirmedAt:candles[10].closeAt,invalidatedAt:null
 };
 const mapped=mapOrderBlocksToViewport([zone],candles,{interval:'1h'});
 assert.ok(mapped.length<=1);
 if(mapped.length){
  for(const seg of mapped[0].segments){
   for(let i=seg.from;i<=seg.to;i++)
    assert.ok(candles[i].closeAt>=zone.confirmedAt);
  }
 }
 const index=candles.findIndex(x=>x.closeAt===zone.confirmedAt);
 if(index>=0&&index+4<candles.length){
  const gap=candles.filter((x,i)=>i!==index+2);
  const disjoint=mapOrderBlocksToViewport([zone],gap,{interval:'1h'});
  if(disjoint.length)for(const seg of disjoint[0].segments)
   for(let i=seg.from+1;i<=seg.to;i++)
    assert.equal(gap[i].closeAt-gap[i-1].closeAt,H);
 }
 assert.equal(mapOrderBlocksToViewport([zone],candles,{
  interval:'1m'}).length,0);
});
test('whale mark anchors to last ALREADY completed candle at phone first-seen time',()=>{
 const recorded=candles[12].closeAt+32000,events=sourceTx(recorded);
 const marks=mapWhaleEventsToViewport(events,candles,{
  asset,interval:'1h',now:recorded+60000});
 assert.equal(marks.length,1); // same transaction, two UTXO outputs
 assert.equal(marks[0].index,12);
 assert.equal(marks[0].firstSeenAt,recorded);
 assert.equal(marks[0].inferredOwner,false);
 assert.equal(marks[0].inferredOrder,false);
 assert.equal(marks[0].confirmed,false);
 assert.equal(mapWhaleEventsToViewport(events,candles.slice(13),{
  asset,interval:'1h',now:recorded+60000}).length,0);
 assert.equal(mapWhaleEventsToViewport(events,candles,{
  asset:'ETHUSDT',interval:'1h',now:recorded+60000}).length,0);
});
test('chart layers and native history are source-verified and user-toggleable',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const chart=read('./candle-chart.mjs'),app=read('./app.mjs');
 const html=read('./index.html'),pack=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(chart.includes('mapOrderBlocksToViewport(this.orderBlocks,bars'));
 assert.ok(chart.includes('mapWhaleEventsToViewport(this.whaleEvents,bars'));
 assert.ok(chart.includes('setOverlayVisibility('));
 assert.ok(app.includes('await getMobileWhaleHistory(asset,80)'));
 assert.ok(app.includes('if(!favoriteManager.hasFavorite(asset))'));
 assert.ok(app.includes('candleView.setWhaleEvents(symbol,[])'));
 assert.ok(html.includes('id="chart-ob-toggle"'));
 assert.ok(html.includes('id="chart-whale-toggle"'));
 assert.ok(pack.includes("'order-blocks-chart.mjs'"));
 assert.equal(read('./order-blocks-chart.mjs').includes('fetch('),false);
 assert.equal(read('./order-blocks-chart.mjs').includes('setInterval('),false);
});

test('a pivot confirmation alone must never make an Order Block visible',()=>{
 const structure=analyzeStructure(candles).events
  .filter(e=>['BOS','CHoCH'].includes(e.type)&&e.confirmedAt<e.time);
 const result=analyzeStructuralOrderBlocks(candles,{interval:'1h'});
 // Test an actual break, not only a zero-zone degenerate case.
 for(const zone of result.zones){
  const e=structure.find(x=>x.time===zone.confirmedAt);
  assert.ok(e);
  assert.ok(zone.confirmedAt>e.confirmedAt);
  const before=candles.filter(x=>x.closeAt<zone.confirmedAt);
  const map=mapOrderBlocksToViewport([zone],before,{interval:'1h'});
  assert.deepEqual(map,[]);
  const visible=mapOrderBlocksToViewport([zone],candles,{interval:'1h'});
  for(const drawing of visible)
   for(const seg of drawing.segments)
    assert.ok(candles[seg.from].closeAt>=zone.confirmedAt);
 }
});
