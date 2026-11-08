import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOnChainMarketHistory} from './onchain-market-compare.mjs';
const H=3600000,T=1700000000000-(1700000000000%H);
function fixtures(count=26,chain='bitcoin'){
 let price=100,network=3500;
 const candles=[],snapshots=[];
 for(let i=0;i<count;i++){
  const t=T+i*H,open=price,step=(i%4===0?1.8:i%3===0?-.8:.9);
  price=price*Math.exp(step/1000);
  candles.push({t,closeAt:t+H-1,open,close:price,
   high:Math.max(open,price)*1.002,low:Math.min(open,price)*.998,volume:5,closed:true});
  network+=i%3===0?7:i%2===0?-3:4;
  const when=t+H+15*60000;
  const payload=chain==='ton'
   ?{scope:'TON_MASTERCHAIN_OBSERVATION',chain:'ton',masterchainSeqno:100000+i*11+(i%3)*2}
   :{scope:'BITCOIN_NETWORK_OBSERVATION',chain:'bitcoin',mempoolCount:network,
     mempoolVBytes:100000,mempoolFeesSats:500};
  payload.observedAt=when;payload.collectedAt=when;
  snapshots.push({
   asset:chain==='ton'?'GRAMUSDT':'BTCUSDT',
   source:chain==='ton'?'toncenter:ton:masterchain':'mempool:bitcoin:network',
   observedAt:when,collectedAt:when,payload:JSON.stringify(payload)
  });
 }
 return {candles,snapshots,now:T+(count+2)*H};
}
test('does not claim a correlation with sparse observations',()=>{
 const x=fixtures();
 const r=compareOnChainMarketHistory(x.snapshots.slice(0,8),x.candles,{
  asset:'BTCUSDT',now:x.now});
 assert.equal(r.state,'INSUFFICIENT');
 assert.equal(r.correlation,null);
});
test('historical BTC association uses only completed prior-hour closes',()=>{
 const x=fixtures();
 const r=compareOnChainMarketHistory(x.snapshots,x.candles,{
  asset:'BTCUSDT',now:x.now});
 assert.equal(r.state,'DESCRIPTIVE');
 assert.ok(r.pairedHours>=20&&r.intervals>=20);
 assert.ok(r.correlation>=-1&&r.correlation<=1);
 assert.ok(r.matchedIntervals.every(y=>y.start<y.end));
});
test('duplicate snapshots within an hour do not fabricate additional samples',()=>{
 const x=fixtures();
 const dup=x.snapshots.map(a=>({...a,
   observedAt:a.observedAt+30000,collectedAt:a.collectedAt+30000,
   payload:JSON.stringify({...JSON.parse(a.payload),
    observedAt:a.observedAt+30000,collectedAt:a.collectedAt+30000})
 }));
 const r=compareOnChainMarketHistory([...x.snapshots,...dup],x.candles,{
  asset:'BTCUSDT',now:x.now});
 assert.equal(r.pairedHours,x.candles.length-1); // last hour has no paired closed candle
});
test('no future candle is ever used and wrong asset data cannot contaminate',()=>{
 const x=fixtures();
 const a=compareOnChainMarketHistory(x.snapshots,x.candles,{asset:'BTCUSDT',now:x.now});
 const altered=x.candles.map(y=>({...y}));
 altered.at(-1).close=1e10;altered.at(-1).high=1e11;altered.at(-1).closed=false;
 const b=compareOnChainMarketHistory(x.snapshots,altered,{asset:'BTCUSDT',now:x.now});
 assert.ok(b.intervals<=a.intervals);
 const wrong=x.snapshots.map(row=>({...row,asset:'ETHUSDT'}));
 const c=compareOnChainMarketHistory(wrong,x.candles,{asset:'BTCUSDT',now:x.now});
 assert.equal(c.state,'INSUFFICIENT');assert.equal(c.correlation,null);
});
test('TON supports observed masterchain sequence without wallet or transaction claims',()=>{
 const x=fixtures(26,'ton');
 const r=compareOnChainMarketHistory(x.snapshots,x.candles,{asset:'GRAMUSDT',now:x.now});
 assert.equal(r.chain,'ton');assert.equal(r.state,'DESCRIPTIVE');
 assert.match(r.networkMeasure,/masterchain/);
 assert.equal(compareOnChainMarketHistory(x.snapshots,x.candles,{asset:'TONUSDT',now:x.now}).state,'UNSUPPORTED');
});
test('gapped candle history and constant network metric suppress misleading association',()=>{
 const x=fixtures();
 const missing=x.candles.filter((_,i)=>i!==9);
 const withGap=compareOnChainMarketHistory(x.snapshots,missing,{asset:'BTCUSDT',now:x.now});
 assert.ok(withGap.intervals<x.candles.length);
 const same=x.snapshots.map(v=>({
  ...v,payload:JSON.stringify({...JSON.parse(v.payload),mempoolCount:500})
 }));
 const flat=compareOnChainMarketHistory(same,x.candles,{asset:'BTCUSDT',now:x.now});
 assert.equal(flat.state,'LOW_VARIATION');
 assert.equal(flat.correlation,null);
});
