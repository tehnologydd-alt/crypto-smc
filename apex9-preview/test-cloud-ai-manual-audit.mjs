import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCloudAuditEvidence} from './cloud-ai-manual-audit.mjs';

const now=1_794_588_000_000;
const quote={symbol:'ETHUSDT',scope:'24H_SPOT_SNAPSHOT',
 observedAt:now-15000,receivedAt:now-12000,
 price:2123.45,changePercent:-2.1,quoteVolume:300000};
const row=(data={})=>({
 asset:'ETHUSDT',source:'okx:spot:depth',kind:'liquidity',
 sourceState:'OK',observedAt:now-9000,collectedAt:now-8000,
 payload:JSON.stringify({bestBid:2123.4,bestAsk:2123.5,spreadBps:.45,
  visibleDepthImbalance:.2,privateApiKey:'NEVER_FORWARD_THIS'}),...data
});

test('verified ticker is forwarded with provenance, not a prediction',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',ticker:quote,now});
 assert.equal(got.length,1);
 assert.match(got[0].source_id,/binance:spot:24h:ETHUSDT:/);
 assert.match(got[0].text,/last 24h change/);
 assert.match(got[0].text,/not a prediction/);
});
test('fresh saved exchange depth is accepted but not raw private fields',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',rows:[row()],now});
 assert.equal(got.length,1);
 assert.match(got[0].text,/source okx:spot:depth/);
 assert.doesNotMatch(JSON.stringify(got),/NEVER_FORWARD_THIS|privateApiKey/);
});
test('unverified, stale and mismatched observations cannot enter evidence',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',rows:[
  row({sourceState:'INVALID'}),
  row({asset:'BTCUSDT'}),
  row({observedAt:now-200000,collectedAt:now-100000}),
  row({source:'attacker:spot:depth'}),
  row({payload:'invalid json'}),
  row({payload:JSON.stringify({bestBid:1,bestAsk:.1,spreadBps:0,
   visibleDepthImbalance:0})})
 ],ticker:{...quote,observedAt:now-190000},now});
 assert.deepEqual(got,[]);
});
test('at most one newest source-scoped snapshot per venue; no unsupported asset',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',rows:[
  row(),row({observedAt:now-10000,collectedAt:now-9000}),
  row({source:'binance:spot:depth',observedAt:now-8000})
 ],ticker:quote,now});
 assert.equal(got.length,3);
 assert.equal(got.filter(x=>x.source_id.startsWith('okx')).length,1);
 assert.deepEqual(buildCloudAuditEvidence({asset:'not a symbol',ticker:quote,now}),[]);
});
test('UI uses opt-in model buttons and packaged module',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 for(const id of ['apex-ai-test-asset','apex-ai-test-analyst',
  'apex-ai-test-critic','apex-ai-test-status','apex-ai-test-output'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/initCloudAiAudit\(/);
 assert.match(app,/cloudAiEvidenceAudit/);
 assert.match(stage,/'cloud-ai-manual-audit\.mjs'/);
});
