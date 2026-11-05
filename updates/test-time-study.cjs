const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,localRequire=require){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:localRequire,Date,Array,Math,Number,JSON,Map,Set});
 return m.exports;
}
const context=load('src/radar/context-study.ts');
const {utcWeekStart,temporalReport}=load('src/radar/time-study.ts',id=>id==='./context-study'?context:require(id));
const WEEK=604800000,now=Date.UTC(2026,10,5,12),createdBase=Date.UTC(2026,9,5,12);
assert.equal(utcWeekStart(Date.UTC(2026,10,1)),Date.UTC(2026,9,26));
assert.equal(utcWeekStart(Date.UTC(2026,10,2)),Date.UTC(2026,10,2));
const mk=(id,t,dir,status,regime='up')=>({
 id,symbol:'BTCUSDT',frame:'1h',direction:dir,status,createdAt:t,
 entry:100,stop:90,targets:[110,115,120],initialVotes:{'5m':'LONG','1h':'LONG','4h':'LONG'},
 contextCaptured:true,volumeRatio:1,marketContext:{version:1,regime,capturedAt:t,watched:5,eligible:5,bullish:3,bearish:1,conflict:0},
 tpReached:status==='TARGET'?3:0,lastCandleTime:t+100,reason:'test',closedAt:t+1000
});
let rows=[];let seq=0;
function addWeek(start,alignedTP,alignedStop,opposedTP,opposedStop){
 for(let n=0;n<alignedTP;n++)rows.push(mk('r'+seq++,start+1000,'LONG','TARGET'));
 for(let n=0;n<alignedStop;n++)rows.push(mk('r'+seq++,start+1000,'LONG','STOP'));
 for(let n=0;n<opposedTP;n++)rows.push(mk('r'+seq++,start+1000,'SHORT','TARGET'));
 for(let n=0;n<opposedStop;n++)rows.push(mk('r'+seq++,start+1000,'SHORT','STOP'));
}
for(let i=0;i<3;i++)addWeek(createdBase+i*WEEK,25,5,5,25);
const ledger=()=>({version:1,startedAt:Date.UTC(2026,8,1),records:rows});
let out=temporalReport(ledger(),now);
assert.equal(out.comparableWeeks,3);
assert.equal(out.pattern,'repeated-with');
assert.equal(out.weeks.filter(x=>x.comparable).length,3);
assert.equal(out.weeks[0].withPulse.tp3Pct,100*25/30);
const beforeCount=rows.length;
addWeek(Date.UTC(2026,9,26,12),0,30,30,0); // Recent week is not mature yet.
out=temporalReport(ledger(),now);
assert.equal(out.pattern,'repeated-with');
assert(out.weeks[0].mature===false);
rows.push(mk('old',Date.UTC(2026,7,1),'LONG','TARGET')); // Before activation.
rows.push(mk('future',now+10000,'LONG','TARGET')); // No look-ahead.
assert.equal(temporalReport(ledger(),now).weeks.reduce((s,w)=>s+w.total,0),rows.length-2);
rows=rows.map(r=>r.createdAt===createdBase+2*WEEK+1000?{...r,status:r.direction==='LONG'?(r.status==='TARGET'?'STOP':'TARGET'):(r.status==='TARGET'?'STOP':'TARGET')}:r);
out=temporalReport(ledger(),now);
assert.equal(out.pattern,'variable');
const week=createdBase;
for(let i=0;i<11;i++)rows.push(mk('pending'+i,week+1000,'LONG','PENDING'));
out=temporalReport(ledger(),now);
assert.equal(out.comparableWeeks,2);
assert.equal(out.pattern,'insufficient');
assert.equal(temporalReport({version:1,startedAt:now,records:[]},now).pattern,'insufficient');
assert.equal(temporalReport(ledger(),NaN).weeks.length,0);
console.log('APEX 3.8 temporal validation PASS (UTC cohorts, no look-ahead, maturity, coverage, repeated/variable patterns)');
