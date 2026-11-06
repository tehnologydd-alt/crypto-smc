const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/radar/research-council.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Math,Array,Number,Date,JSON,Map,Set});
const A=m.exports,now=Date.UTC(2026,10,6,13),DAY=86400000;
const base={
 passport:{state:'descriptive-only',studyAligned:true,flags:[]},
 core:{checks:100,complete:94,partial:6,latestAt:now-3600000},
 transitions:{observations:105,transitions:99,missingHours:2,newestAt:now-3600000},
 holdout:{frozen:true,status:'observational-comparison',futureEdges:38,conditionDays:6,differenceToTraining:-4,differenceToBaseline:2},
 drift:{phase:'no-clear-decline'},
 context:{state:'no-clear-difference',qualified:2},
 replication:{phase:'similar-observed',completed:2,differencePts:4},
 directorFocus:'replication'
};
const clone=x=>JSON.parse(JSON.stringify(x)),out=x=>A.researchCouncil(x,now);
let r=out(base);
assert.equal(r.state,'descriptive');
assert.equal(r.readyCount,3);
assert.equal(r.auditors.length,3);
assert.deepEqual(r.auditors.map(x=>x.role).join(','),'data,pattern,challenge');
assert(r.decision.includes('описательные'));
assert.equal(r.researchOnly,true);
assert.equal(r.priorityGap,false);
const dataFail={...base,core:{checks:100,complete:20,partial:80}};
r=out(dataFail);assert.equal(r.state,'review');assert.equal(r.auditors[0].state,'caution');assert.equal(r.priorityGap,true);
r=out({...dataFail,directorFocus:'raw-quality'});assert.equal(r.priorityGap,false);
r=out({...base,passport:{...base.passport,studyAligned:false}});
assert.equal(r.state,'blocked');assert.equal(r.reviewCount,2);assert.equal(r.priorityGap,true);
assert(r.decision.includes('Остановить'));
r=out({...base,passport:{...base.passport,studyAligned:false},directorFocus:'integrity'});assert.equal(r.priorityGap,false);
r=out({...base,holdout:{...base.holdout,frozen:false,futureEdges:0}});
assert.equal(r.state,'collecting');assert.equal(r.auditors[1].state,'pending');
r=out({...base,replication:{...base.replication,phase:'hypothesis-mismatch'}});
assert.equal(r.state,'blocked');assert.equal(r.auditors[1].state,'blocked');
r=out({...base,replication:{phase:'collecting-repetition',completed:1,differencePts:null}});
assert.equal(r.state,'collecting');
r=out({...base,replication:{phase:'difference-observed',completed:2,differencePts:-35}});
assert.equal(r.state,'review');assert.equal(r.auditors[1].state,'caution');assert.equal(r.auditors[2].state,'caution');
r=out({...base,drift:{phase:'possible-decline'}});
assert.equal(r.state,'review');assert.equal(r.auditors[2].state,'caution');
r=out({...base,context:{state:'context-dependent',qualified:2}});
assert.equal(r.state,'review');assert.equal(r.auditors[2].state,'caution');
r=out({...base,transitions:{...base.transitions,newestAt:now-4*DAY}});
assert.equal(r.auditors[0].state,'caution');assert.equal(r.state,'review');
r=out({...base,context:{state:'need-variety',qualified:1}});
assert.equal(r.auditors[2].state,'pending');assert.equal(r.state,'collecting');
const before=JSON.stringify(base);out(base);assert.equal(JSON.stringify(base),before,'pure observational output');
assert.equal(JSON.stringify(out(base)),JSON.stringify(out(clone(base))),'deterministic');
const app=fs.readFileSync('src/App.tsx','utf8');
assert(app.includes('researchCouncil({passport:researchQualityStats'));
assert(app.includes('Коллектив исследований · 5.5'));
assert(!app.includes('setCouncilExpanded'),'no extra nested accordion');
for(const path of ['src/radar/learning.ts','src/radar/notify.ts','src/radar/engine.ts'])
 assert(!fs.readFileSync(path,'utf8').includes('researchCouncil('),'auditors never wired to signal or trading execution');
console.log('APEX 5.5 research council PASS: three independent audit rules, quality veto, evidence dissent, immutable studies, deterministic decision, no new UI nesting');
