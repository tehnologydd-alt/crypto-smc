import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const native=new URL('../native/src/main/java/com/apexintelligence/research/',import.meta.url);
const auto=readFileSync(new URL('ApexAutoForecast.kt',native),'utf8');
const dao=readFileSync(new URL('ApexDatabase.kt',native),'utf8');
const ui=readFileSync(new URL('../../apex9-preview/favorite-dashboard.mjs',import.meta.url),'utf8');
const page=readFileSync(new URL('../../apex9-preview/forecast-directional-card.mjs',import.meta.url),'utf8');

test('Room keeps the original journal and queries V1/V2 individually',()=>{
 assert.ok(dao.includes("latestLegacyRangeForecast(asset: String)"));
 assert.ok(dao.includes("latestDirectionalForecast(asset: String)"));
 assert.ok(dao.includes("id LIKE 'range1:%'"));
 assert.ok(dao.includes("id LIKE 'direction2:%'"));
 assert.ok(dao.includes('suspend fun latestResearchForecast(asset: String)'));
 assert.ok(dao.includes('version = 4'));
});
test('V1 range can update but never prevent first V2 creation',()=>{
 assert.ok(auto.includes('val legacy = dao.latestLegacyRangeForecast(asset)'));
 assert.ok(auto.includes('progress(legacy, dao, now)'));
 assert.ok(auto.includes('val latest = dao.latestDirectionalForecast(asset)'));
 const legacyStart=auto.indexOf('val legacy = dao.latestLegacyRangeForecast(asset)');
 const v2Start=auto.indexOf('val latest = dao.latestDirectionalForecast(asset)',legacyStart);
 const legacyPart=auto.slice(legacyStart,v2Start);
 assert.ok(!legacyPart.includes('return Report(asset, "UPDATED"'),
  'Old range completion must not gate V2 candidates');
 assert.ok(!legacyPart.includes('return Report(asset, "ALREADY_EXISTS"'));
 assert.ok(auto.includes('val direction = ApexDirectionalForecast.direction(recent, width)'));
 assert.ok(auto.includes('NO_CLEAR_DIRECTION'));
 assert.ok(auto.includes('val id="direction2:$asset:1h:$anchor"'));
 assert.ok(auto.includes('ApexDirectionalForecast.build(close,low,high,direction)'));
});
test('one V2 at a time still uses its immutable H1 lifecycle',()=>{
 const directional=auto.indexOf('val latest = dao.latestDirectionalForecast(asset)');
 const old=auto.indexOf('val legacy = dao.latestLegacyRangeForecast(asset)');
 assert.ok(directional>old);
 const newOnly=auto.slice(directional,auto.indexOf('// A new candidate',directional));
 assert.ok(newOnly.includes('ApexDirectionalForecast.progress(latest, dao, now)'));
 assert.ok(newOnly.includes('if (stage != "COMPLETED")'));
 assert.ok(newOnly.includes('return Report(asset, "UPDATED"'));
});
test('old range studies do not occupy the visible forecast list by default',()=>{
 assert.ok(ui.includes('const directed=visible.filter(row=>Boolean(directionalHypothesis(row)))'));
 assert.ok(ui.includes('const legacy=visible.filter(row=>!directionalHypothesis(row))'));
 assert.ok(ui.includes("const archive=create('details','forecast-range-archive')"));
 assert.ok(ui.includes("for(const row of directed)box.append(renderCard(row))"));
 assert.ok(ui.includes("for(const row of legacy)archive.append(renderCard(row))"));
 assert.ok(ui.includes('NO_CLEAR_DIRECTION'));
 assert.ok(page.includes('Старая гипотеза не содержала единого направления'));
 assert.ok(page.includes('planDirectionalScenario(row'));
 assert.ok(page.includes('TP1'));
 assert.ok(page.includes('TP3'));
 assert.ok(page.includes("terminalStates.has(row.evaluation?.outcome)"));
});

test('forecast alert delivery listens ONLY to immutable closed-M5 stages',()=>{
 const notifier=readFileSync(new URL('ApexForecastNotifier.kt',native),'utf8');
 assert.ok(notifier.includes('LIMIT_READY'));
 for(const stage of ['TP1','TP2','TP3','SL'])
  assert.ok(notifier.includes('"'+stage+'"'));
 assert.ok(notifier.includes('ApexM5Evaluation.INTERVAL'));
 assert.ok(notifier.includes('stage.observedAt < settings.alertsEnabledAt'));
 assert.ok(notifier.includes('ledger.getBoolean(key, false)'));
 assert.ok(notifier.includes('notificationPermission')||
  notifier.includes('POST_NOTIFICATIONS'));
 assert.ok(auto.includes('ApexForecastNotifier.dispatch(context, unique, dao)'));
});
