import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketOverviewSnapshot} from './clean-intelligence.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('market summary uses observed public values, never example prices',()=>{
 const real=marketOverviewSnapshot({
  state:'OK',change:'+1,72%',dominance:'57,81%',
  mood:'Страх',value:'25'
 });
 assert.equal(real.change,'+1,72%');
 assert.equal(real.dominance,'57,81%');
 assert.equal(real.sentiment,'Страх · 25');
 assert.equal(real.trend,'positive');
 const negative=marketOverviewSnapshot({state:'OK',change:'−2,5%'});
 assert.equal(negative.trend,'negative');
});
test('failed market observations cannot appear as current values',()=>{
 const failed=marketOverviewSnapshot({
  state:'INVALID',change:'+9%',dominance:'59%',mood:'—',value:'—'
 });
 assert.equal(failed.change,'—');
 assert.equal(failed.dominance,'—');
 assert.equal(failed.sentiment,'—');
 assert.equal(failed.trend,'unknown');
});
test('cached figures remain visible but explicitly stale',()=>{
 const stale=marketOverviewSnapshot({
  state:'STALE',change:'+0,8%',dominance:'52,4%',mood:'Страх',value:'29'
 });
 assert.equal(stale.change,'+0,8%');
 assert.equal(stale.trend,'unknown');
 assert.match(stale.note,/устарели/);
});
test('concept 1 reuses real application components and APK includes assets',()=>{
 const index=read('./index.html');
 const skin=read('./clean-intelligence.css');
 const layout=read('./clean-intelligence.mjs');
 const app=read('./app.mjs');
 const prepare=read('../apex9-android/scripts/prepare-web.mjs');
 for(const id of ['ci-market','ci-cap-change','ci-btc-dominance',
  'ci-fear-mood','ci-market-sources','overview-favorites-anchor',
  'radar-results','research-forecast-list']){
  assert.ok(index.includes('id="'+id+'"'),id);
 }
 assert.ok(index.includes('./clean-intelligence.css'));
 assert.ok(prepare.includes("'clean-intelligence.css'"));
 assert.ok(prepare.includes("'clean-intelligence.mjs'"));
 assert.ok(app.includes("from './clean-intelligence.mjs'"));
 assert.ok(app.includes('initCleanIntelligence();'));
 assert.ok(layout.includes("const global=overview.querySelector('.overview-global-panel')"));
 assert.ok(layout.includes("const fear=overview.querySelector('.free-fear-panel')"));
 assert.ok(layout.includes("stageTabs.before(modes)"));
 assert.ok(layout.includes("journal.after(archives)"));
 assert.ok(layout.includes("new MutationObserver(enhance)"));
 assert.ok(skin.includes('#view-forecasts .forecast-compact-actions'));
 assert.ok(skin.includes('#view-forecasts .forecast-unified-completed.tone-stop'));
 assert.ok(skin.includes('.tabs.bottom-dock'));
 assert.ok(!layout.includes('fetch('));
 assert.ok(!layout.includes('setMobileSettings('));
 assert.ok(!layout.includes('getMobileResearchForecasts('));
});
