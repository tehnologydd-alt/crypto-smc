import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRegimeTransitions,TRANSITION_RULES} from './regime-transitions.mjs';
import {analyzeResearchRegimes} from './research-regimes.mjs';
const H=3_600_000,T=1700002799999;
const MODES=['DIRECTIONAL','RANGE','TRANSITION'];
const VOLS=['EXPANDING','STABLE','CONTRACTING'];
function counts(windows,key,names){
 return Object.fromEntries(names.map(id=>[id,windows.filter(x=>x[key]===id).length]));
}
function fixture({length=144,modeAt=null}={}){
 const windows=Array.from({length},(_,index)=>{
  const within=index%48;
  const fold=Math.floor(index/48);
  const mode=modeAt?modeAt(index):
   fold===1?MODES[index%3]:
   fold===0?MODES[Math.floor(within/4)%3]:
    MODES[2-Math.floor(within/4)%3];
  return {anchorAt:T+index*4*H,targetAt:T+(index+1)*4*H,
   mode,volatility:VOLS[index%3],absChangePct:0.2+index%9,
   nextCloseInCorridor:index%4!==0};
 });
 const foldSize=Math.floor(length/3);
 const sections=[0,1,2].map(i=>
  windows.slice(i*foldSize,i===2?length:(i+1)*foldSize));
 const periods=sections.map(rows=>({
  samples:rows.length,firstAt:rows[0].targetAt,lastAt:rows.at(-1).targetAt,
  regimeCounts:counts(rows,'mode',MODES),
  volatilityCounts:counts(rows,'volatility',VOLS)
 }));
 return {state:'DESCRIPTIVE',asset:'BTCUSDT',archiveComplete:true,
  missingHours:0,windows,periods,firstAt:windows[0].targetAt,
  lastAt:windows.at(-1).targetAt,
  overall:{samples:windows.length,
   regimeCounts:counts(windows,'mode',MODES),
   volatilityCounts:counts(windows,'volatility',VOLS)}};
}
test('transitions form exact three source-validated, no-leakage folds',()=>{
 const source=fixture(),out=analyzeRegimeTransitions(source);
 assert.equal(out.state,'DESCRIPTIVE');
 assert.equal(out.periods.length,3);
 assert.deepEqual(out.periods.map(x=>x.pairs),[47,47,47]);
 assert.equal(out.transitions,141);
 assert.equal(out.excludedBoundaries,2);
 assert.equal(out.matrix.reduce((sum,r)=>sum+r.total,0),141);
 assert.equal(out.origins.reduce((sum,r)=>sum+r.count,0),141);
 for(let i=0;i<3;i++){
  const p=out.periods[i];
  assert.equal(p.unchangedCount+p.changedCount,p.pairs);
  assert.equal(p.matrix.reduce((sum,r)=>sum+r.total,0),p.pairs);
  const second=source.windows[(i+1)*48];
  assert.notEqual(p.lastToAt,second.anchorAt);
 }
});
test('each matrix cell matches observed, not synthetic regime changes',()=>{
 const out=analyzeRegimeTransitions(fixture());
 for(const from of out.matrix){
  for(const dest of MODES)
   assert.equal(from.counts[dest],
    out.periods.reduce((sum,p)=>
     sum+p.matrix.find(x=>x.id===from.id).counts[dest],0));
 }
 const directional=out.origins.find(x=>x.id==='DIRECTIONAL');
 assert.equal(directional.sufficient,true);
 assert.equal(directional.destinations.length,3);
 assert.equal(directional.persistence.state,'DESCRIPTIVE');
 assert.ok(directional.persistence.periods.every(x=>x.total>=12));
 assert.ok(directional.persistence.periods.every(x=>
  x.lower<=x.share&&x.upper>=x.share));
 assert.equal(TRANSITION_RULES.minOriginTransitionsPerPeriod,12);
});
test('switching rates vary by period but never claim future calibrated odds',()=>{
 const out=analyzeRegimeTransitions(fixture());
 const row=out.origins.find(x=>x.id==='DIRECTIONAL');
 assert.ok(row.persistence.periods[0].share>row.persistence.periods[1].share);
 assert.ok(Number.isFinite(row.persistence.earlyLateChangePp));
 assert.match(out.note,/не являются вероятностью/);
});
test('rare originating regime is count-only and hides all conditional rates',()=>{
 const source=fixture({modeAt:i=>{
  if(i<48)return i%20===0?'TRANSITION':i%2===0?'RANGE':'DIRECTIONAL';
  return MODES[i%3];
 }});
 const out=analyzeRegimeTransitions(source);
 assert.equal(out.state,'DESCRIPTIVE');
 const row=out.origins.find(x=>x.id==='TRANSITION');
 assert.equal(row.sufficient,false);
 assert.ok(row.count>0);
 assert.equal(row.persistence.state,'INSUFFICIENT');
 assert.ok(row.destinations.every(d=>d.comparison.periods.length===0));
});
test('reject malformed, unverified, gapped and inconsistent source windows',()=>{
 const valid=fixture();
 for(const source of [
  {...valid,archiveComplete:false},
  {...valid,missingHours:2},
  {...valid,state:'INVALID'},
  {...valid,windows:valid.windows.slice(0,-1)},
  {...valid,windows:valid.windows.map((w,i)=>i===7?{...w,mode:'FORECAST'}:w)},
  {...valid,windows:valid.windows.map((w,i)=>i===7?{...w,anchorAt:w.anchorAt+H}:w)},
  {...valid,periods:valid.periods.map((p,i)=>i===0?
   {...p,regimeCounts:{...p.regimeCounts,DIRECTIONAL:p.regimeCounts.DIRECTIONAL+1}}:p)}
 ]){
  const out=analyzeRegimeTransitions(source);
  assert.equal(out.state,'HIDDEN');
  assert.equal(out.transitions,0);
  assert.equal(out.origins.length,0);
 }
});
test('invariance: later labels cannot alter earlier fold historical transition counts',()=>{
 const a=fixture(),b=fixture();
 b.windows=b.windows.map((w,i)=>i<48?w:{...w,mode:MODES[(i+1)%3]});
 const update=rows=>rows.map((_,i)=>{
  const part=b.windows.slice(i*48,(i+1)*48);
  return {...rows[i],regimeCounts:counts(part,'mode',MODES)};
 });
 b.periods=update(b.periods);
 b.overall.regimeCounts=counts(b.windows,'mode',MODES);
 const r1=analyzeRegimeTransitions(a),r2=analyzeRegimeTransitions(b);
 assert.equal(r1.state,'DESCRIPTIVE');
 assert.equal(r2.state,'DESCRIPTIVE');
 assert.deepEqual(r1.periods[0],r2.periods[0]);
});
test('actual Research Regimes report works as input without network',()=>{
 const rows=[],step=3_600_000,base=1700000000000-1700000000000%step;
 let price=100;
 for(let i=0;i<620;i++){
  const t=base+i*step,open=price;
  price*=Math.exp(.004*Math.sin(i*.7)+.001*Math.cos(i*.13));
  rows.push({t,closeAt:t+step-1,open,close:price,
   high:Math.max(open,price)*1.001,
   low:Math.min(open,price)*.999,volume:100+i%8,closed:true});
 }
 const regime=analyzeResearchRegimes(rows,{asset:'BTCUSDT',
  archiveComplete:true,now:base+1000*step});
 assert.equal(regime.state,'DESCRIPTIVE');
 const transition=analyzeRegimeTransitions(regime);
 assert.equal(transition.state,'DESCRIPTIVE');
 assert.equal(transition.transitions,regime.windows.length-3);
});
