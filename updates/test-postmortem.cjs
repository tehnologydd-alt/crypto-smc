const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/radar/postmortem.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Number,Math,Array});
const {analyzePostmortem}=m.exports;
const mk=(i,status,votes,context=true,vol=1.2,tpReached=0)=>({
 id:'id'+i,symbol:'BTCUSDT',frame:'1h',direction:'LONG',createdAt:i+1000,
 status,stop:90,entry:100,targets:[110,120,130],tpReached,lastCandleTime:i+2000,
 contextCaptured:context,volumeRatio:context?vol:null,initialVotes:votes,reason:'x'});
const same={'5m':'LONG','1h':'LONG','4h':'LONG'};
const opposed={'5m':'LONG','1h':'LONG','4h':'SHORT'};
const rows=[mk(0,'PENDING',same),mk(1,'ACTIVE',same),mk(2,'TARGET',same,true,1.8,3),mk(3,'STOP',opposed,true,0.6,1),mk(4,'CANCELLED',same),mk(5,'EXPIRED',same),mk(6,'STOP',same,false,null,0)];
const r=analyzePostmortem({version:1,startedAt:1000,records:rows});
assert.equal(r.completed,3);assert.equal(r.tp3,1);assert.equal(r.stops,2);
assert.equal(r.stopAfterTp1,1);assert.equal(r.waiting,1);assert.equal(r.active,1);assert.equal(r.cancelled,1);assert.equal(r.expired,1);
const badH4=r.factors.find(x=>x.key==='h4-conflict');
assert.equal(badH4.total,1);assert.equal(badH4.stop,1);assert.equal(badH4.stopShare,null);
assert.equal(r.factors.find(x=>x.key==='no-snapshot').total,1);
assert.equal(r.latest.length,3);
const only=[...Array(15)].map((_,i)=>mk(100+i,'STOP',opposed,true,0.4));
const big=analyzePostmortem({version:1,startedAt:1000,records:only});
assert.equal(big.factors.find(x=>x.key==='h4-conflict').sampleAdequate,true);
assert.equal(big.factors.find(x=>x.key==='h4-conflict').stopShare,100);
const empty=analyzePostmortem({version:1,startedAt:1000,records:[mk(0,'TARGET',same)]});
assert.equal(empty.completed,0);
console.log('APEX 3.4 postmortem tests PASS: outcomes, TP1-then-stop, snapshots, small samples');
