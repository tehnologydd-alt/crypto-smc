import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const html=read('./index.html');
const app=read('./app.mjs');
const dashboard=read('./research-layer-dashboard.mjs');
const editorial=read('./editorial-dashboard.mjs');
const android=read('../apex9-android/scripts/prepare-web.mjs');
test('all four research layers expose one real dynamic status and manual action',()=>{
 for(const layer of ['wallet','social','derivatives','macro']){
  assert.equal(html.split('id="research-'+layer+'-state"').length-1,1,layer);
  assert.equal(html.split('id="research-'+layer+'-detail"').length-1,1,layer);
  assert.equal(html.split('id="research-'+layer+'-metrics"').length-1,1,layer);
  assert.equal(html.split('id="research-'+layer+'-check"').length-1,1,layer);
 }
 const planned=html.slice(html.indexOf('Дополнительные исследовательские источники'),
  html.indexOf('</section>',html.indexOf('id="research-macro-metrics"')));
 assert.equal(planned.includes('<span class="planned">Не подключено</span>'),false);
});
test('social source and macro source feed actual provider states into the layer dashboard',()=>{
 assert.ok(app.includes('initResearchLayersDashboard({'));
 assert.ok(app.includes('researchLayersDashboard?.setSocial(symbol,result)'));
 assert.ok(app.includes('onMacroObservation:report=>researchLayersDashboard?.setMacro(report)'));
 assert.ok(editorial.includes('onMacroObservation(latestMacro)'));
 assert.ok(dashboard.includes('summarizePublicDiscussion(r)'));
});
test('Android bundle includes every new ESM dependency before WebView starts',()=>{
 for(const module of ['research-layer-core.mjs','research-layer-budget.mjs',
  'research-layer-dashboard.mjs']){
  assert.ok(android.includes("'"+module+"'"),module);
 }
});
test('wallet address observation is voluntary and cannot infer an owner',()=>{
 assert.ok(dashboard.includes('largeWalletVerified')===false);
 assert.ok(html.includes('Ключи, seed-фразы')===false);
 assert.ok(html.includes('Не вводите приватные ключи или seed-фразы'));
 assert.ok(dashboard.includes('Отправить ордер')===false);
 assert.ok(dashboard.includes("get('research-wallet-check')"));
});
