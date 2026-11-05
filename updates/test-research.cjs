const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/radar/research.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleRef={exports:{}};vm.runInNewContext(js,{module:moduleRef,exports:moduleRef.exports,require,Date,Map,Set,Number,Math,JSON});
const R=moduleRef.exports;
const day=86400000,begin=day*200;
const make=(id,d,symbol,status,volume,frame='1h',opposite=false)=>({
 id,symbol,frame,direction:'LONG',createdAt:begin+d*day+10,entry:100,stop:95,
 targets:[105,108,112],contextCaptured:true,initialVotes:{'5m':'LONG','1h':'LONG','4h':opposite?'SHORT':'LONG'},
 volumeRatio:volume,status,tpReached:status==='TARGET'?3:0,lastCandleTime:begin+d*day+80000
});
const training=[];
for(let i=0;i<60;i++){
 const withHigh=i%2===0;
 training.push(make('tr'+i,i,['BTCUSDT','ETHUSDT','SOLUSDT'][i%3],withHigh?'TARGET':'STOP',withHigh?1.8:0.6,'1h',!withHigh));
}
const now=begin+90*day;
const ledger={version:1,startedAt:begin-1,records:training};
assert.equal(R.independentOutcomes(training,now).length,60);
assert.equal(R.freezeResearch(null,{...ledger,records:training.slice(0,59)},now),null,'minimum training');
const study=R.freezeResearch(null,ledger,now);assert(study);assert.equal(study.trainingCount,60);
assert(study.rules.length>0);assert(R.studyFromStorage(JSON.stringify(study)));
assert.equal(R.freezeResearch(study,{...ledger,records:[]},now),study,'training may not be refit');
const before=R.researchReport(ledger,study,now);assert.equal(before.futureCount,0);
const held=[];
for(let i=0;i<28;i++){
 const isHigh=i%2===0;
 held.push(make('hold'+i,110+i,['ADAUSDT','XRPUSDT'][i%2],isHigh?'TARGET':'STOP',isHigh?1.7:0.6,'1h',!isHigh));
}
const lateOld={...make('lateOld',20,'AVAXUSDT','TARGET',1.8),closedAt:begin+130*day};
const final={...ledger,records:[...training,...held,lateOld]};
const report=R.researchReport(final,study,begin+160*day);
assert.equal(report.futureCount,28,'late closure is not a future CREATED signal');
assert(report.checks.some(x=>x.state==='consistent'));
assert(report.checks.some(x=>x.rule.trainEffect>0&&x.effect!==null&&x.effect>0));
const reversed=held.map((x,i)=>({...x,status:i%2===0?'STOP':'TARGET'}));
const opposite=R.researchReport({...ledger,records:[...training,...reversed]},study,begin+160*day);
assert(opposite.checks.some(x=>x.state==='not-repeated'));
const collinear=[make('a',1,'BTCUSDT','TARGET',2),make('b',1,'BTCUSDT','STOP',2)];
assert.equal(R.independentOutcomes(collinear,now).length,1);
assert.equal(R.researchReport(ledger,null,now).needed,0);
assert.equal(R.studyFromStorage('bad'),null);
console.log('APEX 3.1 prospective research tests PASS: freeze, holdout, no lookahead, clustering, negative validation');
