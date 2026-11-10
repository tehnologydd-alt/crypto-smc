import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScenarioMap,mapScenarioToViewport} from './scenario-map.mjs';
const H=3600000,anchor=1700002799999,now=anchor+5*H;
function scenario(asset='BTCUSDT',k=0,done=false){
 const a=anchor+k*4*H;
 const target=a+4*H;
 return {
  id:'range1:'+asset+':1h:'+a,asset,interval:'1h',publishedAt:a+500,
  status:done?'COMPLETED':'ACTIVE',hypothesis:JSON.stringify({
   model:'EMPIRICAL_CLOSE_RANGE_V1',anchorCloseAt:a,targetCloseAt:target,
   anchorClose:100,bandLow:95,bandHigh:105
  }),stageEvents:[
   {stage:'CONFIRMED',observedAt:a+H,recordedAt:a+H+200},
   {stage:'ACTIVE',observedAt:a+2*H,recordedAt:a+2*H+200}
  ],
  evaluation:done?{
   targetCloseAt:target,evaluatedAt:target+200,
   outcome:'WITHIN_RANGE',actualClose:101
  }:null
 };
}
const rows=Array.from({length:7},(_,i)=>scenario('BTCUSDT',i));
const candles=(start=anchor,n=7)=>
 Array.from({length:n},(_,i)=>({
  t:start+i*H-(H-1),closeAt:start+i*H,
  closed:true,open:100,close:101,high:103,low:98,volume:20
 }));
test('selected view only displays the user-marked research IDs for that asset',()=>{
 const r=buildScenarioMap([...rows,scenario('ETHUSDT')],{
  asset:'BTCUSDT',selectedIds:[rows[4].id,rows[2].id],mode:'tracked',
  now:now+30*H
 });
 assert.equal(r.available,2);
 assert.ok(r.scenarios.every(s=>s.tracked&&s.asset==='BTCUSDT'));
 assert.equal(r.totalForAsset,7);
});
test('focused research is first and never changes immutable source hypothesis',()=>{
 const item=scenario(),copy=JSON.stringify(item);
 const result=buildScenarioMap([item,...rows.slice(1)],{
  asset:'BTCUSDT',selectedIds:[],focusId:rows[1].id,now:now+30*H
 });
 assert.equal(result.scenarios[0].id,rows[1].id);
 assert.equal(JSON.stringify(item),copy);
 assert.ok(result.scenarios.length<=3);
});
test('confirmed recorded stages have source timestamps and no invented H1 #3',()=>{
 const result=buildScenarioMap([scenario()],{asset:'BTCUSDT',now});
 const s=result.scenarios[0];
 assert.deepEqual(s.milestones.map(x=>x.key),['PUBLISHED','CONFIRMED','ACTIVE']);
 assert.equal(s.milestones[1].observedAt,anchor+H);
 assert.ok(!s.milestones.some(x=>x.key==='EVALUATED'));
});
test('envelope ends at last observed real candle and never runs into blank future',()=>{
 const s=buildScenarioMap([scenario()],{asset:'BTCUSDT',now}).scenarios[0];
 const view=mapScenarioToViewport(s,candles(anchor,3));
 assert.equal(view.visible,true);
 assert.equal(view.segments[0].from,0);
 assert.equal(view.segments[0].to,2);
 assert.deepEqual(view.marks.map(x=>x.key),['PUBLISHED','CONFIRMED','ACTIVE']);
});
test('missing H1 data creates separate segments and cannot create missing stage markers',()=>{
 const s=buildScenarioMap([scenario()],{asset:'BTCUSDT',now}).scenarios[0];
 const c=candles(anchor,5).filter((_,i)=>i!==2);
 const v=mapScenarioToViewport(s,c);
 assert.equal(v.segments.length,2);
 assert.ok(!v.marks.some(x=>x.key==='ACTIVE'));
});
test('only real candle close times anchor evaluation; live bars cannot draw annotations',()=>{
 const s=buildScenarioMap([scenario('BTCUSDT',0,true)],{
  asset:'BTCUSDT',now}).scenarios[0];
 const c=candles(anchor,5);
 const v=mapScenarioToViewport(s,c);
 assert.ok(v.marks.some(x=>x.key==='EVALUATED'));
 c[4].closed=false;
 assert.ok(!mapScenarioToViewport(s,c).marks.some(x=>x.key==='EVALUATED'));
});
test('no cross-timeframe overlays, invalid records and absent candles stay empty',()=>{
 const s=buildScenarioMap([scenario()],{asset:'BTCUSDT',now}).scenarios[0];
 assert.equal(mapScenarioToViewport(s,candles(),{interval:'4h'}).visible,false);
 assert.equal(mapScenarioToViewport(s,[]).visible,false);
 assert.equal(buildScenarioMap([{...scenario(),hypothesis:'{}'}],{asset:'BTCUSDT',now}).state,'EMPTY');
});


