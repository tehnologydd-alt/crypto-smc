import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectResearchArchive,inspectResearchRelease,
 RELEASE_ARCHIVE_MAX} from './forecast-release-readiness.mjs';
import {auditShadowChallengers} from './forecast-shadow-challengers.mjs';
import {auditShadowRegimes} from './forecast-shadow-regimes.mjs';

const asset='BTCUSDT',now=Date.UTC(2026,11,4);
const frames=['15m','1h','4h'];
const rows=Array.from({length:6},(_,i)=>({
 id:'direction3:BTCUSDT:'+i,asset,interval:'15m',
 publishedAt:now-60000+i*3000
}));
const full=forecasts=>({
 native:true,asset,assetScoped:true,complete:true,
 forecasts,publishedCount:forecasts.length,
 source:'LOCAL_ROOM_JOURNAL'
});
const build=(q={},c={},r={},s={},p={})=>({
 asset,archive:full(rows),checkedAt:now,
 quality:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  status:'DESCRIPTIVE_READY',issueCount:0,...q}]))},
 challenge:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  state:'DESCRIPTIVE',newScored:130,...c}]))},
 regimes:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  state:'DESCRIPTIVE',...r}]))},
 shadowLearner:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  state:'EVALUATED',scored:240,...s}]))},
 calibration:{asset,frames:Object.fromEntries(frames.map(tf=>[tf,{
  state:'REVIEW',holdoutMetrics:[{},{}],
  regime:{state:'STABLE'},...p}]))}
});
test('full archive preflight is bounded, favorite-scoped, and no background scan',()=>{
 const ok=inspectResearchArchive(full(rows),asset,{now});
 assert.equal(ok.ready,true);
 assert.equal(ok.records,6);
 assert.equal(ok.state,'READY_TO_AUDIT');
 assert.equal(ok.trained,false);
 assert.equal(inspectResearchArchive({...full(rows),complete:false},
  asset,{now}).state,'INCOMPLETE');
 assert.equal(inspectResearchArchive({...full(rows),native:false},
  asset,{now}).state,'UNAVAILABLE');
 assert.equal(inspectResearchArchive({...full(rows),publishedCount:5},
  asset,{now}).state,'INCOMPLETE');
 assert.equal(inspectResearchArchive(full([]),asset,{now}).state,'EMPTY');
 assert.equal(inspectResearchArchive(full(rows),'ETHUSDT',{now}).state,
  'CHECK_DATA');
 const invalid=structuredClone(rows);invalid[3].publishedAt=now+60001;
 assert.equal(inspectResearchArchive(full(invalid),asset,{now}).state,
  'CHECK_DATA');
 const repeated=structuredClone(rows);repeated[1].id=repeated[0].id;
 assert.equal(inspectResearchArchive(full(repeated),asset,{now}).state,
  'CHECK_DATA');
 assert.equal(inspectResearchArchive(full(rows),asset,{
  now,maxRows:5}).state,'LIMIT_REACHED');
 assert.equal(RELEASE_ARCHIVE_MAX,1500);
});
test('stage 5 correctly distinguishes research integrity from readiness',()=>{
 const good=inspectResearchRelease(build());
 assert.equal(good.state,'RESEARCH_REVIEWED');
 assert.equal(good.frames['15m'].state,'REVIEWED');
 assert.equal(good.trainedForProduction,false);
 assert.equal(good.automaticTrading,false);
 assert.equal(good.calibratedProbability,null);
 assert.equal(good.modelChanged,false);
 const collecting=inspectResearchRelease(build({},{
  state:'COLLECTING',newScored:17},{},
  {state:'COLLECTING',scored:20},{
   state:'COLLECTING',holdoutMetrics:null,regime:null}));
 assert.equal(collecting.state,'COLLECTING');
 assert.equal(collecting.frames['1h'].learnerScored,20);
 const review=inspectResearchRelease(build({}, {},{}, {},{
  state:'NEED_RADAR',regime:{state:'AWAITING_RADAR'}}));
 assert.equal(review.state,'NEEDS_REVIEW');
 const bad=inspectResearchRelease(build({
  status:'CHECK_DATA',issueCount:2}));
 assert.equal(bad.state,'CHECK_DATA');
 const tampered=build();
 tampered.challenge.asset='ETHUSDT';
 assert.equal(inspectResearchRelease(tampered).state,'CHECK_DATA');
 const partial=build();
 partial.archive.complete=false;
 assert.equal(inspectResearchRelease(partial).state,'INCOMPLETE');
});
test('reusing checked Shadow report preserves existing regime results',()=>{
 const opts={asset,complete:true,publishedCount:0,now};
 const baseline=auditShadowChallengers([],opts);
 const direct=auditShadowRegimes([],opts);
 const reused=auditShadowRegimes([],{...opts,challenger:baseline});
 assert.deepEqual(reused,direct);
 const rogue={...baseline,asset:'ETHUSDT'};
 const invalid=auditShadowRegimes([],{...opts,challenger:rogue});
 assert.equal(invalid.frames,null);
 assert.equal(invalid.state,'INVALID_EVIDENCE');
});
test('stage 5 manual-only gate runs before expensive research and caches read-only',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const dashboard=read('./forecast-feature-dashboard.mjs');
 const research=read('./forecast-probability-dashboard.mjs');
 const overview=read('./overview-decision-quality.mjs');
 const packaged=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(dashboard.includes('inspectResearchArchive(archive,asset'));
 assert.ok(dashboard.includes('verifiedAudits?.release'));
 assert.ok(research.includes('inspectResearchRelease({asset,archive,quality'));
 assert.ok(research.includes('challenger:challenge'));
 assert.ok(research.includes('Этап 5 из 5'));
 assert.ok(overview.includes('release:audits?.release'));
 assert.ok(packaged.includes("'forecast-release-readiness.mjs'"));
 assert.ok(!read('./forecast-release-readiness.mjs').includes('fetch('));
});
