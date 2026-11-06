const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(p,req=require){
 const js=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:req,Date,Map,Set,Math,Number,Array,JSON});
 return m.exports;
}
const core=load('src/radar/research-core.ts');
const research=load('src/radar/core-research.ts',id=>id==='./research-core'?core:require(id));
const now=Date.UTC(2026,10,6,12);
const f=['5m','1h','4h'];
function makeAsset(symbol,close=102,at=now){
 return {symbol,ready:true,frames:f.map(frame=>({frame,closedAt:at-1000,open:100,high:110,low:90,close,volume:20,
   rangeHigh:120,rangeLow:80,meanVolume:10,fresh:true}))};
}
const sample=(id=0,assets=core.CORE_SYMBOLS.map(x=>makeAsset(x)),at=now)=>({
 runAt:at+id*60000,finishedAt:at+id*60000+3000,source:'binance-spot-klines-v1',
 complete:true,readyAssets:5,assets
});
let archive=research.openCoreResearch(null,now);
assert.equal(archive.entries.length,0);
const t=now+30_000;
const one=research.appendCoreResearch(archive,[sample()],t);
assert.equal(one.entries.length,1);
assert.equal(one.entries[0].complete,true);
assert.equal(one.entries[0].direction,'mostly-up');
assert.equal(one.entries[0].assets[0].frames[0].relativeVolume,2);
assert.equal(research.appendCoreResearch(one,[sample()],t),one,'duplicate immutable');
let different=sample();different.assets[0].frames[0].close=30;
assert.equal(research.appendCoreResearch(one,[different],t),one,'same timestamp does not overwrite');
const damaged=sample(1,core.CORE_SYMBOLS.slice(0,4).map(x=>makeAsset(x)),now);
let two=research.appendCoreResearch(one,[damaged],now+100000);
assert.equal(two.entries.length,2);assert.equal(two.entries[1].complete,false);
const partial=sample(2,core.CORE_SYMBOLS.map((x,i)=>{
 const a=makeAsset(x);if(i===0)a.frames[0].closedAt=now+300000;return a;
}),now);
two=research.appendCoreResearch(two,[partial],now+170000);
assert.equal(two.entries[2].readyAssets,4);
assert.equal(two.entries[2].direction,'insufficient');
const fake={...sample(3),source:'other'};
assert.equal(research.normalizeCoreNative(fake,now+300000),null);
assert.equal(research.normalizeCoreNative(sample(10),now+300000),null,'future not ingested');
const cloned=research.openCoreResearch(JSON.stringify(two),now+170000);
assert.equal(cloned.entries.length,3);
const report=research.coreResearchReport(cloned,now+170000);
assert.equal(report.checks,3);
assert.equal(report.complete,1);
assert.equal(report.partial,2);
assert.equal(report.days.length,7);
assert.equal(report.days[6].checks,3);
assert.equal(report.days[5].checks,0,'empty day denotes missing observations, not synthetic data');
assert.equal(report.maxGapMinutes,1);
const stale=research.openCoreResearch(JSON.stringify(two),now+15*86400000);
assert.equal(stale.entries.length,0,'14-day retention');
const mismatched=sample(4,core.CORE_SYMBOLS.map(x=>makeAsset(x,98)),now);
const downward=research.normalizeCoreNative(mismatched,now+300000);
assert.equal(downward.direction,'mostly-down');
const mixed=sample(5,core.CORE_SYMBOLS.map((x,i)=>makeAsset(x,i<3?102:98)),now);
assert.equal(research.normalizeCoreNative(mixed,now+400000).direction,'mixed');
const ui=fs.readFileSync('src/App.tsx','utf8');
assert(ui.includes("openCoreResearch(localStorage.getItem('apex_v44_core_research')"));
assert(ui.includes('appendCoreResearch(prev,coreNative.samples'));
assert(ui.includes('coreResearchReport(coreResearch,now)'));
assert(ui.includes('CORE · архив наблюдений'));
assert(ui.includes("label:'Статистика'"));
assert(!fs.readFileSync('src/radar/learning.ts','utf8').includes('appendCoreResearch('),'Learning must stay separate');
console.log('APEX 4.4 observational archive PASS: provenance, immutable dedup, no lookahead, gap transparency, study separation');
