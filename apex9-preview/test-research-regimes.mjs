import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeResearchRegimes,classifyHistoricalRegime,
 REGIME_RULES} from './research-regimes.mjs';

const H=3600000;
const T=1700000000000-1700000000000%H;
const NOW=T+6000*H;
function bars(n=480,{sequence='VARIED'}={}){
 let last=100;
 const rows=[];
 for(let i=0;i<n;i++){
  const t=T+i*H,open=last;
  let move=sequence==='TREND'?.002:
   sequence==='RANGE'?(i%2===0?.006:-.006):
   Math.sin(i*.7)*.006+Math.cos(i*.09)*.003+
    (Math.floor(i/60)%3===0?.002:0);
  last=open*Math.exp(move);
  rows.push({t,closeAt:t+H-1,open,close:last,
   high:Math.max(open,last)*1.0005,
   low:Math.min(open,last)*.9995,
   volume:100+i%11,closed:true});
 }
 return rows;
}
const check=(rows,extra={})=>analyzeResearchRegimes(rows,{
 asset:'BTCUSDT',now:NOW,archiveComplete:true,...extra
});

test('fixed market-core efficiency bands classify trend and range using past only',()=>{
 const trend=classifyHistoricalRegime(bars(40,{sequence:'TREND'}));
 const sideways=classifyHistoricalRegime(bars(40,{sequence:'RANGE'}));
 assert.equal(trend.mode,'DIRECTIONAL');
 assert.equal(trend.direction,'UP');
 assert.equal(sideways.mode,'RANGE');
 assert.ok(trend.efficiency>.57);
 assert.ok(sideways.efficiency<=.28);
 assert.equal(REGIME_RULES.horizonBars,4);
});
test('H1 archive yields retrospective nonoverlapping windows in chronological folds',()=>{
 const c=bars(480);
 const r=check(c);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.periods.length,3);
 assert.ok(r.periods.every(x=>x.samples>=15));
 assert.equal(r.overall.samples,r.windows.length);
 assert.deepEqual(
  r.overall.regimeCounts,
  Object.fromEntries(['DIRECTIONAL','RANGE','TRANSITION'].map(x=>[
   x,r.windows.filter(w=>w.mode===x).length]))
 );
 for(let i=1;i<r.windows.length;i++)
  assert.equal(r.windows[i].anchorAt-r.windows[i-1].anchorAt,4*H);
 assert.ok(r.modeStats.every(x=>!x.sufficient||
  x.periods.every(p=>p.samples>=5)));
});
test('future candle changes cannot alter a previously fixed regime',()=>{
 const first=bars(480);
 const baseline=check(first);
 const mutated=first.map((bar,i)=>{
  if(i<45)return bar;
  const close=bar.close*1.02;
  return {...bar,close,high:Math.max(bar.open,close)*1.001,
   low:Math.min(bar.open,close)*.999};
 });
 const second=check(mutated);
 assert.equal(second.state,'DESCRIPTIVE');
 assert.equal(baseline.windows[0].mode,second.windows[0].mode);
 assert.equal(baseline.windows[0].volatility,second.windows[0].volatility);
 assert.equal(baseline.windows[0].efficiency,second.windows[0].efficiency);
});
test('missing hourly sources block selective empirical percentages',()=>{
 const c=bars(480).filter((_,i)=>i!==200);
 const r=check(c);
 assert.equal(r.state,'GAPPED');
 assert.equal(r.missingHours,1);
 assert.equal(r.overall,null);
 assert.deepEqual(r.windows,[]);
});
test('incomplete archive and future bars cannot claim trustworthy regimes',()=>{
 const c=bars(480);
 const partial=check(c,{archiveComplete:false});
 assert.equal(partial.state,'PARTIAL_ARCHIVE');
 assert.equal(partial.overall,null);
 const fake=c.map((b,i)=>i===300?{...b,closeAt:NOW+H}:b);
 const invalid=check(fake);
 assert.equal(invalid.state,'INVALID');
 assert.equal(invalid.overall,null);
});
test('less than 45 4H studies cannot publish historical share',()=>{
 const r=check(bars(200));
 assert.equal(r.state,'INSUFFICIENT');
 assert.equal(r.overall,null);
});
test('constant prices do not divide by zero or imply an upward trend',()=>{
 const c=bars(480).map(b=>({...b,open:100,high:100,low:100,close:100}));
 const r=check(c);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.overall.regimeCounts.RANGE,r.overall.samples);
 assert.ok(r.windows.every(x=>x.absChangePct===0&&x.mode==='RANGE'));
 assert.ok(r.windows.every(x=>x.volatility==='STABLE'));
});
test('foreign asset names, malformed OHLCV, duplicate candles and long inputs fail closed',()=>{
 const c=bars(480);
 assert.equal(check(c,{asset:'ethusdt'}).state,'INVALID');
 assert.equal(check([...c,c.at(-1)]).state,'INVALID');
 assert.equal(check(c.map((b,i)=>i===10?{...b,high:0}:b)).state,'INVALID');
 assert.equal(check(bars(4804)).state,'INVALID');
});
test('cohort percentages are withheld unless each period has 5 observations',()=>{
 const r=check(bars(480,{sequence:'TREND'}));
 assert.equal(r.state,'DESCRIPTIVE');
 const directional=r.modeStats.find(m=>m.id==='DIRECTIONAL');
 const range=r.modeStats.find(m=>m.id==='RANGE');
 assert.equal(directional.sufficient,true);
 assert.ok(directional.periods.every(p=>p.insideShare!==null));
 assert.equal(range.sufficient,false);
 assert.equal(range.overall,null);
});
