import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHistoricalRanges,VALIDATION_RULES} from './validation-core.mjs';
const H=3600000,T=1700000000000-1700000000000%H;
function candles(n=396,options={}){
 let price=100;
 const rows=[];
 for(let i=0;i<n;i++){
  const t=T+i*H,open=price;
  const move=(Math.sin(i*.67)*.006+Math.cos(i*.17)*.004+(i%7===0?.003:0));
  price*=Math.exp(move);
  rows.push({t,closeAt:t+H-1,open,close:price,
   high:Math.max(price,open)*1.001,low:Math.min(open,price)*.999,
   volume:100+i%9,closed:true});
 }
 return rows;
}
const now=T+1000*H;
test('fixed non-optimized rules: 96 training candles, 4-bar targets and exactly 3 folds',()=>{
 const result=validateHistoricalRanges(candles(),{now});
 assert.equal(result.state,'DESCRIPTIVE');
 assert.equal(result.rules.trainingBars,96);
 assert.equal(result.rules.horizonBars,4);
 assert.equal(result.folds.length,3);
 assert.ok(result.folds.every(f=>f.comparisons>=15));
 assert.equal(result.overall.comparisons,result.comparisons);
});
test('all target windows are disjoint; no double-counted 4-hour outcome',()=>{
 const r=validateHistoricalRanges(candles(),{now});
 for(let i=1;i<r.folds.length;i++)
  assert.ok(r.folds[i].firstTargetAt>=r.folds[i-1].lastTargetAt+4*H);
 assert.ok(r.overall.apex.observedCoverage>=0&&r.overall.apex.observedCoverage<=1);
 assert.ok(r.overall.reference.meanIntervalScore>0);
});
test('future bar marked closed cannot change available historical validation',()=>{
 const source=candles();
 const current=source.at(-1);
 const cut=current.closeAt+1;
 const short=source.slice(0,-1);
 const a=validateHistoricalRanges(short,{now:cut});
 const fabricated={...current,open:1,high:1e9,close:1e9,low:.001,
  closeAt:cut+H}; // would have inconsistent timestamp, must be invalid
 const b=validateHistoricalRanges([...short,fabricated],{now:cut});
 assert.equal(b.state,'INVALID');
 assert.equal(a.state,'DESCRIPTIVE');
});
test('last candle excluded if its source close is in the future',()=>{
 const source=candles();
 const last=source.at(-1);
 const cutoff=last.t+H/2;
 const a=validateHistoricalRanges(source,{now:cutoff});
 const b=validateHistoricalRanges(source.slice(0,-1),{now:cutoff});
 assert.equal(a.state,b.state);
 assert.equal(a.comparisons,b.comparisons);
});
test('missing H1 candles block cherry-picked results',()=>{
 const c=candles().filter((x,i)=>i!==190);
 const r=validateHistoricalRanges(c,{now});
 assert.equal(r.state,'GAPPED');
 assert.equal(r.gaps,1);
 assert.equal(r.overall,null);
});
test('history insufficient for three folds blocks all impressive looking scores',()=>{
 const r=validateHistoricalRanges(candles(155),{now});
 assert.equal(r.state,'INSUFFICIENT');
 assert.equal(r.overall,null);
 assert.equal(r.folds.length,0);
});
test('constant candles are not assigned a spurious correlation or coverage',()=>{
 const c=candles().map(c=>({...c,open:100,high:100,low:100,close:100}));
 assert.equal(validateHistoricalRanges(c,{now}).state,'LOW_VARIATION');
});
test('altering closes after an earlier anchor cannot retroactively change its training range',()=>{
 const first=validateHistoricalRanges(candles(),{now});
 const altered=candles().map((c,i)=>{
  if(i<300)return c;
  const open=c.open,close=c.close*1.05;
  return {...c,open,close,high:Math.max(open,close)*1.01,
   low:Math.min(open,close)*.99};
 });
 const second=validateHistoricalRanges(altered,{now});
 assert.equal(first.folds[0].apex.meanLogWidth,second.folds[0].apex.meanLogWidth);
});
