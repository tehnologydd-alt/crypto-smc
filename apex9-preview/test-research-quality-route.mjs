import test from 'node:test';
import assert from 'node:assert/strict';
import {planAssetExplanation,describeResearchQuality,EXPLAIN_ROUTE}
 from './research-quality-route.mjs';

test('navigation is bound to the requested valid asset, not prior selection',()=>{
 const options=['SOLUSDT','BTCUSDT','ETHUSDT'];
 const route=planAssetExplanation('SOLUSDT',options);
 assert.equal(route.state,'READY');
 assert.equal(route.asset,'SOLUSDT');
 assert.equal(route.view,'quality');
 assert.equal(route.targetId,'synthesis-panel');
 assert.equal(route.returnView,'asset');
 assert.equal(EXPLAIN_ROUTE.targetId,'synthesis-panel');
});
test('unavailable or injected asset never triggers quality research',()=>{
 for(const name of ['DOGEUSDT','bad-symbol','BTCUSDT<','',null]){
  assert.equal(planAssetExplanation(name,['BTCUSDT','ETHUSDT']).state,
   'UNAVAILABLE');
 }
 assert.equal(planAssetExplanation('BTCUSDT',null).state,'UNAVAILABLE');
});
test('status is not-run for another asset or no completed report',()=>{
 const r={asset:'ETHUSDT',state:'DESCRIPTIVE',
  source:{archiveComplete:true,asset:'ETHUSDT',missingHours:0}};
 assert.equal(describeResearchQuality(null,'BTCUSDT').state,'NOT_RUN');
 assert.equal(describeResearchQuality(r,'BTCUSDT').state,'NOT_RUN');
});
test('source incompleteness and errors never show a checked badge',()=>{
 const s={asset:'BTCUSDT',state:'DESCRIPTIVE',
  source:{asset:'BTCUSDT',archiveComplete:true,missingHours:0,
   closedBars:640,windows:149},
  coverage:{holdout:'DESCRIPTIVE',crossAsset:'DESCRIPTIVE'}};
 for(const report of [
  {...s,state:'HIDDEN'},
  {...s,source:{...s.source,archiveComplete:false}},
  {...s,source:{...s.source,missingHours:2}},
  {...s,source:{...s.source,asset:'SOLUSDT'}}
 ]){
  assert.equal(describeResearchQuality(report,'BTCUSDT').state,'BLOCKED');
 }
});
test('partial reports display no invented predictive accuracy',()=>{
 const s={asset:'BTCUSDT',state:'DESCRIPTIVE',
  source:{asset:'BTCUSDT',archiveComplete:true,missingHours:0,
   closedBars:640,windows:149},
  coverage:{holdout:'INSUFFICIENT',crossAsset:'INSUFFICIENT'}};
 const state=describeResearchQuality(s,'BTCUSDT');
 assert.equal(state.state,'PARTIAL');
 assert.match(state.detail,/не оценка прогнозной точности/);
 assert.equal('confidence' in state,false);
 assert.equal('score' in state,false);
});
test('fully completed historical report is checked, not certified prediction',()=>{
 const s={asset:'SOLUSDT',state:'DESCRIPTIVE',
  source:{asset:'SOLUSDT',archiveComplete:true,missingHours:0,
   closedBars:900,windows:210},
  coverage:{holdout:'DESCRIPTIVE',crossAsset:'DESCRIPTIVE'}};
 const r=describeResearchQuality(s,'SOLUSDT');
 assert.equal(r.state,'CHECKED');
 assert.match(r.label,/Исторический отчёт готов|исторический отчёт готов/);
 assert.match(r.detail,/не оценка прогнозной точности/);
});
