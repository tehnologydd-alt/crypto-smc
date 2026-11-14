import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSavedBatch,sameBatchAssets} from './cloud-ai-batch.mjs';
const at=Date.parse('2026-11-13T19:40:00Z');
const item=a=>({asset:a,
 evidence:[{source_id:'binance:spot:24h:'+a+':'+at,
  observed_at:at,text:'Public Binance spot ticker, known timestamp.'}],
 sourceIds:['binance:spot:24h:'+a+':'+at],
 analystText:'The observation does not prove a future price movement.'});
const good={version:1,stage:'ANALYST_READY',startedAt:at,
 items:[item('BTCUSDT'),item('GRAMUSDT')]};
test('saved batch requires exact evidence, status and expiry',()=>{
 assert.ok(validateSavedBatch(good,at+5*60000));
 assert.equal(validateSavedBatch({...good,startedAt:at-61*60000},at),null);
 assert.equal(validateSavedBatch({...good,items:[item('BTCUSDT'),item('BTCUSDT')]},at),null);
 assert.equal(validateSavedBatch({...good,items:[{
  ...item('BTCUSDT'),sourceIds:['fake']
 },item('GRAMUSDT')]},at),null);
});
test('native signed batch, UI and APK staging exist without background AI loops',()=>{
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 const plugin=readFileSync(new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt',import.meta.url),'utf8');
 const native=readFileSync(new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexAiDevice.kt',import.meta.url),'utf8');
 assert.match(app,/initCloudAiBatch\(/);
 assert.match(stage,/'cloud-ai-batch.mjs'/);
 assert.match(plugin,/fun auditAiBatch/);
 assert.match(native,/signed\(ctx,"POST","\/v1\/agents\/batch",bytes\)/);
 for(const id of ['apex-batch-start','apex-batch-review',
  'apex-batch-options','apex-batch-output'])
  assert.ok(ui.includes('id="'+id+'"'));
});

test('same asset set remains reviewable after priority reorder but not substitution',()=>{
 assert.equal(sameBatchAssets(['BTCUSDT','GRAMUSDT'],['GRAMUSDT','BTCUSDT']),true);
 assert.equal(sameBatchAssets(['BTCUSDT','GRAMUSDT'],['BTCUSDT','ETHUSDT']),false);
 assert.equal(sameBatchAssets(['BTCUSDT','BTCUSDT'],['BTCUSDT','BTCUSDT']),false);
 assert.equal(sameBatchAssets(['BTCUSDT'],undefined),false);
});
test('batch critic uses preserved session order and preserves report scroll',()=>{
 const source=readFileSync(new URL('./cloud-ai-batch.mjs',import.meta.url),'utf8');
 assert.match(source,/if\(role==='critic'\)chosen=session.items.map/);
 assert.match(source,/if\(report!==lastOutput\)/);
 assert.match(source,/sameBatchAssets\(selection,session/);
});

test('AI center synchronizes current batch and collective controls on navigation',()=>{
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(app,/if\(view==='ai'\)\{\s*cloudAiAudit\?\.sync\(\);cloudAiCollective\?\.sync\(\);cloudAiBatch\?\.sync\(\);/);
 for(const id of ['apex-ai-collective-readiness','apex-batch-readiness','apex-history-pair-meters'])assert.equal(html.split('id="'+id+'"').length,2);
});