test('chart M15/H4 shows its own immutable forecasts with correct candle markers',async()=>{
 const {MULTIFRAME_MODEL}=await import('./forecast-multiframe.mjs');
 const {computeReferenceLevels}=await import('./research-level-sequence.mjs');
 const round=n=>Number(n.toPrecision(13));
 const M5=300000,H4=14400000;
 const at=Math.floor(Date.UTC(2026,10,12)/H4)*H4-1;
 const price=100,width=.04,now=at+30*H4;
 const levels=computeReferenceLevels(price,
  round(price*Math.exp(-width)),round(price*Math.exp(width)));
 const make=(interval,step,bars)=>{
  const publishedAt=at+2000;
  return {
   id:'direction3:BTCUSDT:'+interval+':'+at,
   asset:'BTCUSDT',interval,publishedAt,status:'ACTIVE',
   evaluation:null,
   stageEvents:[
    {stage:'LIMIT_READY',observedAt:at+2*M5,
     recordedAt:at+2*M5+1000},
    {stage:'CONFIRMED',observedAt:at+3*M5,
     recordedAt:at+3*M5+1000}
   ],
   hypothesis:{model:MULTIFRAME_MODEL,interval,direction:'UP',
    evaluationInterval:'5m',
    observationMethod:'M5_CLOSED_LEVEL_ORDER_V1',
    decisionMethod:'SIX_BAR_EFFICIENCY_V1',
    stageSemantics:'M5_CLOSED_LIMIT_V2',
    anchorCloseAt:at,anchorClose:price,targetCloseAt:at+step*bars,
    horizonBars:bars,sampleBars:96,empiricalSamples:92,
    empiricalWidth:width,historicalPercentile:.8,
    levelStudy:{version:'MULTIFRAME_SINGLE_LEVELS_V1',
     direction:'UP',entry:price,...levels.UP},
    contextAsPublished:{}}
  };
 };
 const m15=make('15m',900000,16);
 const h4=make('4h',H4,24);
 for(const [row,tf,step] of [
  [m15,'15m',900000],[h4,'4h',H4]
 ]){
  const mapped=buildScenarioMap([m15,h4],{
   asset:'BTCUSDT',interval:tf,now});
  assert.equal(mapped.available,1);
  assert.equal(mapped.scenarios[0].id,row.id);
  assert.equal(mapped.scenarios[0].model,'MULTIFRAME');
  assert.equal(mapped.scenarios[0].sourceInterval,tf);
  assert.equal(mapped.scenarios[0].levels.entry,price);
  const cs=Array.from({length:3},(_,i)=>({
   closeAt:at+i*step,t:at+i*step-step+1,closed:true,
   open:price,high:price+1,low:price-1,close:price,volume:10
  }));
  const plotted=mapScenarioToViewport(mapped.scenarios[0],cs,{
   interval:tf});
  assert.equal(plotted.visible,true);
  assert.ok(plotted.marks.some(m=>m.key==='PUBLISHED'));
  assert.ok(plotted.marks.some(m=>m.key==='CONFIRMED'));
  assert.equal(mapScenarioToViewport(mapped.scenarios[0],cs,{
   interval:tf==='15m'?'4h':'15m'}).visible,false);
  const ongoing=structuredClone(cs);ongoing[1].closed=false;
  assert.ok(!mapScenarioToViewport(mapped.scenarios[0],ongoing,{
   interval:tf}).marks.some(m=>m.key==='CONFIRMED'));
 }
 const chart=await import('node:fs');
 const source=chart.readFileSync(new URL('./candle-chart.mjs',import.meta.url),'utf8');
 const app=chart.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("this.scenarios.filter(sc=>sc.sourceInterval===this.interval)"));
 assert.ok(app.includes('getMobileAssetResearchForecasts(asset,75)'));
 assert.ok(app.includes('interval:candleInterval'));
});
test('legacy H1 map remains exclusively on H1, even when M15/H4 selected',()=>{
 const prior=scenario();
 const h1=buildScenarioMap([prior],{asset:'BTCUSDT',interval:'1h',now});
 const m15=buildScenarioMap([prior],{asset:'BTCUSDT',interval:'15m',now});
 assert.equal(h1.available,1);
 assert.equal(m15.available,0);
});
