import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dashboardPulseSnapshot,scenarioTaskStage}
 from './clean-intelligence-major.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('command center reflects existing Room observations, never HTML 0 defaults',()=>{
 const init=dashboardPulseSnapshot({
  roomReady:false,active:'0',limit:'0',radarReady:false,
  radarChanges:'0 актуальных изменений',favoriteCount:'0 / 10'
 });
 assert.equal(init.active,'—');
 assert.equal(init.limit,'—');
 assert.equal(init.radar,'—');
 assert.match(init.note,/ещё не получен/);
 const ready=dashboardPulseSnapshot({
  roomReady:true,active:'3',limit:'2',radarReady:true,
  radarChanges:'4 актуальных изменения',favoriteCount:'7 / 10',
  sources:'Binance / OKX · проверены'
 });
 assert.deepEqual([ready.active,ready.limit,ready.radar],['3','2','4']);
 assert.equal(ready.favoriteCount,'7 / 10');
 assert.equal(ready.source,'Binance / OKX · проверены');
 assert.match(ready.note,/Room/);
 const bad=dashboardPulseSnapshot({
  roomReady:true,active:'загружаем',limit:'—',radarReady:true,
  radarChanges:'ожидаем'
 });
 assert.equal(bad.active,'—');
 assert.equal(bad.limit,'—');
 assert.equal(bad.radar,'—');
});

test('scenario stage actions preserve real published task ids',()=>{
 for(const stage of ['PENDING_CONFIRMATION','CONFIRMED','ACTIVE','COMPLETED'])
  assert.equal(scenarioTaskStage(stage),stage);
 assert.equal(scenarioTaskStage('CANCELLED'),null);
 assert.equal(scenarioTaskStage(''),null);
});

test('new command center navigates via original app handlers, not custom forecast logic',()=>{
 const major=read('./clean-intelligence-major.mjs');
 const app=read('./app.mjs');
 const html=read('./index.html');
 assert.match(app,/initCleanIntelligenceMajor\(\)/);
 assert.match(app,/import \{initCleanIntelligenceMajor\} from '.\/clean-intelligence-major.mjs'/);
 assert.match(major,/existingButton\('\[data-tab="forecasts"\]'\)/);
 assert.match(major,/existingButton\('\[data-journal-stage="ACTIVE"\]'\)/);
 assert.match(major,/existingButton\('\[data-radar-filter="events"\]'\)/);
 assert.match(major,/existingButton\('\[data-tab="quality"\]'\)/);
 assert.match(major,/createScreenUpdateCoordinator\(root,render\)/);
 for(const id of ['ci6-command-center','ci6-pulse-active','ci6-pulse-limit',
  'ci6-pulse-radar','ci6-stage-board','ci6-radar-workspace'])
  assert.ok(major.includes(id),id);
 for(const id of ['forecast-pending-count','stage-count-ACTIVE',
  'stage-count-CONFIRMED','radar-coverage','radar-change-count',
  'top-status','favorites-count'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(!major.includes('getMobileResearchForecasts('));
 assert.ok(!major.includes('fetch('));
 assert.ok(!major.includes('getMobileCandles('));
});

test('major redesign reorganizes existing stage and radar controls, no duplicate listeners',()=>{
 const major=read('./clean-intelligence-major.mjs');
 const html=read('./index.html');
 const source=read('./radar-dashboard.mjs');
 assert.match(major,/board.append\(stages\)/);
 assert.match(major,/workspace.before\(intro,board\)/);
 assert.match(major,/advanced.append\(whales\)/);
 assert.match(major,/workspace.append\(advanced\)/);
 assert.match(major,/top.append\(counters,status\)/);
 assert.match(major,/quick.append\(el\('h3','','Наблюдения'\),filters\)/);
 assert.match(major,/details.append\(frames,sort\)/);
 assert.match(major,/controls.remove\(\)/);
 assert.ok(html.includes('data-radar-filter="events"'));
 assert.ok(html.includes('data-radar-frame="1h"'));
 assert.match(source,/document.querySelectorAll\('\[data-radar-frame\]'\)/);
 assert.match(source,/document.querySelectorAll\('\[data-radar-filter\]'\)/);
 assert.ok(!major.includes("addEventListener('change'"));
});

test('Android includes every major design asset in the verified module graph',()=>{
 const index=read('./index.html');
 const prepare=read('../apex9-android/scripts/prepare-web.mjs');
 const css=read('./clean-intelligence-major.css');
 assert.ok(index.includes('./clean-intelligence-major.css'));
 assert.ok(prepare.includes("'clean-intelligence-major.css'"));
 assert.ok(prepare.includes("'clean-intelligence-major.mjs'"));
 assert.ok(css.includes('#view-overview>.ci6-welcome'));
 assert.ok(css.includes('#view-forecasts .ci6-stage-board .forecast-compact-stages'));
 assert.ok(css.includes('#view-radar .ci6-radar-dashboard'));
 assert.ok(css.includes('@media(max-width:380px)'));
 assert.ok(css.includes('prefers-reduced-motion'));
});
