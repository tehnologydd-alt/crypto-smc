const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(path,resolve=require){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:resolve,Date,Number,Math,Set,Map,Array});
 return m.exports;
}
const symbols=load('src/radar/research-core.ts').CORE_SYMBOLS;
const T=load('src/radar/hour-transitions.ts',p=>p==='./research-core'?{CORE_SYMBOLS:symbols}:require(p));
const H=3600000,base=Date.UTC(2026,10,6,13),since=base-H,now=base+8*H;
let seq=0;
function entry(stamp,regime,options={}){
 const id=seq++,finishedAt=stamp+120000+id,runAt=stamp+60000+id;
 return {runAt,finishedAt,complete:options.complete!==false,source:'core-native-observations-v1',
  assets:symbols.map((symbol,i)=>({symbol,ready:true,frames:['5m','1h','4h'].map(frame=>({
   frame,closedAt:frame==='1h'?(options.mismatch&&i===0?stamp-H:stamp):stamp-5000,
   changePct:regime==='up'?1:regime==='down'?-1:i<3?1:-1,relativeVolume:1.2
  }))}))};
}
const before=entry(base-2*H,'down');
const e0=entry(base,'up'),e1=entry(base+H,'up'),e2=entry(base+2*H,'mixed'),e4=entry(base+4*H,'down'),e5=entry(base+5*H,'down');
let archive={version:1,startedAt:since-H,entries:[before,e0,e1,e2,e4,e5]};
const result=T.hourTransitions(archive,since,now);
assert.equal(result.observations,5,'no history before registration');
assert.equal(result.transitions,3,'only consecutive closed hours');
assert.equal(result.missingHours,1,'missing hour is explicit');
assert.equal(result.rows.find(x=>x.from==='up').total,2);
assert.equal(result.rows.find(x=>x.from==='up').up,1);
assert.equal(result.rows.find(x=>x.from==='up').mixed,1);
assert.equal(result.rows.find(x=>x.from==='down').down,1);
assert.equal(result.rows.find(x=>x.from==='down').persistencePct,100);
assert.equal(result.rows.find(x=>x.from==='down').status,'limited');
const dup=entry(base+H,'down');
archive={...archive,entries:[...archive.entries,dup]};
assert.equal(T.hourTransitions(archive,since,now).transitions,3,'same closed H1 never double-counted');
const inconsistent=entry(base+3*H,'up',{mismatch:true});
archive={...archive,entries:[...archive.entries,inconsistent]};
assert.equal(T.hourTransitions(archive,since,now).transitions,3,'different candle times across assets rejected');
const missing=entry(base+3*H,'up',{complete:false});
archive={...archive,entries:[...archive.entries,missing]};
assert.equal(T.hourTransitions(archive,since,now).transitions,3,'incomplete observation rejected');
const future=entry(base+6*H,'up');
assert.equal(T.hourState(future,since,base+6*H+1000),null,'future completed run excluded');
const late=entry(base+3*H,'up');
late.finishedAt=base+3*H+H+1000;
archive={...archive,entries:[...archive.entries,late]};
const adjusted=T.hourTransitions(archive,since,now);
assert.equal(adjusted.transitions,3,'next already closed before previous was observed cannot score');
const older=T.hourTransitions({version:1,startedAt:since-5*H,entries:[before,e0,e1]},base+H+1,now);
assert.equal(older.transitions,0,'registration cannot relabel historical studies');
const ui=fs.readFileSync('src/App.tsx','utf8');
assert(ui.includes("apex_v45_hour_since"));
assert(ui.includes('hourTransitions(coreResearch,transitionSince,now)'));
assert(ui.includes('Переходы H1 · 4.5'));
assert(!fs.readFileSync('src/radar/learning.ts','utf8').includes('hourTransitions('));
console.log('APEX 4.5 prospective H1 transitions PASS: fixed horizon, unique candles, gaps, no future data, incomplete rejection and separate research');
