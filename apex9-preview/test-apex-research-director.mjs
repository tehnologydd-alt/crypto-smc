import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DIRECTOR_STORAGE_KEY,discoverResearchTasks,mergeDirectorTasks,
 persistDirectorJournal,readDirectorJournal,attachCollectiveResult,
 evaluateDirectorTask,summarizeDirectorTasks}
 from './apex-research-director-core.mjs';
const STEP=900000,HOUR=3600000;
const base=Math.floor(Date.parse('2026-11-13T17:00:00Z')/HOUR)*HOUR;
const now=base+5*60000;
const asset='GRAMUSDT';
function radar(interval,direction,movement=0.7,ratio=2.5){
 const step=interval==='15m'?STEP:HOUR;
 const candleAt=base-1;
 return {version:1,symbol:asset,interval,candleAt,
  observedAt:base+15000,source:'Binance Spot',
  direction,mode:'DIRECTIONAL',movement,acceleration:0.3,
  volumeRatio:ratio};
}
const observations=()=>({native:true,source:'ANDROID_NATIVE_RADAR',records:[
 {latest:radar('15m','UP')},{latest:radar('1h','DOWN')}
]});
const memory=()=>{const m=new Map();return {
 getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)
};};
const bar=(t,close,recordedAt=t+STEP+10000)=>({
 t,closeAt:t+STEP-1,open:close,high:close,low:close,
 close,volume:10,closed:true,recordedAt
});
test('offline director sees ONLY fresh verified Radar of favorites',()=>{
 const a=discoverResearchTasks(observations(),[asset],{now});
 assert.equal(a.length,1);
 assert.equal(a[0].kind,'FRAME_CONFLICT');
 assert.equal(a[0].stage,'QUEUED');
 assert.equal(a[0].facts.length,2);
 assert.equal(a[0].sourceAt,base-1);
 assert.ok(!a[0].analyst);
 assert.deepEqual(discoverResearchTasks(observations(),['BTCUSDT'],{now}),[]);
 assert.deepEqual(discoverResearchTasks(
  {...observations(),native:false},[asset],{now}),[]);
 assert.deepEqual(discoverResearchTasks(observations(),[asset],{now:now+4*HOUR}),[]);
 assert.deepEqual(discoverResearchTasks({native:true,source:'NOT_NATIVE',
  records:observations().records},[asset],{now}),[]);
 assert.deepEqual(discoverResearchTasks(
  {native:true,source:'ANDROID_NATIVE_RADAR',records:[{latest:{
    ...radar('15m','UP'),source:'FAKE'}}]},[asset],{now}),[]);
});
test('priority is for human research, NEVER forecast probability',()=>{
 const r=observations();
 r.records[1].latest.direction='UP';
 let list=discoverResearchTasks(r,[asset],{now});
 assert.equal(list.length,1);
 assert.equal(list[0].kind,'MOMENTUM_VOLUME');
 assert.equal(list[0].priority,'WATCH');
 r.records[0].latest.volumeRatio=.8;
 assert.deepEqual(discoverResearchTasks(r,[asset],{now}),[]);
 const stats=summarizeDirectorTasks(list);
 assert.equal(stats.calibratedProbability,null);
 assert.equal(stats.modelAccuracy,null);
});
test('persistent journal bounds duplicates and blocks malicious invalid items',()=>{
 const state=memory();
 const first=discoverResearchTasks(observations(),[asset],{now});
 const once=mergeDirectorTasks([],first,{now});
 assert.equal(once.length,1);
 assert.equal(mergeDirectorTasks(once,first,{now}).length,1);
 assert.equal(persistDirectorJournal(state,once),true);
 assert.equal(readDirectorJournal(state,{now}).length,1);
 state.setItem(DIRECTOR_STORAGE_KEY,JSON.stringify({version:1,tasks:[
  {...once[0],asset:'BTCUSD'},once[0]
 ]}));
 assert.deepEqual(readDirectorJournal(state,{now}).map(x=>x.asset),[asset]);
 state.setItem(DIRECTOR_STORAGE_KEY,JSON.stringify({version:1,
  tasks:Array(25).fill(once[0])}));
 assert.equal(readDirectorJournal(state,{now}).length,0);
});
test('real GLM and Qwen sessions attach to one immutable Radar task',()=>{
 let rows=discoverResearchTasks(observations(),[asset],{now});
 const source={
  source_id:'binance:spot:24h:'+asset+':'+(now-12000),
  text:'A single verified public snapshot cannot predict the next price',
  observed_at:now-12000
 };
 const session={version:1,asset,stage:'ANALYST_READY',
  startedAt:now+60000,evidence:[source],
  sourceIds:[source.source_id],
  analystText:'GLM describes disagreement but makes no verified directional forecast.'};
 rows=attachCollectiveResult(rows,session,{now:now+60000,selectedId:rows[0].id});
 assert.equal(rows.length,1);
 assert.equal(rows[0].stage,'ANALYST_READY');
 assert.match(rows[0].analyst.text,/GLM/);
 const completed={...session,stage:'COMPLETE',criticAt:now+6*60000,
  criticText:'Qwen disputes causal interpretation; no predictive claim is validated.',
  criticEvidence:[{...source,source_id:source.source_id.replace(/.$/,'1')}]};
 const saved=attachCollectiveResult(rows,completed,{
  now:now+6*60000,selectedId:rows[0].id});
 assert.equal(saved.length,1);
 assert.equal(saved[0].stage,'REVIEWED');
 assert.match(saved[0].critic.text,/Qwen/);
 assert.equal(summarizeDirectorTasks(saved).reviewed,1);
 assert.equal(attachCollectiveResult(saved,{
  ...completed,criticText:'tiny'
 },{now:now+6*60000}),saved);
});
test('previously verified manual research can enter Director journal without any AI calls',()=>{
 const source={source_id:'binance:spot:24h:GRAMUSDT:'+(now-10000),
  text:'Original independently verified spot snapshot',observed_at:now-10000};
 const session={version:1,asset,stage:'COMPLETE',startedAt:now,
  evidence:[source],sourceIds:[source.source_id],
  analystText:'GLM analysed the evidence with uncertainty.',
  criticText:'Qwen independently challenged the analyst.',
  criticAt:now+6*60000,criticEvidence:[source]};
 const out=attachCollectiveResult([],session,{now:now+7*60000});
 assert.equal(out.length,1);
 assert.equal(out[0].kind,'MANUAL');
 assert.equal(out[0].stage,'REVIEWED');
 assert.equal(out[0].baseline,null);
});
test('H1 follows exact later closed 15m candles; missing gaps stay UNKNOWN',()=>{
 const original=discoverResearchTasks(observations(),[asset],{now})[0];
 const baseline=bar(base-STEP,1.2,base+20000);
 const anchored=evaluateDirectorTask(original,[baseline],{now});
 assert.equal(anchored.baseline.closeAt,base-1);
 assert.equal(anchored.outcome,null);
 const targetAt=base+3*STEP;
 const wrong=bar(base+STEP,1.3,base+2*STEP+11000);
 assert.equal(evaluateDirectorTask(anchored,[baseline,wrong],{
  now:base+10*STEP}).outcome,null);
 const end=bar(targetAt,1.236,targetAt+STEP+10000);
 const evaluated=evaluateDirectorTask(anchored,[baseline,end],{now:base+5*STEP});
 assert.equal(evaluated.outcome.horizonAt,base+4*STEP-1);
 assert.equal(evaluated.outcome.deltaPct,3);
 assert.equal(summarizeDirectorTasks([evaluated]).marketOutcomes,1);
 assert.equal(summarizeDirectorTasks([evaluated]).modelAccuracy,null);
 const late=bar(base-STEP,1.2,base+20*STEP);
 assert.equal(evaluateDirectorTask(original,[late],{
  now:base+21*STEP}).baseline,null);
});
test('source code wires native-only periodic scan, explicit Qwen and Android packaging',()=>{
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const staged=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',
  import.meta.url),'utf8');
 const collective=readFileSync(new URL('./cloud-ai-collective.mjs',import.meta.url),'utf8');
 assert.match(app,/getRadar:getMobileRadarHistory/);
 assert.match(app,/getCandles:getMobileCandles/);
 assert.match(app,/if\(!document.hidden\)void researchDirector.scan\(\)/);
 assert.match(app,/onSession:session=>\{researchDirector.onCollectiveSession\(session\);researchHistory.ingest\(\[session\]\)/);
 assert.match(collective,/onSession\(session\)/);
 assert.match(staged,/'apex-research-director-core.mjs'/);
 assert.match(staged,/'apex-research-director-ui.mjs'/);
 for(const name of ['apex-director-tasks','apex-director-status',
  'apex-director-refresh','apex-director-summary'])
  assert.ok(html.includes('id="'+name+'"'));
});

