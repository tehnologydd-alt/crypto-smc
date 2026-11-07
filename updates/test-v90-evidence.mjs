import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEvidence,validateEvidence,EVIDENCE_LAYERS} from './v90-evidence.mjs';
const t=1700000000000;
const sample=(id,layer='market',polarity=1,overrides={})=>({
 id,asset:'BTCUSDT',layer,source:'feed-'+id,sourceGroup:'origin-'+id,
 observedAt:t-1000,ingestedAt:t-100,polarity,intensity:0.8,reliability:0.9,
 ...overrides
});
test('no inputs remain insufficient and never produce probability',()=>{
 const r=summarizeEvidence([], 'BTCUSDT',t);
 assert.equal(r.assessment,'INSUFFICIENT');
 assert.equal(r.contextBalance,null);
 assert.equal(r.isCalibratedProbability,false);
 assert.equal(r.missingLayers.length,EVIDENCE_LAYERS.length);
});
test('future-dated and stale observations are rejected',()=>{
 const r=summarizeEvidence([
 sample('future','market',1,{observedAt:t+90000,ingestedAt:t+90000}),
 sample('stale','market',1,{observedAt:t-9999999,ingestedAt:t-9999999}),
 sample('ok')
 ],'BTCUSDT',t);
 assert.equal(r.evidence.length,1);
 assert.equal(r.dropped.invalid,1);
 assert.equal(r.dropped.stale,1);
});
test('duplicated events and correlated origin posts cannot amplify score',()=>{
 const r=summarizeEvidence([
 sample('a'),sample('a','news',-1),sample('b','market',-1,{sourceGroup:'origin-a'})
 ],'BTCUSDT',t);
 assert.equal(r.evidence.length,1);
 assert.equal(r.dropped.duplicate,2);
});
test('other assets excluded',()=>{
 const r=summarizeEvidence([sample('x','market',1,{asset:'ETHUSDT'})],'BTCUSDT',t);
 assert.equal(r.dropped.otherAsset,1);
});
test('contradictions across layers produce mixed assessment',()=>{
 const r=summarizeEvidence([
 sample('m','market',1),sample('o','onchain',-1),sample('n','news',1)
 ],'BTCUSDT',t);
 assert.equal(r.assessment,'MIXED');
 assert.equal(r.coveredLayers.length,3);
 assert.equal(r.isCalibratedProbability,false);
});
test('consistent diverse observations support contextual trend, not trade action',()=>{
 const r=summarizeEvidence([
 sample('m','market',1),sample('o','onchain',1),sample('n','news',1)
 ],'BTCUSDT',t);
 assert.equal(r.assessment,'UPWARD_CONTEXT');
 assert.ok(r.contextBalance>0.25);
 assert.equal('tradeSignal' in r,false);
});
test('zero-reliability evidence cannot be counted as directional confidence',()=>{
 const r=summarizeEvidence([
 sample('m','market',1,{reliability:0}),
 sample('o','onchain',1,{reliability:0}),
 sample('n','news',1,{reliability:0})
 ],'BTCUSDT',t);
 assert.equal(r.assessment,'INSUFFICIENT');
 assert.equal(r.contextBalance,null);
});
test('invalid polarity, nonsensical ingestion, invalid intensity are rejected',()=>{
 assert.equal(validateEvidence(sample('a','market',2),t),'invalid');
 assert.equal(validateEvidence(sample('a','market',1,{ingestedAt:t-2000}),t),'invalid');
 assert.equal(validateEvidence(sample('a','market',1,{intensity:3}),t),'invalid');
});
