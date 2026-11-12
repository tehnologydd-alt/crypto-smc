import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFoldDefinitions,sourcePanelCoverage}
 from './clean-intelligence-source-folds.mjs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('all seven original API/source/Android articles have one owner',()=>{
 const groups=sourceFoldDefinitions();
 assert.equal(groups.length,6);
 const claimed=groups.flatMap(x=>x.indexes);
 assert.deepEqual(claimed,[0,1,2,3,4,5,6]);
 assert.equal(sourcePanelCoverage(7).complete,true);
 assert.equal(sourcePanelCoverage(6).complete,false);
 assert.equal(sourcePanelCoverage(8).complete,false);
 for(const group of groups){
  assert.ok(group.title.length>5);
  assert.ok(group.note.length>10);
 }
});
test('compact source UI moves original nodes, never duplicates handlers',()=>{
 const src=read('./clean-intelligence-source-folds.mjs');
 const html=read('./index.html');
 assert.match(src,/for\(const index of definition\.indexes\)/);
 assert.match(src,/body\.append\(panel\)/);
 assert.match(src,/if\(!sourcePanelCoverage\(panels\.length\)\.complete\)return false/);
 assert.match(src,/section\.append\(body\)/);
 assert.match(src,/view\.dataset\.apexSourcesCompact='true'/);
 assert.ok(!src.includes('cloneNode('));
 assert.ok(!src.includes('fetch('));
 assert.ok(!src.includes('setMobileSettings('));
 for(const id of ['source-list','context-source-list','news-articles',
  'free-provider-center-panel','personal-newsdata-key',
  'personal-cryptopanic-key','native-storage-panel',
  'native-show-history','check-updates-button',
  'research-wallet-check']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
});
test('source shortcut opens folded group before scrolling, preserving routing',()=>{
 const nav=read('./clean-intelligence-asset-hub.mjs');
 const folds=read('./clean-intelligence-source-folds.mjs');
 assert.match(nav,/target\.closest\('details\.ci10-source-fold'\)/);
 assert.match(nav,/if\(fold&&!fold\.open\)fold\.open=true/);
 assert.match(nav,/requestAnimationFrame\(\(\)=>target\.scrollIntoView/);
 assert.match(nav,/sourceNavItems\(\)/);
 assert.match(folds,/groups\.every\(x=>x\.open\)/);
 assert.match(folds,/section\.id='ci10-source-'\+definition\.id/);
});
test('phone polish and preview QA do not ship fake data or Playwright into APK',()=>{
 const app=read('./app.mjs');
 const prepare=read('../apex9-android/scripts/prepare-web.mjs');
 const html=read('./index.html');
 const css=read('./clean-intelligence-mobile-polish.css');
 const visual=read('./test-clean-intelligence-mobile-visual.mjs');
 assert.match(app,/initCleanIntelligenceSourceFolds\(\)/);
 assert.match(app,/import \{initCleanIntelligenceSourceFolds\} from '.\/clean-intelligence-source-folds.mjs'/);
 for(const file of ['clean-intelligence-source-folds.mjs',
  'clean-intelligence-mobile-polish.css'])
  assert.ok(prepare.includes("'"+file+"'"));
 assert.ok(!prepare.includes("'test-clean-intelligence-mobile-visual.mjs'"));
 assert.ok(!prepare.includes("'playwright'"));
 assert.ok(html.includes('./clean-intelligence-mobile-polish.css'));
 assert.ok(css.includes('env(safe-area-inset-top)'));
 assert.ok(css.includes('env(safe-area-inset-bottom)'));
 assert.ok(css.includes('#view-sources .ci10-source-fold[open]'));
 assert.ok(css.includes('prefers-reduced-motion'));
 assert.match(visual,/context\.route\('\*\*\/\*'/);
 assert.match(visual,/width of \[360,412\]/);
 assert.match(visual,/#ci10-source-availability/);
});
