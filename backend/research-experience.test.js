import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openExperienceStore } from './experience.js';
import { scoreSignal } from './learning.js';
import { buildStatistics } from './statistics.js';

function make(ruleVersion, idAt, state='STOPPED', hitTargets=0) {
  const entry=100;
  const events=[{type:'CREATED',at:idAt,price:103},{type:'ENTRY',at:idAt+1000,price:entry}];
  if(hitTargets>0)events.push({type:'TP1',at:idAt+2000,price:102});
  events.push({type:state==='STOPPED'?'STOP':'TP3',at:idAt+3000,price:state==='STOPPED'?98:106});
  return {id:'spot:BTCUSDT:1h:'+idAt+':LONG:'+ruleVersion,market:'spot',
    symbol:'BTCUSDT',timeframe:'1h',side:'LONG',state,strategyVersion:3,ruleVersion,
    detectedAt:idAt,updatedAt:idAt+3000,entryLow:99,entryHigh:101,entry,
    stop:98,targets:[102,104,106],hitTargets,features:Array(8).fill(1),
    events,learned:false,expiresAt:idAt+1e7};
}
test('models and recorded statistics survive restart and never cross-learn',()=>{
  const dir=mkdtempSync(join(tmpdir(),'orbit-rules-'));
  const path=join(dir,'exp.db');
  try {
    let store=openExperienceStore(path);
    const a=make('v0.1',1000000);
    a.quality=scoreSignal(store.ruleModels['v0.1'],a.features);
    assert.equal(store.recordOutcome(a),true);
    assert.equal(store.recordOutcome(a),false);
    assert.equal(store.ruleModels['v0.1'].samples,1);
    assert.equal(store.ruleModels['v0.2-D1'].samples,0);
    assert.equal(store.ruleModels['v0.3-D1'].samples,0);
    assert.equal(store.model.samples,0);
    const b=make('v0.2-D1',2000000,'STOPPED',1);
    b.quality=scoreSignal(store.ruleModels['v0.2-D1'],b.features);
    assert.equal(store.recordOutcome(b),true);
    const c=make('v0.3-D1',3000000,'COMPLETED',3);
    c.quality=scoreSignal(store.ruleModels['v0.3-D1'],c.features);
    assert.equal(store.recordOutcome(c),true);
    let versions=store.statistics().ruleComparisons.versions;
    assert.deepEqual(versions.map(v=>v.resolved),[1,1,1]);
    assert.deepEqual(versions.map(v=>v.successful),[0,1,1]);
    assert.deepEqual(versions.map(v=>v.tp3),[0,0,1]);
    store.close();
    store=openExperienceStore(path);
    assert.deepEqual(['v0.1','v0.2-D1','v0.3-D1'].map(key=>store.ruleModels[key].samples),[1,1,1]);
    assert.equal(store.model.samples,0);
    versions=store.statistics().ruleComparisons.versions;
    assert.deepEqual(versions.map(v=>v.resolved),[1,1,1]);
    store.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('archived v0.2 volume rules do not silently count as v0.2-D1',()=>{
  const old=make('v0.2',5000000);
  const next=make('v0.2-D1',6000000);
  const stats=buildStatistics([old,next],[]);
  assert.deepEqual(stats.ruleComparisons.versions.map(x=>x.signals),[0,1,0]);
});
test('legacy SMC3 signal never gets assigned a research rule',()=>{
  const old=make('v0.1',1000000);
  delete old.ruleVersion;
  old.id='spot:BTCUSDT:1h:1000000:LONG';
  const current=make('v0.1',2000000);
  const result=buildStatistics([old,current],[]);
  assert.equal(result.totals.signals,2);
  assert.deepEqual(result.ruleComparisons.versions.map(x=>x.signals),[1,0,0]);
});
