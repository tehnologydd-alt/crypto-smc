import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {explainShadowEvidence,SHADOW_EXPLANATION_VERSION}
 from './forecast-shadow-explanation.mjs';
import {SHADOW_MONITOR_VERSION} from './forecast-shadow-monitor.mjs';
import {SHADOW_VERSION} from './forecast-shadow-forward.mjs';

const registeredAt=1760000000000;
const time=registeredAt+300*900000;
function proposal(featureId='sameRadar'){
 return {id:['shadow1','BTCUSDT','15m',featureId,registeredAt].join(':'),
  asset:'BTCUSDT',interval:'15m',featureId,association:'MATCH_MORE_TP3',
  registeredAt,embargoUntil:registeredAt+16*900000,
  sourceCutoffAt:registeredAt-900000,historySize:100,
  evidenceVersion:SHADOW_VERSION};
}
function window(t=13,s=10,u=2){
 return {decisive:t+s,finished:t+s+u,
  supports:{tp3:t,stop:0},otherGroup:{tp3:0,stop:s},
  gapPp:100,coverage:(t+s)/(t+s+u),unavailable:u,
  awaiting:2,purged:1,lateRecorded:1};
}
function observation(p){
 return {proposal:p,now:time,eligible:52,postRegistration:56,
  decisive:44,invalid:0,unavailable:6,other:1,awaiting:4};
}
function monitor(state='REPEATED_OBSERVATION'){
 return {version:SHADOW_MONITOR_VERSION,
  state,readyToApply:false,modelChanged:false,reason:'descriptive',
  reference:window(),recent:window()};
}
test('fully observed research remains explanation only',()=>{
 const p=proposal();
 const x=explainShadowEvidence(p,observation(p),monitor());
 assert.equal(x.version,SHADOW_EXPLANATION_VERSION);
 assert.equal(x.state,'REPEATED_OBSERVATION');
 assert.equal(x.eligibleForAutomaticTraining,false);
 assert.equal(x.forecastWeightsChanged,false);
 assert.equal(x.calibratedProbability,null);
 assert.equal(x.sourceAsPublished,true);
 assert.equal(x.early.differencePp,100);
 assert.equal(x.late.differencePp,100);
 assert.deepEqual(x.requirements.map(r=>[r.done,r.required]),
  [[48,48],[40,40],[20,20],[20,20]]);
 assert.ok(x.warnings.some(s=>s.includes('Новости')));
 assert.ok(x.warnings.some(s=>s.includes('доходность')));
});
test('insufficient history explicitly shows progress and source caveats',()=>{
 const p=proposal('visibleDepth'),o=observation(p);
 o.eligible=13;o.decisive=7;
 const report=explainShadowEvidence(p,o,{
  version:SHADOW_MONITOR_VERSION,state:'COLLECTING',
  readyToApply:false,modelChanged:false,
  reference:null,recent:null
 });
 assert.equal(report.state,'COLLECTING');
 assert.equal(report.requirements[0].done,13);
 assert.equal(report.requirements[1].done,7);
 assert.equal(report.requirements[2].done,0);
 assert.ok(report.sourceExplanation.includes('10%'));
 assert.ok(report.warnings.some(s=>s.includes('скрытую ликвидность')));
});
test('bad sources and insufficient integrity can never be positive explanations',()=>{
 for(const state of ['WEAKENED','REVERSED','DRIFTING','UNSTABLE']){
  const p=proposal('higherRadar');
  const explanation=explainShadowEvidence(p,observation(p),monitor(state));
  assert.equal(explanation.conflicts,true);
  assert.equal(explanation.eligibleForAutomaticTraining,false);
  assert.ok(explanation.warnings.some(s=>s.includes('Таймфреймы')));
 }
 const p=proposal('marketDay');
 const missing=explainShadowEvidence(p,observation(p),monitor('LOW_COVERAGE'));
 assert.equal(missing.state,'LOW_COVERAGE');
 assert.ok(missing.sourceExplanation.includes('24 часа'));
 const tampered=explainShadowEvidence(p,observation(p),{
  ...monitor(),readyToApply:true
 });
 assert.equal(tampered.state,'INVALID');
 const badId=explainShadowEvidence({...p,id:'other'},observation(p),monitor());
 assert.equal(badId.state,'INVALID');
});
test('different source types are documented without imaginary onchain or news effects',()=>{
 for(const name of ['sameRadar','higherRadar','marketDay','visibleDepth']){
  const p=proposal(name);
  const result=explainShadowEvidence(p,observation(p),monitor());
  assert.equal(result.feature,name);
  assert.ok(result.sourceExplanation.length>30);
  assert.equal(result.calibratedProbability,null);
 }
 const invalid=explainShadowEvidence(proposal('news'),observation(proposal()),monitor());
 assert.equal(invalid.state,'INVALID');
});
test('read-only source explanations are packaged into Android and user opt-in panel',()=>{
 const view=readFileSync(new URL('./forecast-feature-dashboard.mjs',import.meta.url),'utf8');
 const manifest=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 const page=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.ok(view.includes("explainShadowEvidence(proposal,observation,monitor)"));
 assert.ok(view.includes('Почему такой вывод · источник и данные'));
 assert.ok(view.includes('Сколько ещё нужно собрать'));
 assert.ok(view.includes('Никакие веса и прогнозы не изменяются.'));
 assert.ok(manifest.includes("'forecast-shadow-explanation.mjs'"));
 assert.ok(page.includes('feature-shadow-content'));
});
