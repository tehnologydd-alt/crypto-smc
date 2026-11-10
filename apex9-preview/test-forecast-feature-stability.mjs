import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEATURE_HOLDOUT_VERSION,FEATURE_DEFINITIONS} from './forecast-feature-holdout.mjs';
import {STABILITY_VERSION,STABILITY_RULES,assessFeatureStability}
 from './forecast-feature-stability.mjs';

function bucket(yesTP=8,yesSL=2,noTP=2,noSL=8,unavailable=0){
 return {yes:{tp3:yesTP,stop:yesSL},
  no:{tp3:noTP,stop:noSL},unavailable};
}
const cohort=(g,n=20)=>({counters:{decisive:n},
 features:Object.fromEntries(FEATURE_DEFINITIONS.map(d=>[d.id,structuredClone(g)]))});
function report(){
 const reference=cohort(bucket(15,5,5,15),40);
 const validation=cohort(bucket());
 const confirmation=cohort(bucket());
 const frame={
  frame:'15m',state:'DESCRIPTIVE',published:100,
  splitAt:100000,confirmationAt:200000,purged:1,purgedValidation:1,
  reference,validation,confirmation,
  features:FEATURE_DEFINITIONS.map(d=>({id:d.id,state:'DESCRIPTIVE'}))
 };
 const empty=frameName=>({frame:frameName,state:'INSUFFICIENT',published:0});
 return {version:FEATURE_HOLDOUT_VERSION,asset:'BTCUSDT',archiveRows:100,
  frames:{'15m':frame,'1h':empty('1h'),'4h':empty('4h')}};
}
const feature=(r,id='sameRadar')=>assessFeatureStability(r).frames['15m']
 .features.find(f=>f.id===id);

test('three-window repeating association is descriptive only, never model approval',()=>{
 const quality=assessFeatureStability(report());
 assert.equal(quality.version,STABILITY_VERSION);
 assert.equal(quality.state,'DESCRIPTIVE');
 assert.equal(quality.frames['15m'].state,'DESCRIPTIVE');
 assert.equal(feature(report()).state,'REPEATED');
 assert.equal(feature(report()).approvedForForecast,false);
 assert.equal(quality.approvedForForecast,false);
 assert.equal(STABILITY_RULES.autoPromotion,false);
 assert.equal(STABILITY_RULES.calibratedProbability,false);
 assert.equal(quality.frames['1h'].state,'INSUFFICIENT');
});
test('contradictory independent confirmation period is not repeated',()=>{
 const r=report();
 r.frames['15m'].confirmation.features.sameRadar=bucket(2,8,8,2);
 assert.equal(feature(r).state,'CONFLICTING');
 assert.equal(feature(r).approvedForForecast,false);
});
test('sparse source coverage cannot masquerade as stability',()=>{
 const r=report();
 r.frames['15m'].validation.features.sameRadar=bucket(3,1,1,3,12);
 assert.equal(feature(r).state,'LOW_COVERAGE');
 const missing=report();
 missing.frames['15m'].validation.features.sameRadar=bucket(5,2,9,4);
 assert.equal(feature(missing).state,'INSUFFICIENT');
});
test('effect drift and near-zero effects are not repeated',()=>{
 const drift=report();
 drift.frames['15m'].validation.features.sameRadar=bucket(9,1,1,9);
 drift.frames['15m'].confirmation.features.sameRadar=bucket(6,4,4,6);
 assert.equal(feature(drift).state,'DRIFTING');
 const weak=report();
 weak.frames['15m'].validation.features.sameRadar=bucket(5,5,5,5);
 assert.equal(feature(weak).state,'WEAK');
});
test('no inferred evidence from truncated, malformed, or non-source reports',()=>{
 assert.equal(assessFeatureStability({asset:'BTCUSDT'}).state,'INVALID');
 assert.equal(assessFeatureStability({
  version:FEATURE_HOLDOUT_VERSION,asset:'BTCUSDT',
  archiveRows:75,frames:null
 }).state,'INVALID');
 const reportWithInvalidFrame=report();
 reportWithInvalidFrame.frames['15m'].state='INVALID';
 assert.equal(assessFeatureStability(reportWithInvalidFrame)
  .frames['15m'].state,'INVALID');
});
test('the three-window stability report is packed and manually triggered',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('./forecast-feature-dashboard.mjs',import.meta.url),'utf8');
 const core=readFileSync(new URL('./forecast-feature-holdout.mjs',import.meta.url),'utf8');
 const build=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(html.includes('id="feature-holdout-run"'));
 assert.ok(ui.includes("assessFeatureStability(report)"));
 assert.ok(ui.includes("button.addEventListener('click'"));
 assert.ok(ui.includes('Автоматическое изменение прогнозов отключено'));
 assert.ok(core.includes('purgedValidation'));
 assert.ok(core.includes('referenceCutoff:confirmationAt'));
 assert.ok(build.includes("'forecast-feature-stability.mjs'"));
});
