import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const native = path => readFileSync(new URL(
 '../apex9-android/native/src/main/java/com/apexintelligence/research/'+path,
 import.meta.url), 'utf8');
const notifier=native('ApexForecastNotifier.kt');
const background=native('ApexSyncWorker.kt');
const plugin=native('ApexNativePlugin.kt');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');

test('notifier accepts new H1 M1 and archived H1 M5 without relabeling history',()=>{
 assert.match(notifier,/ApexM1Evaluation.INTERVAL/);
 assert.match(notifier,/ApexM5Evaluation.INTERVAL/);
 assert.match(notifier,/ApexM1Evaluation.METHOD/);
 assert.match(notifier,/ApexM5Evaluation.METHOD/);
 assert.match(notifier,/LIMIT_READY_M1_V1/);
 assert.match(notifier,/LIMIT_READY_M5_V1/);
 assert.match(notifier,/direction2:/);
 assert.match(notifier,/val frame = observationFrame\(forecast\) \?: continue/);
 assert.match(notifier,/Закрытая " \+ frame/);
 assert.doesNotMatch(notifier,/forecast\.id\.startsWith\("direction2:"\)\) continue/);
});
test('multi-frame M15/H4 M1 and existing M5 stages can trigger notifications',()=>{
 assert.match(notifier,/direction3:/);
 assert.match(notifier,/forecast\.horizon in setOf\("15m", "4h"\)/);
 assert.match(notifier,/ApexMultiFrameForecast.M1_SEMANTICS/);
 assert.match(notifier,/ApexMultiFrameForecast.M5_SEMANTICS/);
 assert.ok(background.indexOf('ApexMultiFrameForecast.syncAll(') <
  background.lastIndexOf('ApexForecastNotifier.dispatch('));
 assert.ok(plugin.indexOf('val multi = ApexMultiFrameForecast.syncAll(') <
  plugin.lastIndexOf('ApexForecastNotifier.dispatch('));
});
test('no extra or future event alerts, preserve delivery ledger and permission',()=>{
 for(const x of ['stage.recordedAt < settings.alertsEnabledAt',
  'stage.observedAt < settings.alertsEnabledAt',
  'stage.observedAt < forecast.publishedAt',
  'stage.recordedAt < stage.observedAt',
  'stage.observedAt > now + 60_000L',
  'now - stage.observedAt > MAX_AGE',
  'ledger.edit().putBoolean(key, true).commit()',
  'POST_NOTIFICATIONS'])
  assert.ok(notifier.includes(x),x);
 assert.match(notifier,/setOf\("LIMIT_READY", "TP1", "TP2", "TP3", "SL"\)/);
});
test('user settings and explanation state M1 with historical M5 exception',()=>{
 assert.match(html,/Новые прогнозы — по закрытым M1; архивные M5 — по M5/);
 assert.match(html,/После первой полностью закрытой M1/);
 assert.match(app,/Новые M1-события отслеживаются; архивные M5 сохраняются/);
});
