import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assetAreaForEntry} from './research-workspace.mjs';

const read=x=>readFileSync(new URL(x,import.meta.url),'utf8');
const html=read('./index.html');
const app=read('./app.mjs');
const css=read('./styles.css');

test('direct asset route is authoritative; dock entry restores last task',()=>{
 assert.equal(assetAreaForEntry(null,'structure'),'structure');
 assert.equal(assetAreaForEntry(null,'data'),'data');
 assert.equal(assetAreaForEntry(null,'chart'),'chart');
 assert.equal(assetAreaForEntry('chart','structure'),'chart');
 assert.equal(assetAreaForEntry('structure','chart'),'structure');
 assert.equal(assetAreaForEntry('data','structure'),'data');
 assert.equal(assetAreaForEntry('invalid','structure'),'chart');
 assert.equal(assetAreaForEntry('__proto__','data'),'chart');
 assert.equal(assetAreaForEntry(null,'__proto__'),'chart');
 assert.equal(assetAreaForEntry(),'chart');
});
test('asset task switch is one level and visible before market passport',()=>{
 const asset=html.slice(html.indexOf('id="view-asset"'),html.indexOf('id="view-forecasts"'));
 const nav=asset.indexOf('id="asset-workspace-anchor"');
 const hero=asset.indexOf('class="hero card"');
 assert.ok(nav>0&&hero>nav);
 assert.equal((asset.match(/id="asset-workspace-anchor"/g)||[]).length,1);
 const tasks=[...asset.matchAll(/data-asset-area-button="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(tasks,['chart','structure','data']);
 for(const [area,label] of [
  ['chart','Свечи · сценарии'],
  ['structure','Режим · BOS'],
  ['data','Ликвидность · сеть']]){
  assert.ok(asset.includes('data-asset-area-button="'+area+'"'));
  assert.ok(asset.includes(label));
 }
 assert.ok(css.includes('#view-asset .asset-workspace-nav'));
 assert.ok(css.includes('position:sticky;'));
});
test('all research cards and original data source ids remain mounted',()=>{
 const asset=html.slice(html.indexOf('id="view-asset"'),html.indexOf('id="view-forecasts"'));
 for(const id of [
  'candle-canvas','asset-scenario-summary','scenario-replay-panel',
  'market-core-status','market-matrix-run','market-matrix-summary',
  'structure-summary','depth-list','liquidity-history-panel',
  'onchain-network-panel','asset-quality-status','asset-explain'
 ])assert.equal(html.split('id="'+id+'"').length-1,1,id);
 assert.equal((asset.match(/data-asset-pane="chart"/g)||[]).length,3);
 assert.equal((asset.match(/data-asset-pane="structure"/g)||[]).length,3);
 assert.equal((asset.match(/data-asset-pane="data"/g)||[]).length,4);
});
test('radar opens observed structure; favorites, catalog and search open chart',()=>{
 assert.ok(app.includes("onOpenAsset:symbol=>{void investigate(symbol);navigate('asset','structure');}"));
 assert.ok(app.includes("setAssetArea(assetAreaForEntry(targetId,lastAssetArea))"));
 assert.ok(app.includes("lastAssetArea=mode"));
 assert.ok(app.includes("navigate('asset','chart');"));
 assert.ok(app.includes("onForecastStage:()=>navigate('forecasts')"));
 const calls=[...app.matchAll(/navigate\('asset','structure'\)/g)];
 assert.equal(calls.length,1);
});
test('four-frame comparison restores archive automatically but deep panels remain on-demand',()=>{
 const navigation=app.slice(app.indexOf('function navigate(view,targetId){'),
   app.indexOf("el('asset-explain').addEventListener"));
 assert.ok(!navigation.includes('runMarketMatrix('));
 assert.ok(navigation.includes("if(area==='data'){"));
 assert.ok(navigation.includes('void liquidityDashboard.refresh(chosen)'));
 assert.ok(navigation.includes('void onChainDashboard.refresh(chosen)'));
 assert.ok(app.includes("el('market-matrix-run').addEventListener('click',()=>void runMarketMatrix(true))"));
 const setArea=app.slice(app.indexOf('function setAssetArea(requested){'),
  app.indexOf('function setQualityArea(requested){'));
 assert.ok(setArea.includes("previousArea!==mode"));
 assert.ok(setArea.includes("if(mode==='structure'){"));
 assert.ok(setArea.includes('void restoreMarketMatrix(chosen)'));
 assert.ok(setArea.includes("if(mode==='data')requestAnimationFrame"));
 assert.ok(app.includes('void showAssetScenarios(chosen)'));
});
