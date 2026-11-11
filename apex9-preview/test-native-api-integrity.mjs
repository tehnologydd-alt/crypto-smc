import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeNativeApiReliability} from './mobile-bridge.mjs';

const AT=Date.UTC(2026,10,11,12,0,0);
const source=()=>({
 native:true,source:'ANDROID_NATIVE_REQUEST_LEDGER',
 version:'APEX_NATIVE_API_LEDGER_V1',capturedAt:AT,
 rows:[{lane:'binance:klines-1m',state:'OBSERVED',
  attempts:15,measuredAttempts:14,uniqueDays:2,ok:12,
  failures:2,cancelled:1,invalid:1,rateLimited:1,
  availabilityPercent:85.7,latencyMedianMs:430,
  freshnessChecked:5,freshnessConfirmed:4,lastAt:AT-1000}]
});
const good=()=>normalizeNativeApiReliability(source());
const invalid=mutator=>{
 const report=source();mutator(report);
 assert.deepEqual(normalizeNativeApiReliability(report).rows,[]);
};
test('native reliability reports genuine measured attempts without mixing web samples',()=>{
 const result=good();
 assert.equal(result.native,true);
 assert.equal(result.rows[0].attempts,15);
 assert.equal(result.rows[0].measuredAttempts,14);
 assert.equal(result.rows[0].cancelled,1);
 assert.equal(result.rows[0].availabilityPercent,85.7);
 assert.equal(result.rows[0].lane,'binance:klines-1m');
});
test('native source cannot fabricate availability or mature a cancellation-only day',()=>{
 invalid(x=>{x.rows[0].availabilityPercent=95.0});
 invalid(x=>{x.rows[0].uniqueDays=1});
 invalid(x=>{x.rows[0].measuredAttempts=11});
 invalid(x=>{x.rows[0].cancelled=0});
 invalid(x=>{x.rows[0].failures=0});
 invalid(x=>{x.rows[0].freshnessChecked=20});
 invalid(x=>{x.rows[0].invalid=3});
});
test('collecting native source stays unscored and cannot masquerade as mature',()=>{
 const x=source(),row=x.rows[0];
 Object.assign(row,{state:'COLLECTING',attempts:9,measuredAttempts:8,
  uniqueDays:1,ok:6,failures:2,cancelled:1,
  availabilityPercent:null});
 assert.equal(normalizeNativeApiReliability(x).rows[0].state,'COLLECTING');
 row.availabilityPercent=75;
 assert.equal(normalizeNativeApiReliability(x).native,false);
});
test('reject duplicate, future, stale, malformed and oversized native response',()=>{
 invalid(x=>{x.rows.push({...x.rows[0]})});
 invalid(x=>{x.rows[0].lastAt=AT+120000});
 invalid(x=>{x.rows[0].lastAt=AT-31*86400000});
 invalid(x=>{x.rows[0].lane='bybit:<img>'});
 invalid(x=>{x.rows[0].latencyMedianMs=Number.POSITIVE_INFINITY});
 invalid(x=>{x.rows[0].freshnessConfirmed=7});
 invalid(x=>{x.capturedAt=0});
 invalid(x=>{x.rows=Array.from({length:21},()=>x.rows[0])});
});
test('Android status reflects provider validation, not HTTP success alone',()=>{
 const base=new URL('../apex9-android/native/src/main/java/com/apexintelligence/research/',
 import.meta.url);
 const read=name=>readFileSync(new URL(name,base),'utf8');
 const worker=read('ApexSyncWorker.kt'),ledger=read('ApexApiLedger.kt');
 assert.ok(worker.includes('data.length() == favorites.size'));
 assert.ok(worker.includes('seen.size == favorites.size'));
 assert.ok(worker.includes('symbol !in favorites'));
 assert.ok(worker.includes('probe.validated(newestSourceAt)'));
 assert.ok(worker.includes('closeAt < receivedAt - 180_000L'));
 assert.ok(ledger.includes('error is java.util.concurrent.CancellationException'));
 assert.ok(ledger.includes('state != "CANCELLED"'));
 assert.ok(ledger.includes('val measured = attempts - cancelled'));
 assert.ok(ledger.includes('if (enough)'));
 assert.ok(ledger.includes('1000L * good / measured'));
 const dashboard=readFileSync(new URL('./free-source-dashboard.mjs',
 import.meta.url),'utf8');
 assert.ok(dashboard.includes('native.measuredAttempts'));
 assert.ok(dashboard.includes('native.cancelled'));
});
