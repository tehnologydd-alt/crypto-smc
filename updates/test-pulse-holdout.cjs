const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,req=require){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:req,Date,Array,Math,Number,JSON,Map,Set});
 return m.exports;
}
const context=load('src/radar/context-study.ts');
const temporal=load('src/radar/time-study.ts',id=>id==='./context-study'?context:require(id));
const H=load('src/radar/pulse-holdout.ts',id=>id==='./context-study'?context:id==='./time-study'?temporal:require(id));
const DAY=86400000,WEEK=7*DAY,trainStart=Date.UTC(2026,8,7),freezeAt=Date.UTC(2026,9,10),now=Date.UTC(2026,10,17);
let id=0;
const make=(week,dir,status)=>({
 id:'p'+id++,symbol:'BTCUSDT',frame:'1h',direction:dir,status,
 createdAt:week+DAY,entry:100,stop:90,targets:[110,115,120],
 initialVotes:{'5m':'LONG','1h':'LONG','4h':'LONG'},contextCaptured:true,volumeRatio:1,
 marketContext:{version:1,capturedAt:week+DAY+1000,watched:5,eligible:5,bullish:3,bearish:1,conflict:0,regime:'up'},
 tpReached:status==='TARGET'?3:0,lastCandleTime:week+DAY+2000,closedAt:status==='PENDING'?undefined:week+DAY+2000,reason:'study'
});
let rows=[];
function add(week,wTP,wSL,aTP,aSL){
 for(let i=0;i<wTP;i++)rows.push(make(week,'LONG','TARGET'));
 for(let i=0;i<wSL;i++)rows.push(make(week,'LONG','STOP'));
 for(let i=0;i<aTP;i++)rows.push(make(week,'SHORT','TARGET'));
 for(let i=0;i<aSL;i++)rows.push(make(week,'SHORT','STOP'));
}
for(let i=0;i<3;i++)add(trainStart+i*WEEK,25,5,5,25);
const led=()=>({version:1,startedAt:trainStart-100,records:rows});
assert.equal(H.freezePulseHoldout(led(),trainStart+4*DAY).pulseHoldout,undefined);
const frozen=H.freezePulseHoldout(led(),freezeAt);
assert(frozen.pulseHoldout);assert.equal(frozen.pulseHoldout.expected,'with-pulse');
assert.equal(H.freezePulseHoldout(frozen,freezeAt+WEEK),frozen,'immutable hypothesis');
assert.equal(H.pulseHoldoutReport(frozen,freezeAt).futureTotal,0);
const partial=make(Date.UTC(2026,9,5),'LONG','TARGET');partial.createdAt=freezeAt+100;
rows.push(partial);
for(let i=0;i<3;i++)add(Date.UTC(2026,9,12)+i*WEEK,25,5,5,25);
const registered={...led(),pulseHoldout:frozen.pulseHoldout};
let report=H.pulseHoldoutReport(registered,now);
assert.equal(report.verdict,'repeated');assert.equal(report.eligibleWeeks,3);
assert.equal(report.testedWeeks,3);assert.equal(report.futureTotal,180);
assert.equal(H.pulseHoldoutReport(registered,freezeAt+WEEK).testedWeeks,0,'no premature results');
const reversed=rows.map(r=>(r.createdAt>=Date.UTC(2026,9,26)&&r.createdAt<Date.UTC(2026,10,2)&&r.status!=='PENDING')?
 {...r,status:r.status==='TARGET'?'STOP':'TARGET'}:r);
report=H.pulseHoldoutReport({...registered,records:reversed},now);
assert.equal(report.verdict,'not-repeated');
const pendingRows=[];
for(let i=0;i<12;i++)pendingRows.push(make(Date.UTC(2026,9,12),'LONG','PENDING'));
report=H.pulseHoldoutReport({...registered,records:[...rows,...pendingRows]},now);
assert.equal(report.verdict,'collecting','unresolved scenarios must reduce coverage');
assert.equal(H.pulseHoldoutReport(led(),now).verdict,'not-frozen');
assert.equal(H.pulseHoldoutReport(registered,NaN).verdict,'not-frozen');
console.log('APEX 3.9 holdout tests PASS (frozen hypothesis, full-week future cohorts, maturity, no look-ahead, coverage)');
