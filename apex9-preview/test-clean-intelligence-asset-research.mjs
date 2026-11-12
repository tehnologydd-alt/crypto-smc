import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assetIntelligenceTabs,researchEntryPoints}
 from './clean-intelligence.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('asset chart navigation uses three requested compact tabs',()=>{
 assert.deepEqual(assetIntelligenceTabs().map(x=>x.id),
  ['whales','blocks','info']);
 assert.deepEqual(assetIntelligenceTabs().map(x=>x.label),
  ['Киты','Ордер-блоки','Инфо']);
});
test('chart intelligence moves the original live controls (no clones)',()=>{
 const adapter=read('./clean-intelligence.mjs');
 const page=read('./index.html');
 for(const id of ['chart-ob-toggle','chart-whale-toggle','chart-ob-status',
  'chart-whale-status','candle-status','updated-at',
  'asset-source-diagnostics','chart-scenario-hide','candle-canvas']){
  assert.ok(page.includes('id="'+id+'"'),'Missing original '+id);
 }
 assert.match(adapter,/whalesPanel\.append\([\s\S]*?whales,\s*whaleStatus\)/);
 assert.match(adapter,/blocksPanel\.append\([\s\S]*?ob,\s*obStatus\)/);
 assert.match(adapter,/after\.after\(root\)/);
 assert.match(adapter,/target\?\.click\(\)/);
 assert.match(adapter,/diagnostics\.open=true/);
 assert.match(adapter,/new MutationObserver\(update\)\.observe\(source/);
 assert.ok(!adapter.includes('getMobileCandles('));
 assert.ok(!adapter.includes('setMobileSettings('));
});
test('news macro and reliability cards lead to the existing wired application routes',()=>{
 const list=researchEntryPoints();
 assert.deepEqual(list.map(e=>e.id),['news','macro','patterns','quality']);
 const page=read('./index.html');
 const app=read('./app.mjs');
 for(const item of list){
  assert.equal(typeof item.target,'string');
  // Every destination is an existing native page button, not a fake URL.
  if(item.id==='news')assert.ok(page.includes('data-go="news"'));
  if(item.id==='macro')assert.ok(page.includes('data-go="macro"'));
  if(item.id==='patterns')assert.ok(page.includes('data-quality-area-button="regimes"'));
  if(item.id==='quality')assert.ok(page.includes('class="ghost quality-sources-link" data-go="sources"'));
 }
 assert.match(app,/for\(const button of document\.querySelectorAll\('\[data-go\]'\)\)/);
 assert.match(app,/for\(const button of document\.querySelectorAll\('\[data-quality-area-button\]'\)\)/);
 const adapter=read('./clean-intelligence.mjs');
 assert.match(adapter,/existing\?\.click\(\)/);
 assert.match(adapter,/quality\.prepend\(heading\)/);
});
test('data-pane switching keeps the live background monitoring logic',()=>{
 const adapter=read('./clean-intelligence.mjs');
 const app=read('./app.mjs');
 assert.match(adapter,/asset\.querySelector\('\[data-asset-area-button="data"\]'\)/);
 assert.match(adapter,/asset\.querySelector\('\[data-asset-area-button="structure"\]'\)/);
 assert.match(app,/function setAssetArea\(requested\)/);
 assert.match(app,/void syncDepthStreams\(\)/);
 assert.match(app,/void whaleDashboard\.refresh\(chosen\)/);
 assert.match(app,/void largeTradeDashboard\.refresh\(chosen\)/);
 assert.ok(!adapter.includes('fetch('));
});
test('layout remains phone-first, with no invented prices or fake successes',()=>{
 const skin=read('./clean-intelligence.css');
 const adapter=read('./clean-intelligence.mjs');
 assert.ok(skin.includes('.ci-asset-intel-tabs'));
 assert.ok(skin.includes('.ci-asset-intel-panel[hidden]'));
 assert.ok(skin.includes('#view-quality .ci-research-grid'));
 assert.ok(skin.includes('env(safe-area-inset-bottom)'));
 assert.ok(adapter.includes("document.body.dataset.apexTheme='clean-intelligence'"));
 assert.ok(!adapter.includes('Math.random('));
 assert.ok(!adapter.includes('104,287.50'));
});
