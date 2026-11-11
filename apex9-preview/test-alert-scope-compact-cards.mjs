import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAlertMarkedIds} from './mobile-bridge.mjs';
import {compactOpenForecastCard} from './forecast-compact-card.mjs';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const prefs=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexPreferences.kt');
const notifier=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexForecastNotifier.kt');
const plugin=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
const view=read('./index.html'),app=read('./app.mjs');
const dashboard=read('./favorite-dashboard.mjs');
const directional=read('./forecast-directional-card.mjs');
const multiframe=read('./forecast-multiframe.mjs');
const pack=read('../apex9-android/scripts/prepare-web.mjs');

test('notification bookmark IDs use exact immutable forecast IDs, never asset-only stars',()=>{
 const ids=['direction2:BTCUSDT:1h:1762880000000','direction3:ETHUSDT:4h:1762880000000',
  'range1:BTCUSDT:1h:1762880000000','BTCUSDT','direction2:BTCUSDT:1h:1762880000000'];
 assert.deepEqual(normalizeAlertMarkedIds(ids),ids.slice(0,3));
 assert.deepEqual(normalizeAlertMarkedIds(null),[]);
 assert.deepEqual(normalizeAlertMarkedIds(['direction2:BTCUSDT:1h:bad']),[]);
});
test('Android DataStore persists chosen scope and marked ID set for background worker',()=>{
 assert.match(prefs,/forecast_alert_scope_v1/);
 assert.match(prefs,/forecast_marked_alert_ids_v1/);
 assert.match(prefs,/alertScope = if \(prefs\[alertScopeKey\] == "tracked"\)/);
 assert.match(prefs,/prefs\[alertMarkedKey\] = alertMarkedIds\.joinToString/);
 assert.match(notifier,/settings\.alertScope == "tracked"/);
 assert.match(notifier,/forecast\.id !in settings\.alertMarkedIds/);
 assert.match(plugin,/getArray\("alertMarkedIds"\)/);
 assert.match(plugin,/result\.put\("alertScope", settings\.alertScope\)/);
 assert.match(plugin,/result\.put\("alertMarkedCount", settings\.alertMarkedIds\.size\)/);
 assert.match(notifier,/ledger\.edit\(\)\.putBoolean\(key, true\)\.commit\(\)/);
});
test('scope chooser and stars update native atomically without changing Room',()=>{
 assert.match(view,/id="apex-settings-alert-scope"/);
 assert.match(view,/value="all"/);
 assert.match(view,/value="tracked"/);
 assert.match(app,/alertScope:requested,alertMarkedIds:ids/);
 assert.match(dashboard,/setMobileSettings\(\{alertMarkedIds:ids\}\)/);
 assert.match(dashboard,/await syncNativeMarks\(\)/);
 assert.match(view,/Исследования продолжают собирать статистику/);
});
test('all open scenario cards use compact design but completed cards keep previous panels',()=>{
 assert.equal(typeof compactOpenForecastCard,'function');
 assert.throws(()=>compactOpenForecastCard({},{}),/Only verified open scenarios/);
 assert.match(directional,/if\(!finishedRoom&&visibleStage!=='COMPLETED'\)/);
 assert.match(multiframe,/if\(!complete\)\{/);
 assert.match(directional,/renderCompletedResearchPanel\(plan/);
 assert.match(multiframe,/renderCompletedResearchPanel\(plan/);
 assert.match(pack,/'forecast-compact-card\.mjs'/);
 const src=read('./forecast-compact-card.mjs');
 for(const s of ['Все уровни и история','forecast-compact-price-row','forecast-compact-progress',
  'forecast-compact-mark','forecast-compact-open','TP1','TP2','TP3','SL',
  'Касание уровня — наблюдение'])assert.ok(src.includes(s),s);
});
test('M1 directional stages are aligned to M1 close (not H1)',()=>{
 const core=read('./favorite-logic.mjs');
 assert.match(core,/plan\.evaluationInterval==='1m'\?60000/);
 assert.match(core,/plan\.evaluationInterval==='5m'\?300000/);
});
