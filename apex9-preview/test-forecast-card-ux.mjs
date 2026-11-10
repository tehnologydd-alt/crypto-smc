import test from 'node:test';
import assert from 'node:assert/strict';
import {displayPair,priceText,stagePresentation,observedLevelSummary,scenarioCopyText} from './forecast-card-ux.mjs';
import {readFileSync} from 'node:fs';
const favorites=readFileSync(new URL('./favorite-dashboard.mjs',import.meta.url),'utf8');
const packager=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');

test('pair and price labels are readable and do not expose binary float tails',()=>{
 assert.equal(displayPair('XRPUSDT'),'XRP/USDT');
 assert.equal(priceText(1.05044999999999999),'1.05045');
 assert.equal(priceText(2206.28),'2206.28');
 assert.equal(priceText(-1),'—');
 assert.equal(priceText(0.0000000123),'0.0000000123');
});
test('research phase never implies an executed entry or achieved profit',()=>{
 const published=stagePresentation({state:'PENDING_CONFIRMATION',
  steps:[{observed:true}]});
 assert.equal(published.name,'Опубликован');
 assert.equal(published.observed,1);
 const active=stagePresentation({state:'ACTIVE',
  steps:[{observed:true},{observed:true},{observed:true}]});
 assert.equal(active.name,'Наблюдение идёт');
 const due=stagePresentation({state:'DUE_UNVERIFIED'});
 assert.equal(due.tone,'warning');
 assert.notEqual(due.name,'Итог проверен');
 const complete=stagePresentation({state:'EVALUATED'});
 assert.equal(complete.name,'Итог проверен');
});
test('ambiguous same-hour TP and SL is not assigned a known sequence',()=>{
 const mixed=observedLevelSummary({
  state:'SAME_H1_UNKNOWN',found:{tp1:{bar:2},sl:{bar:2}}
 });
 assert.equal(mixed.ambiguous,true);
 assert.deepEqual(mixed.hitKeys,['tp1','sl']);
 assert.match(mixed.label,/не определён/);
 const before=observedLevelSummary({state:'PUBLICATION_HOUR_UNKNOWN',
  found:{tp1:{bar:1}}});
 assert.equal(before.ambiguous,true);
 const safe=observedLevelSummary({state:'TP1_FIRST',
  found:{tp1:{bar:2}}});
 assert.equal(safe.ambiguous,false);
});
test('copying a conditionally selected research side preserves provenance',()=>{
 const plan={
  origin:'RETROSPECTIVE',entry:1.174,
  UP:{sl:1.15,tp1:1.18,tp2:1.20,tp3:1.23},
  DOWN:{sl:1.24,tp1:1.1034,tp2:1.05,tp3:0.99}
 };
 const copy=scenarioCopyText({asset:'XRPUSDT'},plan,'DOWN');
 assert.match(copy,/XRP\/USDT · H1 · Условно вниз/);
 assert.match(copy,/восстановлены задним числом/);
 assert.match(copy,/TP1: 1.1034/);
 assert.match(copy,/Не подтверждённый вход и не биржевой ордер/);
 assert.equal(scenarioCopyText({asset:'XRPUSDT'},plan,'INVALID'),'');
});
test('visual card uses the real tracked ID set and only original Room H1',()=>{
 assert.ok(favorites.includes("tracked?'")||favorites.includes("tracked?\n"));
 assert.ok(favorites.includes('onToggle?.(row.id)'));
 // One render pass now updates the Marked journal, its badges and quality
 // statistics together; calling renderStats beforehand showed stale totals.
 assert.ok(favorites.includes('persistSelected();'));
 assert.ok(favorites.includes("if(journalMode==='tracked')void loadMarkedRows({force:true})"));
 assert.ok(favorites.includes('else renderRows();'));
 assert.ok(favorites.includes('renderStats();'));
 assert.ok(favorites.includes('scenarioJournalState(lastRows,'));
 assert.ok(favorites.includes('details.append(renderLevelSequence(row))'));
 assert.ok(favorites.includes('analyzeResearchLevelSequence(plan,archive.candles'));
 assert.ok(favorites.includes('if(!archive.native||archive.error||!archive.complete)'));
 assert.ok(favorites.includes('forecast-copy-all'));
 assert.ok(!favorites.includes('demoOrders'));
 assert.ok(packager.includes("'forecast-card-ux.mjs'"));
});