test('director session replay is idempotent and cannot downgrade or overwrite reviewed work',()=>{
 const source={source_id:'binance:spot:24h:'+asset+':'+now,
  observed_at:now,text:'Original independently verified spot snapshot'};
 const session={version:1,asset,stage:'ANALYST_READY',startedAt:now,
  evidence:[source],sourceIds:[source.source_id],analystText:'A verified historical source is described.'};
 const rows=discoverResearchTasks(observations(),[asset],{now});
 const a=attachCollectiveResult(rows,session,{now,selectedId:rows[0].id});
 const finished={...session,stage:'COMPLETE',criticAt:now+300000,
  criticText:'Independent review of the historical observations.',criticEvidence:[source]};
 const b=attachCollectiveResult(a,finished,{now:now+300000});
 assert.equal(b.length,1);
 assert.equal(attachCollectiveResult(b,finished,{now:now+300000}),b);
 assert.equal(attachCollectiveResult(b,session,{now:now+300000,selectedId:b[0].id}),b);
 assert.equal(attachCollectiveResult(b,{...finished,analystText:'Conflicting replacement of the original.'},{now:now+300000}),b);
 const c=attachCollectiveResult(b,{...session,startedAt:now+600000},{now:now+600000,selectedId:b[0].id});
 assert.equal(c.length,2);
 assert.equal(c.find(x=>x.id===b[0].id).stage,'REVIEWED');
 assert.equal(summarizeDirectorTasks(c).distinctSessions,2);
});
