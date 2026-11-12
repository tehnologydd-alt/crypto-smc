import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 condensedVerifiedText,researchNavItems,sourceNavItems
} from './clean-intelligence-asset-hub.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('asset desk uses verified original chart, W, liquidity, and news controllers',()=>{
 const expected=['chart','whales','depth','news'];
 assert.deepEqual(researchNavItems().map(x=>x.id),expected);
 assert.deepEqual(researchNavItems().map(x=>x.area),
  ['chart','data','data','data']);
 const html=read('./index.html');
 for(const item of researchNavItems()){
  assert.ok(html.includes('id="'+item.target+'"'),'original target: '+item.target);
  assert.ok(html.includes('id="'+item.source+'"'),'original source: '+item.source);
 }
});
test('source navigation points to existing API reliability and Android sections',()=>{
 assert.deepEqual(sourceNavItems().map(x=>x.id),
  ['market','providers','storage','updates']);
 const html=read('./index.html');
 for(const item of sourceNavItems().filter(x=>x.id!=='updates'))
  assert.ok(html.includes('id="'+item.target+'"'));
 assert.ok(html.includes('class="card block update-panel"'));
 for(const id of ['active-sources','api-reliability-status',
  'native-storage-status','evidence-status'])
  assert.ok(html.includes('id="'+id+'"'),'source-backed '+id);
});
test('compact source text does not fabricate successful status or hide archive',()=>{
 assert.equal(condensedVerifiedText('  '),'Нет проверенного обновления');
 assert.equal(condensedVerifiedText('—'),'Нет проверенного обновления');
 assert.equal(condensedVerifiedText('Проверяем...'),'Нет проверенного обновления');
 assert.equal(condensedVerifiedText('Архивный снимок · 09.11.2026'),
  'Архивный снимок · 09.11.2026');
 assert.equal(condensedVerifiedText('API не ответил · timeout'),
  'API не ответил · timeout');
 assert.equal(condensedVerifiedText('Сохранённые данные',{max:10}),
  'Сохранённ…');
});
test('major research desk keeps chart first and never relocates native canvas',()=>{
 const hub=read('./clean-intelligence-asset-hub.mjs');
 const html=read('./index.html');
 const app=read('./app.mjs');
 assert.match(hub,/chart\.after\(desk\)/);
 assert.match(hub,/desk\.dataset\.assetPane='chart'/);
 assert.match(hub,/anchor\.after\(section\)/);
 assert.match(hub,/section\.dataset\.assetPane='data'/);
 assert.match(hub,/requestAnimationFrame\(\(\)=>scrollTo\(selector\)\)/);
 assert.match(hub,/new MutationObserver\(update\)\.observe\(node/);
 assert.ok(html.includes('id="candle-canvas"'));
 assert.ok(html.includes('id="asset-workspace-anchor"'));
 assert.match(app,/initCleanIntelligenceAssetHub\(\)/);
 assert.match(app,/import \{initCleanIntelligenceAssetHub\} from '.\/clean-intelligence-asset-hub.mjs'/);
 assert.match(app,/function setAssetArea\(requested\)/);
 assert.ok(!hub.includes('getMobileCandles('));
 assert.ok(!hub.includes('getMobileResearchForecasts('));
 assert.ok(!hub.includes('fetch('));
});
test('data anchors and quality evidence use original screen and real routes',()=>{
 const hub=read('./clean-intelligence-asset-hub.mjs');
 const html=read('./index.html');
 for(const selector of ['depth-list','liquidity-history-panel','whale-panel',
   'asset-news-list','source-reconciliation-list','free-provider-center-panel',
   'native-storage-panel','evidence-lab-panel']){
  assert.ok(html.includes('id="'+selector+'"'),selector);
 }
 assert.match(hub,/document\.querySelector\('\[data-asset-area-button="/);
 assert.match(hub,/document\.querySelector\('\[data-quality-area-button="data"\]'\)/);
 assert.match(hub,/document\.querySelector\('\.quality-sources-link\[data-go="sources"\]'\)/);
 assert.ok(!hub.includes('setMobileSettings('));
});
test('APK includes entire major stage 7 under same module graph as research core',()=>{
 const p=read('../apex9-android/scripts/prepare-web.mjs');
 const app=read('./app.mjs');
 const index=read('./index.html');
 const css=read('./clean-intelligence-asset-hub.css');
 for(const name of ['clean-intelligence-asset-hub.css',
  'clean-intelligence-asset-hub.mjs']){
  assert.ok(p.includes("'"+name+"'"),'missing Android web asset '+name);
 }
 assert.ok(index.includes('./clean-intelligence-asset-hub.css'));
 assert.match(app,/initCleanIntelligenceAssetHub\(\)/);
 assert.match(css,/#view-asset>.ci7-asset-desk/);
 assert.match(css,/#view-asset .ci7-data-navigation/);
 assert.match(css,/#view-sources>.ci7-sources-desk/);
 assert.match(css,/#view-quality .ci-research-grid/);
 assert.ok(css.includes('prefers-reduced-motion'));
 assert.ok(css.includes('max-width:390px'));
});
