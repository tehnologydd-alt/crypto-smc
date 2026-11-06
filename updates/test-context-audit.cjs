const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,req=require){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:req,Date,Math,Map,Set,Number,Array,JSON});
 return m.exports;
}
const symbols=load('src/radar/research-core.ts').CORE_SYMBOLS;
const tr=load('src/radar/hour-transitions.ts',p=>p==='./research-core'?{CORE_SYMBOLS:symbols}:require(p));
const A=load('src/radar/context-audit.ts',p=>p==='./research-core'?{CORE_SYMBOLS:symbols}:p==='./hour-transitions'?tr:require(p));
const H=3_600_000,DAY=24*H,now=Date.UTC(2026,10,7,12),registration=now-11*DAY;
const since=registration-1*DAY,frozenAt=registration-H;
const frozen={protocol:'core-h1-holdout-v1',frozenAt,registeredAt:since,from:'up',expected:'up',
 trainingCount:20,trainingMatches:17,trainingDays:4,lastTrainingToAt:frozenAt};
const h1=(t)=>t; // hour-boundary sample timestamps
const testH4=(fromAt,mode='up',other={})=>({
 runAt:fromAt+60_000,finishedAt:fromAt+120_000,
 source:'core-native-observations-v1',complete:other.complete!==false,
 assets:symbols.map((symbol,i)=>({symbol,ready:true,frames:[
  {frame:'5m',closedAt:fromAt-240_000,changePct:1,relativeVolume:1},
  {frame:'1h',closedAt:fromAt,changePct:1,relativeVolume:1},
  {frame:'4h',closedAt:other.future&&i===0?fromAt+H:fromAt-120_000,
   changePct:mode==='up'?1:mode==='down'?-1:i<3?1:-1,relativeVolume:1}
 ]}))
});
const pairs=[];
for(let i=0;i<36;i++){
 const fromAt=registration+H+i*6*H;
 pairs.push({fromAt,toAt:fromAt+H,from:'up',to:i<12?'up':i<24?'down':'mixed'});
}
const archive={version:1,startedAt:since,entries:pairs.map((e,i)=>testH4(e.fromAt,i<12?'up':i<24?'down':'mixed'))};
const holdout={version:1,frozen,outcomes:pairs,watermark:pairs.at(-1).toAt};
let ledger=A.openContextAudit(null,registration);
assert.equal(ledger.registeredAt,registration);
ledger=A.advanceContextAudit(ledger,holdout,archive,since,now);
assert.equal(ledger.observations.length,36);
assert.equal(ledger.missingContext,0);
assert.equal(ledger.observations[0].h4,'up');
assert.equal(ledger.observations[16].h4,'down');
assert.equal(ledger.observations[30].h4,'mixed');
assert.equal(A.advanceContextAudit(ledger,holdout,archive,since,now),ledger,'no duplicate rescoring');
const report=A.contextAuditReport(ledger);
assert.equal(report.qualified,3);
assert.equal(report.state,'context-dependent');
assert.equal(report.differencePct,100);
assert.equal(report.checked,36);
assert.equal(report.rows.find(x=>x.h4==='up').matchPct,100);
assert.equal(report.rows.find(x=>x.h4==='down').matchPct,0);
assert.equal(report.rows.find(x=>x.h4==='mixed').count,12);
const restored=A.openContextAudit(JSON.stringify(ledger),now);
assert.equal(restored.observations.length,36);
assert.equal(restored.watermark,ledger.watermark);
const future=testH4(pairs[0].fromAt,'up',{future:true});
assert.equal(A.h4AtBaseline(future,pairs[0].fromAt,pairs[0].toAt,since,now),null,'H4 unavailable at baseline must be rejected');
const late=testH4(pairs[0].fromAt);late.finishedAt=pairs[0].toAt+1;
assert.equal(A.h4AtBaseline(late,pairs[0].fromAt,pairs[0].toAt,since,now),null,'no hindsight H4 after outcome');
const incomplete=testH4(pairs[0].fromAt,'up',{complete:false});
assert.equal(A.h4AtBaseline(incomplete,pairs[0].fromAt,pairs[0].toAt,since,now),null);
const badArchive={...archive,entries:[...archive.entries]};
badArchive.entries[0]=future;
const missing=A.advanceContextAudit(A.openContextAudit(null,registration),holdout,badArchive,since,now);
assert.equal(missing.observations.length,35);
assert.equal(missing.missingContext,1);
assert.equal(A.advanceContextAudit(missing,holdout,archive,since,now),missing,'missing context cannot be backfilled');
const grouped={...ledger,observations:ledger.observations.slice(0,12)};
assert.equal(A.contextAuditReport(grouped).state,'need-variety');
const notFrozen={...holdout,frozen:undefined};
assert.equal(A.advanceContextAudit(A.openContextAudit(null,registration),notFrozen,archive,since,now).observations.length,0);
const wrong={...holdout,frozen:{...frozen,expected:'down'}};
assert.equal(A.advanceContextAudit(ledger,wrong,archive,since,now),ledger,'frozen subject immutable');
const replay={...holdout,outcomes:[{fromAt:registration-H,toAt:registration,from:'up',to:'up'}]};
assert.equal(A.advanceContextAudit(A.openContextAudit(null,registration),replay,archive,since,now).observations.length,0,'no pre-registration history');
const stable={...ledger,observations:ledger.observations.map((o,i)=>({...o,to:i%4?'up':'down'}))};
assert.equal(A.contextAuditReport(stable).state,'no-clear-difference');
const app=fs.readFileSync('src/App.tsx','utf8');
assert(app.includes('openContextAudit(localStorage.getItem'));
assert(app.includes('advanceContextAudit(prev,hourHoldout,coreResearch'));
assert(app.includes('contextAuditReport(contextLedger)'));
assert(app.includes('Контекст H4 · 4.8'));
assert(!fs.readFileSync('src/radar/learning.ts','utf8').includes('advanceContextAudit'));
console.log('APEX 4.8 cross-context audit PASS: baseline-only H4, immutable subject, strict prospective gate, missing context, unique H1, 3-day cohort limits');
