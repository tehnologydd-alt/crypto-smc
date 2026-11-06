const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const js=ts.transpileModule(fs.readFileSync('src/radar/core-quality-passport.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Number,Math,Array,JSON});
const P=m.exports,DAY=86400000,now=Date.UTC(2026,10,6,15),registeredAt=now-12*DAY;
const subject={frozenAt:registeredAt+5*DAY,from:'up',expected:'up'};
const ready={
 core:{checks:160,complete:150,partial:10,latestFullAt:now-3600000},
 transitions:{registeredAt,observations:120,transitions:110,missingHours:2,newestAt:now-3600000},
 holdout:{frozen:true,frozenAt:subject.frozenAt,from:'up',expected:'up',futureEdges:28,conditionDays:5,
  differenceToTraining:-8,differenceToBaseline:3,status:'observational-comparison',latestToAt:now-3600000},
 drift:{phase:'no-clear-decline',subject,lastObservedAt:now-3600000},
 context:{state:'no-clear-difference',qualified:2,checked:35,latestAt:now-3600000},
 contextSubject:subject
};
let r=P.coreQualityPassport(ready,now);
assert.equal(r.state,'descriptive-only');
assert.equal(r.items.length,5);
assert.equal(r.checksReady,5);
assert.equal(r.studyAligned,true);
assert(!r.title.includes('доказана'),'no unsupported certainty');
assert.equal(P.coreQualityPassport({...ready,holdout:{...ready.holdout,frozen:false}},now).state,'awaiting-evidence');
const stale=P.coreQualityPassport({...ready,core:{...ready.core,latestFullAt:now-4*DAY},
 transitions:{...ready.transitions,newestAt:now-4*DAY},holdout:{...ready.holdout,latestToAt:now-4*DAY},
 drift:{...ready.drift,lastObservedAt:now-4*DAY},context:{...ready.context,latestAt:now-4*DAY}},now);
assert.equal(stale.state,'observations-stale');
assert.equal(P.coreQualityPassport({...ready,drift:{...ready.drift,phase:'possible-decline'}},now).state,'needs-review');
assert.equal(P.coreQualityPassport({...ready,context:{...ready.context,state:'context-dependent',qualified:2}},now).state,'needs-review');
assert.equal(P.coreQualityPassport({...ready,holdout:{...ready.holdout,differenceToTraining:-27}},now).state,'needs-review');
assert.equal(P.coreQualityPassport({...ready,holdout:{...ready.holdout,differenceToBaseline:-23}},now).state,'needs-review');
assert.equal(P.coreQualityPassport({...ready,core:{...ready.core,checks:160,complete:90,partial:70}},now).state,'data-limited');
assert.equal(P.coreQualityPassport({...ready,transitions:{...ready.transitions,missingHours:90}},now).state,'data-limited');
assert.equal(P.coreQualityPassport({...ready,context:{...ready.context,state:'need-variety',qualified:1}},now).state,'awaiting-evidence');
assert.equal(P.coreQualityPassport({...ready,holdout:{...ready.holdout,futureEdges:7,status:'collecting-future'}},now).state,'awaiting-evidence');
const wrong=P.coreQualityPassport({...ready,contextSubject:{...subject,expected:'down'}},now);
assert.equal(wrong.studyAligned,false);
assert.equal(wrong.state,'data-limited');
assert.equal(wrong.items.find(x=>x.id==='h4').state,'pending');
const absent=P.coreQualityPassport({...ready,holdout:{...ready.holdout,frozen:false},core:{...ready.core,checks:0,complete:0,partial:0}},now);
assert.equal(absent.items.find(x=>x.id==='capture').state,'pending');
const orig=JSON.stringify(ready);
P.coreQualityPassport(ready,now);assert.equal(JSON.stringify(ready),orig,'read-only aggregation');
const app=fs.readFileSync('src/App.tsx','utf8');
assert(app.includes('coreQualityPassport('));
assert(app.includes('researchQualityStats'));
assert(app.includes('Паспорт исследования · 4.9'));
assert(!fs.readFileSync('src/radar/learning.ts','utf8').includes('coreQualityPassport('));
assert(!fs.readFileSync('src/radar/notify.ts','utf8').includes('coreQualityPassport('));
console.log('APEX 4.9 research quality passport PASS: read-only, stale, contradictory sources, data gaps, holdout, drift and H4 context safeguards');
