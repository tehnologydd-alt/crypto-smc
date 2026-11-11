import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleChartScenarios,compactScenarioDetails,
 groupOrderBlockLabels,CLEAN_CHART_VERSION}
 from './clean-chart-scenarios.mjs';
const scenario=(id,sourceInterval='1h',side='UP')=>({
 id,model:'DIRECTIONAL',asset:'BTCUSDT',sourceInterval,
 evaluationInterval:'1m',side,
 stage:'ACTIVE',publishedAt:Date.UTC(2026,10,11),
 anchorCloseAt:Date.UTC(2026,10,10),targetCloseAt:Date.UTC(2026,10,12),
 bandLow:90,bandHigh:115,
 levels:{entry:100,sl:95,tp1:102,tp2:105,tp3:110},
 focused:true
});
test('default Clean Chart is empty: never show first or all stored scenarios',()=>{
 const scenarios=[scenario('a'),scenario('b')];
 assert.equal(CLEAN_CHART_VERSION,'APEX_CLEAN_CHART_SELECTED_V1');
 assert.deepEqual(visibleChartScenarios(scenarios,{
  selectedId:null,interval:'1h'}),[]);
 assert.deepEqual(visibleChartScenarios(scenarios,{
  selectedId:'',interval:'1h'}),[]);
 assert.deepEqual(visibleChartScenarios(scenarios,{
  selectedId:'missing',interval:'1h'}),[]);
 const selected=visibleChartScenarios(scenarios,{
  selectedId:'b',interval:'1h'});
 assert.equal(selected.length,1);
 assert.equal(selected[0].id,'b');
 assert.equal(selected[0].focused,true);
 assert.equal(scenarios[0].focused,true); // immutable original untouched
});
test('one selected scenario never leaks to a different timeframe',()=>{
 const rows=[scenario('h1'),scenario('h4','4h')];
 assert.deepEqual(visibleChartScenarios(rows,{
  selectedId:'h1',interval:'4h'}),[]);
 assert.deepEqual(visibleChartScenarios(rows,{
  selectedId:'h4',interval:'1h'}),[]);
 assert.deepEqual(visibleChartScenarios(rows,{
  selectedId:'h4',interval:'4h'}).map(x=>x.id),['h4']);
 assert.deepEqual(visibleChartScenarios(rows,{
  selectedId:'h1',interval:'1d'}),[]);
});
test('compact original E/SL/T1-T3 and R:R do not mutate researched levels',()=>{
 const sc=scenario('a'),before=structuredClone(sc);
 const result=compactScenarioDetails(sc);
 assert.equal(result.kind,'LEVELS');
 assert.deepEqual(result.rows,[['E',100],['SL',95],
  ['T1',102],['T2',105],['T3',110]]);
 assert.deepEqual(result.riskReward,[0.4,1,2]);
 assert.deepEqual(sc,before);
 const finished=compactScenarioDetails({...sc,stage:'EVALUATED'});
 assert.equal(finished.finished,true);
 const down=compactScenarioDetails({...sc,side:'DOWN',
  levels:{entry:100,sl:105,tp1:98,tp2:95,tp3:90}});
 assert.deepEqual(down.riskReward,[0.4,1,2]);
});
test('levels cannot invent valid RR for bad orientation; range stays a range',()=>{
 const sc=scenario('a');
 assert.equal(compactScenarioDetails({...sc,side:'DOWN'}).riskReward,null);
 assert.equal(compactScenarioDetails({...sc,levels:undefined}).kind,'RANGE');
 assert.equal(compactScenarioDetails(null),null);
 assert.equal(compactScenarioDetails({...sc,levels:{...sc.levels,
  tp1:NaN}}),null);
});
test('OB captions grouped by kind and proximity, not repeated on every segment',()=>{
 const captions=groupOrderBlockLabels([
  {kind:'DEMAND',y:145,x:15},{kind:'DEMAND',y:150,x:38},
  {kind:'SUPPLY',y:149,x:40},{kind:'DEMAND',y:101,x:90},
  {kind:'UNKNOWN',y:135,x:5}
 ]);
 assert.equal(captions.length,3);
 assert.deepEqual(captions[0],{kind:'DEMAND',y:145,x:15,count:2});
 assert.deepEqual(captions[1],{kind:'SUPPLY',y:149,x:40,count:1});
});
test('Android chart hides all scenario levels without explicit selected ID',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const app=read('./app.mjs'),chart=read('./candle-chart.mjs');
 const html=read('./index.html'),pack=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(app.includes('visibleChartScenarios(map.scenarios,'));
 assert.ok(app.includes('selectedId:focusedScenarioId'));
 assert.ok(app.includes('const deselect=focusedScenarioId===sc.id'));
 assert.ok(app.includes('focusedScenarioId=deselect?null:sc.id'));
 assert.ok(app.includes("el('chart-scenario-hide').addEventListener('click'"));
 assert.ok(app.includes('renderCleanChartDetails(focus)'));
 assert.ok(app.includes('focusedScenarioId=null;replayScenarioId=null;replayStep=0;'));
 assert.ok(app.includes('const selected=scenarios.find(s=>s.id===focusedScenarioId)||null;'));
 assert.equal(app.includes('map.scenarios[0].focused=true'),false);
 assert.ok(chart.includes('x?.focused===true'));
 assert.ok(chart.includes(').slice(0,1):[];'));
 assert.ok(chart.includes("['E',sc.levels.entry"));
 assert.ok(chart.includes('groupOrderBlockLabels(labelCandidates)'));
 assert.ok(chart.includes("fillStyle='rgba(236,192,116,.08)'"));
 assert.ok(html.includes('id="chart-scenario-details"'));
 assert.ok(html.includes('id="chart-scenario-hide"'));
 assert.ok(pack.includes("'clean-chart-scenarios.mjs'"));
 assert.equal(read('./clean-chart-scenarios.mjs').includes('fetch('),false);
 assert.equal(read('./clean-chart-scenarios.mjs').includes('setInterval('),false);
});
