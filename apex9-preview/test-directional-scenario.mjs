import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReferenceLevels} from './research-level-sequence.mjs';
import {DIRECTIONAL_MODEL,DIRECTIONAL_LEVEL_VERSION,DIRECTIONAL_HOURS,
 planDirectionalScenario,auditDirectionalScenario,
 directionalOutcomeLabel} from './directional-scenario.mjs';
import {journalObservedStats} from './journal-stats.mjs';

const H=3600000;
const anchor=1800003599999;
const publishedAt=anchor+1000;
const date=anchor+6*H+60000;
const source=(direction='UP')=>{
 const levels=computeReferenceLevels(100,94,106);
 const fixed={version:DIRECTIONAL_LEVEL_VERSION,direction,entry:100,
  ...levels[direction]};
 return {
  id:'direction2:BTCUSDT:1h:'+anchor,asset:'BTCUSDT',interval:'1h',
  status:'PENDING_CONFIRMATION',publishedAt,
  hypothesis:JSON.stringify({
   model:DIRECTIONAL_MODEL,decisionMethod:'SIX_BAR_EFFICIENCY_V1',
   direction,anchorCloseAt:anchor,targetCloseAt:anchor+24*H,
   horizonBars:24,anchorClose:100,bandLow:94,bandHigh:106,levelStudy:fixed
  })
 };
};
const bar=(i,{open=100,low=99.9,high=100.1,close=100}={})=>({
 t:anchor+(i-1)*H+1,closeAt:anchor+i*H,
 open,high,low,close,volume:1,closed:true
});
const fixture=(rows)=>[bar(0),...rows];
// First H1 candle after publication spans the publication moment and is
// never used as evidence for entry or level outcomes.
const base=()=>[bar(1),bar(2,{high:100.2,low:99.9})];
test('native V2 publication must commit ONE original side and aligned levels',()=>{
 const row=source();
 const result=planDirectionalScenario(row,{now:publishedAt+10*H});
 assert.equal(result.state,'READY');
 assert.equal(result.plan.side,'UP');
 assert.equal(result.plan.tp1,102);
 assert.equal(result.plan.tp2,104);
 assert.equal(result.plan.tp3,106);
 assert.equal(result.plan.sl,98);
 assert.equal(result.plan.targetCloseAt,anchor+24*H);
 const tampered={...row,hypothesis:JSON.stringify({
  ...JSON.parse(row.hypothesis),levelStudy:{...JSON.parse(row.hypothesis).levelStudy,tp1:102.5}
 })};
 assert.equal(planDirectionalScenario(tampered,{now:publishedAt+10*H}).state,'INVALID');
 const legacy={...row,id:'range1:BTCUSDT:1h:'+anchor,
  hypothesis:JSON.stringify({model:'EMPIRICAL_CLOSE_RANGE_V1'})};
 assert.equal(planDirectionalScenario(legacy,{now:publishedAt+10*H}).state,'LEGACY');
 assert.equal(DIRECTIONAL_HOURS,24);
});
test('no entry means no TP credit even when a later bar touches TP',()=>{
 const plan=planDirectionalScenario(source(),{now:date}).plan;
 const candles=fixture([bar(1,{open:101,high:105,low:100.5,close:102}),
  bar(2,{open:102,high:105,low:101,close:103}),bar(3,{open:102,high:103,low:101,close:102})]);
 const result=auditDirectionalScenario(plan,candles,{now:anchor+3*H+60000});
 assert.equal(result.entryAt,null);
 assert.equal(result.hits.length,0);
 assert.equal(result.outcome,'OPEN');
});
test('TP1, TP2 and TP3 are counted in chronological order after entry',()=>{
 const plan=planDirectionalScenario(source(),{now:date}).plan;
 const candles=fixture([...base(),bar(3,{high:102.3,low:100,close:101}),
  bar(4,{high:104.5,low:101,close:103}),
  bar(5,{high:106.2,low:103,close:105})]);
 const result=auditDirectionalScenario(plan,candles,{now:anchor+5*H+10000});
 assert.equal(result.outcome,'TP3');
 assert.equal(result.state,'COMPLETED');
 assert.equal(result.entryAt,anchor+2*H);
 assert.deepEqual(result.hits.map(x=>x.key),['tp1','tp2','tp3']);
 assert.equal(result.terminalAt,anchor+5*H);
});
test('protective first => STOP; SL plus new TP on same H1 => unknown order',()=>{
 const plan=planDirectionalScenario(source(),{now:date}).plan;
 const stop=auditDirectionalScenario(plan,fixture([...base(),
  bar(3,{high:101,low:97.7,close:99})]),{now:anchor+3*H+10000});
 assert.equal(stop.outcome,'STOP');
 assert.deepEqual(stop.hits,[]);
 const unclear=auditDirectionalScenario(plan,fixture([...base(),
  bar(3,{high:103,low:97.9,close:101})]),{now:anchor+3*H+10000});
 assert.equal(unclear.outcome,'AMBIGUOUS');
 assert.equal(unclear.hits.length,0);
 assert.match(unclear.reason,/одной H1/);
});
test('entry and TP inside one H1 must not become a claimed win',()=>{
 const plan=planDirectionalScenario(source(),{now:date}).plan;
 const result=auditDirectionalScenario(plan,fixture([
  bar(1),bar(2,{high:104.2,low:99.8,close:103})
 ]),{now:anchor+2*H+10000});
 assert.equal(result.outcome,'AMBIGUOUS');
 assert.equal(result.hits.length,0);
});
test('single downside has correct TP/SL orientation and no UP alternative',()=>{
 const plan=planDirectionalScenario(source('DOWN'),{now:date}).plan;
 assert.equal(plan.side,'DOWN');
 assert.equal(plan.tp1,98);
 assert.equal(plan.tp2,96);
 assert.equal(plan.tp3,94);
 assert.equal(plan.sl,102);
 const r=auditDirectionalScenario(plan,fixture([
  bar(1),bar(2,{high:100.2,low:99.9}),bar(3,{high:100,low:93,close:97})
 ]),{now:anchor+3*H+1000});
 assert.equal(r.outcome,'TP3');
 assert.equal(r.hits.length,3);
});
test('missing source candle => unverified, never success',()=>{
 const plan=planDirectionalScenario(source(),{now:date}).plan;
 const result=auditDirectionalScenario(plan,[bar(0),bar(1),bar(3)],
  {now:anchor+3*H+10000});
 assert.equal(result.state,'NEEDS_DATA');
 assert.equal(result.hits.length,0);
});
test('legacy stats and directional TP3/STOP are separate categories',()=>{
 const tp=source();tp.status='COMPLETED';tp.evaluation={
  outcome:'TP3',evaluatedAt:anchor+5*H+10000,
  targetCloseAt:anchor+24*H,actualClose:105
 };
 const sl=source('DOWN');sl.id=sl.id.replace('BTCUSDT','ETHUSDT');
 sl.asset='ETHUSDT';
 sl.id='tampered:'+sl.id; // immutable ID binding must be checked
 // A valid record is required for statistics; corrupted IDs cannot count.
 const stats=journalObservedStats([tp,sl],{now:anchor+26*H});
 assert.equal(stats.all.directional.tp3,1);
 assert.equal(stats.all.directional.published,1);
 assert.equal(stats.all.inconsistent,1);
 assert.equal(stats.all.within,0);
});
test('new cards are single-sided and completed cards grey by CSS',()=>{
 const ui=readFileSync(new URL('./forecast-directional-card.mjs',import.meta.url),'utf8');
 const favorites=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.ok(ui.includes('planDirectionalScenario(row'));
 assert.ok(ui.includes('auditDirectionalScenario(plan,archive.candles'));
 assert.ok(ui.includes("card.classList.toggle('is-completed'"));
 assert.ok(favorites.includes('return directionalForecastCard(row,'));
 assert.ok(favorites.includes('return legacyRangeCard(row,'));
 assert.ok(css.includes('.forecast-visual.is-completed'));
 assert.match(directionalOutcomeLabel('AMBIGUOUS'),/не установлен/);
});
