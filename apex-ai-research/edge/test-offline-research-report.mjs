import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOfflineReport} from './offline-research-report.mjs';
test('offline control report is deterministic and separates fixtures from real model results',()=>{
 const a=buildOfflineReport(),b=buildOfflineReport();
 assert.deepEqual(a,b);
 assert.match(a.sha256,/^[a-f0-9]{64}$/);
 assert.equal(a.total,64);
 assert.equal(a.passed,a.total);
 assert.equal(a.modelAccuracy,null);
 assert.equal(a.cloudCalls,0);
 assert.equal(a.archiveWrites,0);
 for(const p of a.partitions){
  assert.equal(p.total,32);
  assert.equal(p.passed,p.total);
  for(const m of p.modelResults.models){
   assert.equal(m.submitted,0);
   assert.equal(m.counts.NOT_RUN,4);
   assert.equal(m.counts.EXACT,0);
  }
 }
});
