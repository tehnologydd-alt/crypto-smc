import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRegimeHoldout,HOLDOUT_RULES} from './regime-holdout.mjs';
import {analyzeResearchRegimes} from './research-regimes.mjs';
const H=3_600_000, T=1700002799999;
const MODES=['DIRECTIONAL','RANGE','TRANSITION'];
const VOLS=['EXPANDING','STABLE','CONTRACTING'];
function counts(rows,field,labels){
 return Object.fromEntries(labels.map(label=>[
  label,rows.filter(x=>x[field]===label).length]));
}
function fixture({n=192,modeAt=null}={}){
 const windows=Array.from({length:n},(_,i)=>({
  anchorAt:T+i*4*H,targetAt:T+(i+1)*4*H,
  mode:modeAt?modeAt(i):MODES[i%3],
  volatility:VOLS[i%3],absChangePct:.3+i%5,
  nextCloseInCorridor:i%3!==0
 }));
 const k=Math.floor(n/3);
 const parts=[0,1,2].map(i=>
  windows.slice(i*k,i===2?n:(i+1)*k));
 return {state:'DESCRIPTIVE',asset:'BTCUSDT',archiveComplete:true,
  missingHours:0,windows,
  periods:parts.map(p=>({samples:p.length,
   firstAt:p[0].targetAt,lastAt:p.at(-1).targetAt,
   regimeCounts:counts(p,'mode',MODES),
   volatilityCounts:counts(p,'volatility',VOLS)})),
  firstAt:windows[0].targetAt,lastAt:windows.at(-1).targetAt,
  overall:{samples:n,regimeCounts:counts(windows,'mode',MODES),
   volatilityCounts:counts(windows,'volatility',VOLS)}};
}
test('holdout uses earlier 60 percent, purges 40 hours, never crosses split',()=>{
 const report=fixture(),result=analyzeRegimeHoldout(report);
 assert.equal(result.state,'DESCRIPTIVE');
 assert.equal(result.asset,'BTCUSDT');
 assert.equal(result.reference.labels,Math.floor(192*.6));
 assert.equal(result.holdout.labels,192-Math.floor(192*.6)-10);
 assert.equal(result.reference.pairs,result.reference.labels-1);
 assert.equal(result.holdout.pairs,result.holdout.labels-1);
 assert.equal(result.embargo.excludedLabels,10);
 assert.equal(result.embargo.excludedHours,40);
 assert.equal(result.embargo.separationHours,44);
 assert.equal(result.holdout.firstAt-result.reference.lastAt,44*H);
 assert.equal(HOLDOUT_RULES.minWindows,144);
});
test('each destination fraction is conditioned on origin and sums to one',()=>{
 const result=analyzeRegimeHoldout(fixture());
 assert.equal(result.comparableModes,3);
 for(const origin of result.rows){
  assert.equal(origin.state,'DESCRIPTIVE');
  assert.equal(origin.transitions.length,3);
  assert.equal(origin.transitions.reduce((s,x)=>s+x.referenceCount,0),
   origin.referencePairs);
  assert.equal(origin.transitions.reduce((s,x)=>s+x.holdoutCount,0),
   origin.holdoutPairs);
  assert.ok(Math.abs(
   origin.transitions.reduce((s,x)=>s+x.referenceRate.share,0)-1)<1e-12);
  assert.ok(Math.abs(
   origin.transitions.reduce((s,x)=>s+x.holdoutRate.share,0)-1)<1e-12);
  assert.ok(origin.transitions.every(x=>
   x.holdoutRate.lower<=x.holdoutRate.share&&
   x.holdoutRate.share<=x.holdoutRate.upper));
 }
});
test('holdout never gets used to choose the reference most common transition',()=>{
 const report=fixture({modeAt:i=>{
  if(i<115)return i%3===0?'DIRECTIONAL':i%3===1?'RANGE':'TRANSITION';
  return i%4===0?'TRANSITION':'DIRECTIONAL';
 }});
 const result=analyzeRegimeHoldout(report);
 assert.equal(result.state,'DESCRIPTIVE');
 const reference=report.windows.slice(0,Math.floor(192*.6));
 const observedRefD=reference.slice(0,-1).filter(x=>x.mode==='DIRECTIONAL').length;
 assert.equal(result.rows.find(x=>x.id==='DIRECTIONAL').referencePairs,observedRefD);
 assert.equal(result.holdout.firstAt,
  report.windows[Math.floor(192*.6)+10].anchorAt);
});
test('rare mode hides conditional fractions but preserves counts',()=>{
 const result=analyzeRegimeHoldout(fixture({modeAt:i=>
  i<130?MODES[i%3]:(i%18===0?'TRANSITION':'DIRECTIONAL')
 }));
 const transition=result.rows.find(x=>x.id==='TRANSITION');
 assert.equal(result.state,'DESCRIPTIVE');
 assert.equal(transition.state,'INSUFFICIENT');
 assert.ok(transition.referencePairs>=15);
 assert.ok(transition.holdoutPairs<15);
 assert.ok(transition.transitions.every(x=>
  x.referenceRate===null&&x.holdoutRate===null&&x.differencePp===null));
});
test('fail closed on missing candles, corrupted fold counts and malformed windows',()=>{
 const report=fixture();
 for(const source of [
  {...report,archiveComplete:false},
  {...report,missingHours:3},
  {...report,state:'GAPPED'},
  {...report,windows:report.windows.slice(0,-1)},
  {...report,windows:report.windows.map((x,i)=>i===32?{...x,targetAt:x.targetAt+H}:x)},
  {...report,periods:report.periods.map((x,i)=>i===0?
   {...x,regimeCounts:{...x.regimeCounts,DIRECTIONAL:1000}}:x)}
 ]){
  const r=analyzeRegimeHoldout(source);
  assert.equal(r.state,'HIDDEN');
  assert.equal(r.rows.length,0);
 }
});
test('a short original history is insufficient, not artificially extended',()=>{
 const r=analyzeRegimeHoldout(fixture({n:120}));
 assert.equal(r.state,'INSUFFICIENT');
 assert.equal(r.reference,null);
});
test('later observations cannot change earlier holdout reference counts',()=>{
 const source=fixture();
 const changed=fixture({modeAt:i=>i<115?MODES[i%3]:MODES[(i+1)%3]});
 const a=analyzeRegimeHoldout(source),b=analyzeRegimeHoldout(changed);
 assert.equal(a.state,'DESCRIPTIVE');assert.equal(b.state,'DESCRIPTIVE');
 assert.deepEqual(a.reference,b.reference);
 assert.deepEqual(a.rows.map(x=>x.referencePairs),
  b.rows.map(x=>x.referencePairs));
});
test('accept genuine real-source Research Regimes output and reject future bars',()=>{
 const start=1700000000000-1700000000000%H;
 let price=100;const bars=[];
 for(let i=0;i<850;i++){
  const t=start+i*H,open=price;
  price*=Math.exp(Math.sin(i*.31)*.006+Math.cos(i*.21)*.001);
  bars.push({t,closeAt:t+H-1,open,close:price,
   high:Math.max(open,price)*1.001,
   low:Math.min(open,price)*.999,
   volume:100+i%7,closed:true});
 }
 const reg=analyzeResearchRegimes(bars,{
  asset:'BTCUSDT',now:start+1100*H,archiveComplete:true
 });
 assert.equal(reg.state,'DESCRIPTIVE');
 const r=analyzeRegimeHoldout(reg);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.reference.pairs+r.holdout.pairs,
  r.reference.labels+r.holdout.labels-2);
 const invalid=analyzeResearchRegimes(bars,{asset:'BTCUSDT',
  now:start+100*H,archiveComplete:true});
 assert.notEqual(invalid.state,'DESCRIPTIVE');
 assert.equal(analyzeRegimeHoldout(invalid).state,'HIDDEN');
});
