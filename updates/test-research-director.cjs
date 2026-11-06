const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/radar/research-director.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Number,Math,Array,JSON});
const D=m.exports,now=Date.UTC(2026,10,6,13),day=86400000;
const base={
 passport:{state:'descriptive-only',studyAligned:true,flags:[],checksReady:5,checksTotal:5,registeredAt:now-4*day,lastObservedAt:now-3600000},
 core:{checks:150,complete:140,partial:10},
 transitions:{observations:120,transitions:100,missingHours:2},
 holdout:{frozen:true,status:'observational-comparison',futureEdges:30,conditionDays:4},
 drift:{phase:'no-clear-decline'},
 context:{state:'no-clear-difference',qualified:2}
};
const id=x=>D.researchDirector(x).focus.id;
const clone=x=>JSON.parse(JSON.stringify(x));
assert.equal(id(base),'replication','all ready -> independent future replication');
assert.equal(id({...base,passport:{...base.passport,studyAligned:false}}),'integrity');
assert.equal(id({...base,passport:{...base.passport,state:'observations-stale'}}),'freshness');
assert.equal(id({...base,core:{checks:50,complete:20,partial:30}}),'raw-quality');
assert.equal(id({...base,transitions:{observations:10,transitions:5,missingHours:15}}),'h1-coverage');
assert.equal(id({...base,holdout:{frozen:false,status:'collecting-training'}}),'hypothesis');
assert.equal(id({...base,holdout:{frozen:true,status:'collecting-future',futureEdges:8,conditionDays:1}}),'holdout');
assert.equal(id({...base,drift:{phase:'possible-decline'}}),'drift-change');
assert.equal(id({...base,context:{state:'context-dependent',qualified:2}}),'context-change');
assert.equal(id({...base,drift:{phase:'collecting-recent'}}),'drift-coverage');
assert.equal(id({...base,context:{state:'need-variety',qualified:1}}),'context-coverage');
const critical=D.researchDirector({...base,passport:{...base.passport,state:'observations-stale',studyAligned:false}});
assert.equal(critical.focus.id,'integrity','data mismatch beats stale');
assert.equal(critical.alternatives[0].id,'freshness');
assert.equal(critical.alternatives.length,2);
assert.equal(critical.researchOnly,true);
const before=JSON.stringify(base);D.researchDirector(base);assert.equal(JSON.stringify(base),before,'director must be read-only');
const a=D.researchDirector(base),b=D.researchDirector(clone(base));
assert.equal(a.signature,b.signature,'deterministic ranking');
assert.equal(a.focus.acceptance.length>20,true);
assert.equal(a.focus.question.length>20,true);
let journal=D.openDirectorHistory(null,now);
journal=D.recordDirectorDecision(journal,a,now);
assert.equal(journal.events.length,1);
assert.equal(D.recordDirectorDecision(journal,a,now+60000),journal,'no logging on repeated observations');
journal=D.recordDirectorDecision(journal,critical,now+120000);
assert.equal(journal.events.length,2);
assert.equal(journal.events[0].title,'Подтвердить воспроизводимость в новом периоде');
let recovered=D.openDirectorHistory(JSON.stringify(journal),now+120000);
assert.equal(recovered.events.length,2);
const spoofed=D.openDirectorHistory(JSON.stringify({version:1,events:[...journal.events,{...journal.events[1],title:'Необъяснённая команда'}]}),now+120000);
assert.equal(spoofed.events.length,2,'no injected journal actions');
const future=D.openDirectorHistory(JSON.stringify({version:1,events:[{...journal.events[1],at:now+day}]}),now);
assert.equal(future.events.length,0,'never accept history from future');
const src=fs.readFileSync('src/App.tsx','utf8');
assert(src.includes('researchDirector('));
assert(src.includes('recordDirectorDecision(prev,directorPlan'));
assert(src.includes('Research Director · 5.0'));
assert(src.includes("openDirectorHistory(localStorage.getItem('apex_v50_director_log')"));
for(const path of ['src/radar/learning.ts','src/radar/notify.ts','src/radar/engine.ts']){
 assert(!fs.readFileSync(path,'utf8').includes('researchDirector('),'director must not enter any execution or signaling module');
}
console.log('APEX 5.0 Research Director PASS: deterministic priorities, clear evidence criteria, immutable input, no alert/trade wiring, bounded deduplicated decisions');
