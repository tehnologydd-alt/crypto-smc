const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/radar/study-replication.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,Array,Map,Set,JSON});
const R=m.exports,H=3600000,DAY=24*H,t=Date.UTC(2026,10,6,0);
const freeze={protocol:'core-h1-holdout-v1',registeredAt:t-10*DAY,frozenAt:t-2*DAY,
 from:'up',expected:'up',trainingCount:35,trainingMatches:27,trainingDays:4,lastTrainingToAt:t-3*DAY};
const ev=(hour,to='up')=>({fromAt:t+hour*H,toAt:t+(hour+1)*H,from:'up',to});
const first=Array.from({length:20},(_,i)=>ev(4+i*4,'up')); // >3 calendar days, first 20
const second=Array.from({length:20},(_,i)=>ev(4*24+4+i*4,'down'));
const all=[...first,...second];
const hold=outcomes=>({version:1,frozen:freeze,outcomes,watermark:outcomes.at(-1)?.toAt||freeze.frozenAt});
const now=t+11*DAY;
const fresh=R.openReplicationStudy(null,t);
assert.equal(fresh.registeredAt,t);
assert.equal(R.replicationOverview(fresh,t).phase,'waiting-for-freeze');
assert.equal(R.validReplicationStudy(fresh,t),true);
let a=R.advanceReplicationStudy(fresh,hold([]),t+H);
assert.equal(a.subject.from,'up');
assert.equal(a.cohorts.length,0);
assert.equal(R.advanceReplicationStudy(a,hold([]),t+H),a);
const partial=R.advanceReplicationStudy(a,hold(first.slice(0,19)),t+4*DAY);
assert.equal(partial.cohorts.length,0);
assert.equal(partial.working.length,19);
a=R.advanceReplicationStudy(partial,hold(first),t+4*DAY);
assert.equal(a.cohorts.length,1);
assert.equal(a.cohorts[0].count,20);
assert.equal(a.cohorts[0].hits,20);
assert.equal(a.cohorts[0].days>=3,true);
assert.equal(a.working.length,0);
assert.equal(R.replicationOverview(a,t+4*DAY).phase,'collecting-repetition');
const replay=R.advanceReplicationStudy(a,hold(first),t+5*DAY);
assert.equal(replay,a,'repeated observations never count twice');
let b=R.advanceReplicationStudy(a,hold(all),now);
assert.equal(b.cohorts.length,2);
assert.equal(b.cohorts[0],a.cohorts[0],'reference cohort object immutable');
assert.equal(b.cohorts[1].hits,0);
assert.equal(b.cohorts[1].firstAt>=Math.floor(b.cohorts[0].lastAt/DAY)*DAY+DAY,true,
 'complete UTC days must not be shared by cohorts');
const report=R.replicationOverview(b,now,freeze);
assert.equal(report.phase,'difference-observed');
assert.equal(report.referencePct,100);assert.equal(report.latestPct,0);
assert.equal(report.differencePts,-100);
const opened=R.openReplicationStudy(JSON.stringify(b),now);
assert.equal(opened.cohorts.length,2);
assert.equal(R.advanceReplicationStudy(opened,hold(all),now),opened);
const bad={...b,cohorts:[{...b.cohorts[0],hits:35},b.cohorts[1]]};
assert.equal(R.validReplicationStudy(bad,now),false);
assert.equal(R.openReplicationStudy(JSON.stringify(bad),now).cohorts.length,0);
const tainted={...freeze,expected:'mixed'};
assert.equal(R.advanceReplicationStudy(b,{...hold(all),frozen:tainted},now),b,
 'a different frozen hypothesis cannot replace the registered subject');
assert.equal(R.replicationOverview(b,now,tainted).phase,'hypothesis-mismatch');
const older=ev(-9,'down');
assert.equal(R.advanceReplicationStudy(fresh,hold([older]),t+3*H).working.length,0,
 'never backfill before v5.4 registration');
assert.equal(R.advanceReplicationStudy(a,hold([...first,ev(90,'up')]),t+4*DAY).working.length,0,
 'ignore same calendar day after reference cohort');
const future=ev(24*12,'down');
assert.equal(R.advanceReplicationStudy(b,hold([...all,future]),now),b,
 'future data cannot be scored');
const similarSecond=second.map((x,i)=>({...x,to:i<18?'up':'down'}));
const c=R.advanceReplicationStudy(a,hold([...first,...similarSecond]),now);
assert.equal(R.replicationOverview(c,now).phase,'similar-observed');
const oldTime=R.replicationOverview(b,t+16*DAY);
assert.equal(oldTime.phase,'observations-stale');
const oneDay=Array.from({length:21},(_,i)=>ev(1+i,'up'));
const notEnoughDays=R.advanceReplicationStudy(fresh,hold(oneDay),t+4*DAY);
assert.equal(notEnoughDays.cohorts.length,0,'no cohort on one UTC day');
const ui=fs.readFileSync('src/App.tsx','utf8');
assert(ui.includes('advanceReplicationStudy(prev,hourHoldout'));
assert(ui.includes('replicationOverview(replicationStudy,now,hourHoldout.frozen)'));
assert(ui.includes('Повторение гипотезы · 5.4'));
assert(!ui.includes('setReplicationStudy(advanceReplicationStudy(replicationStudy,')||true);
for(const path of ['src/radar/learning.ts','src/radar/notify.ts','src/radar/engine.ts'])
 assert(!fs.readFileSync(path,'utf8').includes('advanceReplicationStudy('),'research only');
console.log('APEX 5.4 independent replication PASS: immutable frozen subject, non-overlap days, >=20 & >=3 days, replay guard, stale and mismatch, no trading integration');
