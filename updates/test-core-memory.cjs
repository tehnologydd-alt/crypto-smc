const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,customRequire=require){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:customRequire,Date,Number,Math,Map,Set,Array,JSON});
 return m.exports;
}
const reports=load('src/radar/research-reports.ts');
const M=load('src/radar/core-memory.ts',x=>x==='./research-reports'?reports:require(x));
const H=3600000,DAY=24*H,now=Date.UTC(2026,10,12,15),registered=Date.UTC(2026,10,4,3);
const empty=M.openCoreMemory(null,registered),state={...empty};
const e=(i,from='up',to='down')=>({fromAt:registered+H+i*H,toAt:registered+(i+2)*H,from,to});
const observations=[e(1),e(2),e(3)];
const core=(day)=>{
 const d=Date.UTC(2026,10,day);
 return [
  {source:'core-native-observations-v1',runAt:d+10*H,finishedAt:d+10*H+1000,complete:true},
  {source:'core-native-observations-v1',runAt:d+12*H,finishedAt:d+12*H+1000,complete:false}
 ];
};
const reviews={version:1,reports:[]};
const data={core:{version:1,startedAt:registered-H,entries:[...core(5),...core(6),...core(12)]},
 transitions:observations,context:{version:1,observations:[{fromAt:observations[0].fromAt,toAt:observations[0].toAt,to:'down',h4:'up',h4ClosedAt:registered-4*H}]},
 reviews};
const first=M.appendCoreMemory(empty,data,now);
assert.equal(first.h1.length,3);
assert.equal(first.h4.length,1);
assert.equal(first.days.length,2,'completed days only, not current day');
assert.equal(first.days[0].checks,2);
assert.equal(first.days[0].partial,1);
assert.equal(M.appendCoreMemory(first,data,now),first,'no repeated ingestion');
const out=M.exportCoreMemory(first,now);
const read=M.importCoreMemory(out,now);
assert.equal(read.kind,'apex-core-memory-v1');
assert.equal(read.payload.h1.length,3);
assert.equal(M.openCoreMemory(JSON.stringify(first),now).days.length,2);
assert.throws(()=>M.importCoreMemory(out.replace('"checks": 2','"checks": 3'),now),/повреждённые|сумма/);
assert.throws(()=>M.importCoreMemory(out.replace('"checksum": "',' "checksum": "0'),now),/сумма/);
assert.throws(()=>M.importCoreMemory(JSON.stringify({...JSON.parse(out),version:2}),now),/Неизвестная/);
const second=M.openCoreMemory(null,now-1);
const merged=M.mergeCoreMemory(second,read,now);
assert.equal(merged.h1.length,3);
assert.equal(merged.days.length,2);
assert.equal(M.mergeCoreMemory(merged,read,now).h1.length,3,'idempotent merge');
const overlapping=M.openCoreMemory(null,registered);
const corrupt={...first,h1:first.h1.map((x,i)=>i===0?{...x,to:'up'}:x)};
assert(M.validateCoreMemory(corrupt,now));
const altered=M.importCoreMemory(M.exportCoreMemory(corrupt,now),now);
assert.throws(()=>M.mergeCoreMemory(first,altered,now),/Конфликт/);
const wrongCtx={...first,h4:[{...first.h4[0],to:'up'}]};
assert.equal(M.validateCoreMemory(wrongCtx,now),false,'H1/H4 consistency check');
assert.equal(M.openCoreMemory(JSON.stringify(wrongCtx),now).h1.length,0,'corrupt archive rejected whole');
const previous={...data,transitions:[e(-60)]};
assert.equal(M.appendCoreMemory(empty,previous,now).h1.length,0,'no backfill before version registration');
const overlap={...data,transitions:[e(1),{...e(1),to:'up'}]};
assert.throws(()=>M.appendCoreMemory(empty,overlap,now),/Конфликт/,'duplicate conflict halts ingestion');
const archiveInput=JSON.stringify(data);
M.appendCoreMemory(empty,data,now);
assert.equal(JSON.stringify(data),archiveInput,'no mutation of original data');
const stats=M.coreMemoryStats(first);
assert.equal(stats.days,2);assert.equal(stats.transitions,3);
const app=fs.readFileSync('src/App.tsx','utf8');
assert(app.includes('appendCoreMemory(coreMemory'));
assert(app.includes('mergeCoreMemory('));
assert(app.includes('exportCoreMemory('));
assert(app.includes("writeResearchBackup(content,'APEX-CORE-Memory')"));
assert(app.includes('Долговременная память · 5.3'));
assert(app.includes('setCoreMemory(merged)'));
const native=fs.readFileSync('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java','utf8');
assert(native.includes('apex-core-memory-v1'));
assert(native.includes('CORE-Memory'));
for(const f of ['src/radar/learning.ts','src/radar/notify.ts','src/radar/engine.ts'])assert(!fs.readFileSync(f,'utf8').includes('appendCoreMemory'));
console.log('APEX 5.3 CORE Memory PASS: immutable facts, completed UTC days, no historical backfill, integrity & conflict rejection, safe merge, Android file bridge');
