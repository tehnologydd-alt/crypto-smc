const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync('src/radar/context-study.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require,Date,Array,Math,Number});
const {captureMarketAtEntry,classifyContext,contextReport}=mod.exports;
const now=1_000_000;
const pulse={watched:5,eligible:5,bullish:3,bearish:1,conflict:0,partial:1,quiet:0,unavailable:0};
const good=captureMarketAtEntry(pulse,now-2000,now);assert.equal(good.regime,'up');
assert.equal(captureMarketAtEntry(pulse,now-11000,now),undefined,'no backfill');
assert.equal(captureMarketAtEntry(pulse,now+1000,now),undefined,'future time');
assert.equal(captureMarketAtEntry({...pulse,eligible:2},now,now),undefined,'too few valid assets');
assert.equal(captureMarketAtEntry({...pulse,bullish:0,bearish:0},now,now).regime,'quiet');
assert.equal(captureMarketAtEntry({...pulse,bullish:1,bearish:1},now,now).regime,'mixed');
const mk=(id,direction,status,marketContext,createdAt=now-500)=>({
 id,symbol:'BTCUSDT',frame:'1h',direction,status,createdAt,entry:100,stop:90,targets:[110,115,120],
 initialVotes:{'5m':'LONG','1h':'LONG','4h':'UNKNOWN'},contextCaptured:true,volumeRatio:1,
 marketContext,tpReached:0,lastCandleTime:now+1000,reason:'x'});
const rows=[
 mk('1','LONG','TARGET',good),
 mk('2','SHORT','STOP',good),
 mk('3','LONG','PENDING',good),
 mk('4','LONG','STOP',undefined),
 mk('5','SHORT','CANCELLED',{...good,regime:'mixed'}),
 mk('6','LONG','EXPIRED',{...good,regime:'quiet'})
];
const ledger={version:1,startedAt:now-900,records:rows};
const out=contextReport(ledger);
assert.equal(out.total,6);assert.equal(out.captured,5);assert.equal(out.missing,1);assert.equal(out.completed,3);
const aligned=out.groups.find(x=>x.kind==='with-pulse'),opposed=out.groups.find(x=>x.kind==='against-pulse');
assert.equal(aligned.tp3,1);assert.equal(aligned.waiting,1);assert.equal(opposed.stop,1);
assert.equal(aligned.tp3Share,null,'no dramatic percent on tiny sample');
assert.equal(classifyContext(rows[3]),'missing');
assert.equal(classifyContext(rows[5]),'quiet');
assert.equal(contextReport({...ledger,startedAt:now}).total,0,'legacy cohort excluded');
console.log('APEX 3.6 context tests PASS: contemporaneous snapshot, no backfill, categories, small-sample safeguards');
