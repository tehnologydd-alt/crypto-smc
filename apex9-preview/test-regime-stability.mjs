import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRegimeStability,REGIME_STABILITY_RULES} from './regime-stability.mjs';
import {analyzeResearchRegimes} from './research-regimes.mjs';

const H=3600000,T=1700002799999;
function record(mode,volatility,index){
 return {anchorAt:T+index*4*H,targetAt:T+(index+1)*4*H,
  mode,volatility,absChangePct:1+index%7,
  nextCloseInCorridor:index%3!==0};
}
function fixture(){
 const modes=['DIRECTIONAL','RANGE','TRANSITION'];
 const vols=['STABLE','EXPANDING','CONTRACTING'];
 const windows=[];
 for(let fold=0;fold<3;fold++){
  for(let j=0;j<48;j++){
   const mode=fold===0?
    (j<32?'DIRECTIONAL':j<44?'RANGE':'TRANSITION'):
    fold===1?(j<24?'DIRECTIONAL':j<36?'RANGE':'TRANSITION'):
    (j<12?'DIRECTIONAL':j<36?'RANGE':'TRANSITION');
   windows.push(record(mode,vols[j%3],fold*48+j));
  }
 }
 const counter=(part,key,labels)=>Object.fromEntries(labels.map(label=>[
  label,part.filter(x=>x[key]===label).length]));
 const periods=[0,1,2].map(i=>{
  const group=windows.slice(i*48,(i+1)*48);
  return {samples:group.length,firstAt:group[0].targetAt,
   lastAt:group.at(-1).targetAt,
   regimeCounts:counter(group,'mode',modes),
   volatilityCounts:counter(group,'volatility',vols)};
 });
 return {state:'DESCRIPTIVE',asset:'BTCUSDT',archiveComplete:true,
  missingHours:0,windows,periods,firstAt:windows[0].targetAt,
  lastAt:windows.at(-1).targetAt,
  overall:{samples:windows.length,
   regimeCounts:counter(windows,'mode',modes),
   volatilityCounts:counter(windows,'volatility',vols)}};
}
test('all historical regime shares have three Wilson intervals and distinct counts',()=>{
 const r=analyzeRegimeStability(fixture());
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.periods.length,3);
 assert.equal(r.regimes.length,3);
 assert.equal(r.volatility.length,3);
 for(let i=0;i<3;i++)
  assert.equal(r.regimes.reduce((sum,x)=>sum+x.occurrence.periods[i].count,0),48);
 assert.ok(r.regimes.flatMap(x=>x.occurrence.periods).every(x=>
  x.lower<=x.share&&x.upper>=x.share));
 assert.equal(REGIME_STABILITY_RULES.minModeOutcomesPerPeriod,12);
});
test('early to late shift uses percentage points, not predictor confidence',()=>{
 const result=analyzeRegimeStability(fixture());
 const d=result.regimes.find(x=>x.id==='DIRECTIONAL');
 assert.equal(d.occurrence.periods[0].count,32);
 assert.equal(d.occurrence.periods[2].count,12);
 assert.ok(Math.abs(d.occurrence.earlyLateChangePp+100*(20/48))<1e-9);
 const vol=result.volatility.find(x=>x.id==='STABLE');
 assert.equal(vol.occurrence.earlyLateChangePp,0);
});
test('regime with fewer than twelve cases in an early fold hides outcome rates',()=>{
 const result=analyzeRegimeStability(fixture());
 const tr=result.regimes.find(x=>x.id==='TRANSITION');
 assert.equal(tr.occurrence.periods[0].count,4);
 assert.equal(tr.outcomes.state,'INSUFFICIENT');
 assert.equal(tr.outcomes.periods.length,0);
 assert.equal(tr.outcomes.earlyLateChangePp,undefined);
 const dir=result.regimes.find(x=>x.id==='DIRECTIONAL');
 assert.equal(dir.outcomes.state,'DESCRIPTIVE');
 assert.equal(dir.outcomes.periods.length,3);
 assert.ok(dir.outcomes.periods.every(x=>x.count>=12));
});
test('incomplete and gapped candle archives cannot leak percentages',()=>{
 for(const report of [
  {...fixture(),archiveComplete:false},
  {...fixture(),missingHours:1},
  {...fixture(),state:'GAPPED',reason:'missing'},
  null
 ]){
  const result=analyzeRegimeStability(report);
  assert.equal(result.state,'HIDDEN');
  assert.equal(result.regimes.length,0);
 }
});
test('changed source mode counts, outcome types and timestamps fail closed',()=>{
 const x=fixture();
 x.periods[0].regimeCounts.DIRECTIONAL=33;
 assert.equal(analyzeRegimeStability(x).state,'HIDDEN');
 const y=fixture();y.windows[31].nextCloseInCorridor=1;
 assert.equal(analyzeRegimeStability(y).state,'HIDDEN');
 const z=fixture();z.windows[31].anchorAt+=H;
 assert.equal(analyzeRegimeStability(z).state,'HIDDEN');
 const a=fixture();a.overall.volatilityCounts.STABLE--;
 assert.equal(analyzeRegimeStability(a).state,'HIDDEN');
});
test('changing later realized outcomes never changes earlier classified regime shares',()=>{
 const a=fixture();
 const result=analyzeRegimeStability(a);
 const later=fixture();
 for(let i=80;i<later.windows.length;i++)
  later.windows[i].nextCloseInCorridor=!later.windows[i].nextCloseInCorridor;
 const changed=analyzeRegimeStability(later);
 assert.equal(changed.state,'DESCRIPTIVE');
 assert.deepEqual(changed.regimes.map(x=>x.occurrence),
  result.regimes.map(x=>x.occurrence));
});
test('real Research Regimes output is accepted without using any future H1 input',()=>{
 const bars=[];let price=100;
 const start=1700000000000-1700000000000%H;
 for(let i=0;i<580;i++){
  const t=start+i*H,open=price;
  price*=Math.exp(Math.sin(i*.6)*.005+Math.cos(i*.13)*.003);
  bars.push({t,closeAt:t+H-1,open,close:price,
   high:Math.max(open,price)*1.001,
   low:Math.min(open,price)*.999,
   volume:100+i%17,closed:true});
 }
 const report=analyzeResearchRegimes(bars,{
  asset:'BTCUSDT',now:start+2000*H,archiveComplete:true
 });
 assert.equal(report.state,'DESCRIPTIVE');
 const result=analyzeRegimeStability(report);
 assert.equal(result.state,'DESCRIPTIVE');
 assert.equal(result.periods.reduce((s,x)=>s+x.samples,0),report.windows.length);
});
