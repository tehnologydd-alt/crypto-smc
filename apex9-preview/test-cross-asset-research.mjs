import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCrossAssetRegimes,CROSS_ASSETS,CROSS_RULES} from './cross-asset-research.mjs';
const H=3600000,T=1700000000000-1700000000000%H;
function candles(asset,{n=720,start=0,kind='VARIED'}={}){
 let price=asset==='BTCUSDT'?42000:asset==='ETHUSDT'?2800:150;
 const rows=[];
 for(let i=0;i<n;i++){
  const k=i+start,t=T+k*H,open=price;
  const wave=.003*Math.sin(k*.65)+.002*Math.cos(k*.105);
  const change=kind==='SAME'?.003*Math.sin(k*.65):
   kind==='TREND'?.002:(asset==='SOLUSDT'?-wave:wave);
  price*=Math.exp(change);
  rows.push({t,closeAt:t+H-1,open,close:price,
   high:Math.max(open,price)*1.0008,
   low:Math.min(open,price)*.9992,volume:120+i%15,closed:true});
 }
 return rows;
}
const full=(args={})=>CROSS_ASSETS.map(asset=>({
 asset,candles:candles(asset,args[asset]),native:true,archiveComplete:true
}));
const analyze=(records,now=T+2000*H)=>analyzeCrossAssetRegimes(records,{now});
test('three verified archives align exactly, all three asset pairs computed',()=>{
 const r=analyze(full());
 assert.equal(r.state,'DESCRIPTIVE');
 assert.deepEqual(r.assets,CROSS_ASSETS);
 assert.equal(r.partial,false);
 assert.ok(r.matchedWindows>=144);
 assert.equal(r.pairs.length,3);
 assert.equal(r.rows.length,3);
 assert.equal(r.folds.reduce((s,x)=>s+x.count,0),r.matchedWindows);
 assert.ok(r.pairs.every(pair=>pair.samples===r.matchedWindows));
 for(const item of r.rows){
  assert.equal(item.samples,r.matchedWindows);
  assert.equal(item.modes.reduce((s,m)=>s+m.count,0),item.samples);
  assert.equal(item.totalTransitions,item.samples-1);
  assert.ok(item.modes.every(m=>m.persistenceShare===null||
   m.persistenceShare>=0&&m.persistenceShare<=1));
 }
});
test('matched identical historical regimes have full agreement without false prediction',()=>{
 const d=full(Object.fromEntries(CROSS_ASSETS.map(x=>[x,{kind:'SAME'}])));
 const r=analyze(d);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.ok(r.pairs.every(x=>x.sameModeShare===1&&x.matches===r.matchedWindows));
 assert.match(r.note,/не прогнозируют/);
});
test('asset history may start at a different hour yet all rows use only overlap',()=>{
 const inputs=full({ETHUSDT:{n:700,start:20}});
 const r=analyze(inputs);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.commonStart,T+20*H);
 assert.equal(r.commonEnd,T+719*H);
 assert.ok(r.rows.every(x=>x.firstAt===r.rows[0].firstAt));
 assert.ok(r.pairs.every(x=>x.folds.every(f=>f.samples>=48)));
});
test('missing third source is explicitly excluded and two verified assets are compared',()=>{
 const inp=full();
 inp[2]={asset:'SOLUSDT',native:false,archiveComplete:false,candles:[],
  error:'Room отсутствует'};
 const r=analyze(inp);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.deepEqual(r.assets,['BTCUSDT','ETHUSDT']);
 assert.equal(r.partial,true);
 assert.equal(r.pairs.length,1);
 assert.deepEqual(r.statuses.map(x=>x.state),['VERIFIED','VERIFIED','EXCLUDED']);
 assert.match(r.statuses[2].reason,/Room/);
});
test('no source repair, no imputed candles: one or both sources missing fails',()=>{
 const inp=full();
 inp[1].archiveComplete=false;
 inp[2].archiveComplete=false;
 const r=analyze(inp);
 assert.equal(r.state,'INSUFFICIENT');
 assert.equal(r.rows.length,0);
 assert.equal(r.pairs.length,0);
 assert.equal(r.statuses.filter(x=>x.state==='EXCLUDED').length,2);
});
test('single gap in H1 source excludes asset and no fake overlap is invented',()=>{
 const inp=full();
 inp[1].candles=inp[1].candles.filter((x,i)=>i!==100);
 const r=analyze(inp);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.partial,true);
 assert.equal(r.statuses[1].state,'EXCLUDED');
 assert.match(r.statuses[1].reason,/недостающих/);
});
test('all valid but non-overlapping archives block comparisons',()=>{
 const inp=full({
  BTCUSDT:{n:720,start:0},ETHUSDT:{n:720,start:2000},
  SOLUSDT:{n:720,start:4000}
 });
 const r=analyze(inp,T+10000*H);
 assert.equal(r.state,'NO_OVERLAP');
 assert.equal(r.matchedWindows,0);
 assert.deepEqual(r.pairs,[]);
});
test('common H1 overlap below 144 windows is insufficient even with good archives',()=>{
 const inp=full({
  BTCUSDT:{n:720,start:0},
  ETHUSDT:{n:720,start:210},
  SOLUSDT:{n:720,start:210}
 });
 const r=analyze(inp);
 assert.equal(r.state,'INSUFFICIENT');
 assert.deepEqual(r.pairs,[]);
});
test('future or malformed H1 in any source cannot count as authentic source',()=>{
 const inp=full();inp[0].candles=inp[0].candles.map((x,i)=>
  i===500?{...x,closeAt:T+3000*H}:x);
 const r=analyze(inp);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.statuses[0].state,'EXCLUDED');
 assert.equal(r.assets.includes('BTCUSDT'),false);
});
test('foreign, duplicate and shuffled source labels reject the whole audit',()=>{
 const inp=full();
 assert.equal(analyze([...inp.slice(0,2),inp[1]]).state,'INVALID');
 const wrong=full();wrong[0].asset='DOGEUSDT';
 assert.equal(analyze(wrong).state,'INVALID');
 assert.equal(analyze([]).state,'INVALID');
});
test('changing later H1 candles cannot alter classification in earlier matched windows',()=>{
 const a=full();const first=analyze(a);
 const b=full();
 b[2].candles=b[2].candles.map((x,i)=>{
  if(i<=250)return x;
  const close=x.close*1.03;
  return {...x,close,low:Math.min(x.open,close)*.999,
   high:Math.max(x.open,close)*1.001};
 });
 const later=analyze(b);
 assert.equal(later.state,'DESCRIPTIVE');
 assert.equal(later.rows[0].modes.length,first.rows[0].modes.length);
 assert.deepEqual(later.pairs.map(x=>x.folds[0].samples),
  first.pairs.map(x=>x.folds[0].samples));
 // All regime labels up to 40H before perturbation are fixed by past-only inputs.
 const c=full();
 c[2].candles=c[0].candles.map(x=>({...x}));
 const identical=analyze(c);
 assert.equal(identical.state,'DESCRIPTIVE');
});
