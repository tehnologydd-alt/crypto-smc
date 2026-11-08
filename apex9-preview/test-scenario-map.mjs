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
 assert.deepEqual(view.marks.map(x=>x.key),['CONFIRMED','ACTIVE']);
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
 assert.equal(mapScenarioToViewport(s,candles(),'4h' in {}?{interval:'4h'}:{interval:'4h'}).visible,false);
 assert.equal(mapScenarioToViewport(s,[]).visible,false);
 assert.equal(buildScenarioMap([{...scenario(),hypothesis:'{}'}],{asset:'BTCUSDT',now}).state,'EMPTY');
});
