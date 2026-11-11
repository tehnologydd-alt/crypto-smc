import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const chart=read('./candle-chart.mjs');
const app=read('./app.mjs');
const html=read('./index.html');

test('chart leaves whale and historical order-block overlays intact',()=>{
 assert.match(chart,/if\(this\.showBlocks\)/);
 assert.match(chart,/mapOrderBlocksToViewport\(this\.orderBlocks,bars/);
 assert.match(chart,/if\(this\.showWhales/);
 assert.match(chart,/mapWhaleEventsToViewport/);
});
test('scenario chart lines are opt-in and never paint filled risk reward bands',()=>{
 assert.match(chart,/if\(!sc\.focused\)continue/);
 assert.doesNotMatch(chart,/ctx\.fillStyle=sc\.focused\?'rgba\(95,229,220/);
 assert.match(chart,/if\(sc\.focused&&sc\.levels\)/);
 for(const level of ['SL','Вход','TP1','TP2','TP3'])
  assert.ok(chart.includes("'"+level+"'"));
 assert.match(chart,/geometry\.segments/);
});
test('selecting the active card again hides levels and no first item is auto-selected',()=>{
 assert.match(app,/focusedScenarioId=focusedScenarioId===sc\.id\?null:sc\.id/);
 assert.match(app,/map\.scenarios\.filter\(sc=>sc\.id===focusedScenarioId\)/);
 assert.doesNotMatch(app,/map\.scenarios\[0\]\.focused=true/);
 assert.match(app,/button\.setAttribute\('aria-pressed',sc\.focused\?'true':'false'\)/);
 assert.match(app,/focusedScenarioId=null;replayScenarioId=null;replayStep=0/);
 assert.match(app,/const selected=scenarios\.find\(s=>s\.id===focusedScenarioId\);/);
});
test('selected scenario details describe price distances and risk/reward honestly',()=>{
 assert.match(app,/function scenarioLevelSummary\(levels\)/);
 assert.match(app,/Math\.abs\(\(price-entry\)\/entry\)\*100/);
 assert.match(app,/Math\.abs\(price-entry\)\/risk/);
 assert.match(html,/Повторное нажатие скрывает их/);
});
