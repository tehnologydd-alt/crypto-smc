import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleScenarioSide,marketOverviewSnapshot}
 from './clean-intelligence.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('direction filter only selects actual published LONG/SHORT side',()=>{
 assert.equal(visibleScenarioSide('LONG','LONG'),true);
 assert.equal(visibleScenarioSide('LONG','SHORT'),false);
 assert.equal(visibleScenarioSide('SHORT','LONG'),false);
 assert.equal(visibleScenarioSide('UNKNOWN','LONG'),false);
 assert.equal(visibleScenarioSide('UNKNOWN','ALL'),true);
 assert.equal(visibleScenarioSide('SHORT','ALL'),true);
});

test('source-backed cards expose original side, not assumed trade outcome',()=>{
 const journal=read('./favorite-dashboard.mjs');
 const identity=read('./forecast-card-identity.mjs');
 assert.match(journal,/card\.dataset\.ciSide=recordedForecastSide\(row\)\|\|'UNKNOWN'/);
 assert.match(identity,/export function recordedForecastSide\(row\)/);
 assert.ok(!journal.includes("'Убрать из журнала'"));
 assert.match(journal,/persistSelected\(\)/);
});

test('radar density keeps real candle time, source and unchanged details',()=>{
 const source=read('./radar-dashboard.mjs');
 const view=read('./clean-intelligence.mjs');
 assert.match(source,/card\.dataset\.symbol=row\.symbol/);
 assert.match(source,/card\.dataset\.interval=interval/);
 assert.match(source,/card\.dataset\.candleAt=String\(row\.analysis\.lastClosedAt\|\|0\)/);
 assert.match(source,/card\.dataset\.changeState=String\(row\.change\?\.state\|\|'UNKNOWN'\)/);
 assert.match(view,/attachAssetLogo\(coin,symbol,base\.slice\(0,1\)\)/);
 assert.match(view,/card\.dataset\.changeState==='CHANGED'/);
 assert.match(view,/now-closedAt>2\*step\+60000/);
 assert.match(view,/refreshRadarAge\(card\)/);
 assert.match(view,/document\.addEventListener\('visibilitychange'/);
 assert.match(view,/details\.append\(node\)/);
 assert.match(view,/card\.insertBefore\(details,open\)/);
 assert.match(view,/После|Свеча|Архив/);
});

test('carousel navigation uses actual favorites and keeps existing swipe removal',()=>{
 const view=read('./clean-intelligence.mjs');
 const dashboard=read('./favorite-dashboard.mjs');
 assert.match(view,/list\.map\(x=>x\.dataset\.symbol\)\.join\('\|'\)/);
 assert.match(view,/rail\.scrollTo\(\{left:target\.offsetLeft-rail\.offsetLeft/);
 assert.match(view,/new MutationObserver\(update\)\.observe\(rail,\{childList:true\}\)/);
 assert.match(dashboard,/enableSwipeRemoval\(wrapper,symbol\)/);
 assert.match(dashboard,/rail\.scrollLeft=previousScrollLeft/);
});

test('asset hero moves above advanced navigation without relocating chart Canvas',()=>{
 const view=read('./clean-intelligence.mjs');
 const index=read('./index.html');
 assert.match(view,/strip\.before\(hero\)/);
 assert.match(view,/strip\.after\(workspace\)/);
 assert.ok(index.includes('id="candle-canvas"'));
 assert.ok(index.includes('id="chart-ob-toggle"'));
 assert.ok(index.includes('id="chart-whale-toggle"'));
 assert.ok(!view.includes('getMobileCandles('));
});

test('Concept 1 phase 2 remains responsive and never fabricates market metrics',()=>{
 const css=read('./clean-intelligence.css');
 const layout=read('./clean-intelligence.mjs');
 const snap=marketOverviewSnapshot({state:'INVALID',change:'+100%',
  dominance:'100%',mood:'—',value:'—'});
 assert.equal(snap.change,'—');
 assert.equal(snap.dominance,'—');
 assert.match(css,/\.ci-favorite-pagination/);
 assert.match(css,/#research-forecast-list>\[data-ci-side\]\[hidden\]/);
 assert.match(css,/#view-asset>\.hero/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(layout,/new MutationObserver\(apply\)\.observe\(list,\{childList:true,subtree:true\}\)/);
 assert.ok(!layout.includes('setMobileSettings('));
 assert.ok(!layout.includes('getMobileResearchForecasts('));
});
