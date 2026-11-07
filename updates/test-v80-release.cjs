const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const map={
 './v64-futures-assistant':'v64-futures-assistant.ts',
 './v66-forward-study':'v66-forward-study.ts',
 './v67-checkpoints':'v67-checkpoints.ts',
 './v70-hypothesis-discovery':'v70-hypothesis-discovery.ts',
 './v72-shadow-lab':'v72-shadow-lab.ts',
 './v76-scope-demo':'v76-scope-demo.ts',
 './v77-monitor-health':'v77-monitor-health.ts',
 './v78-observation-notices':'v78-observation-notices.ts',
 './v75-checkpoint-continuation':'v75-checkpoint-continuation.ts',
 './v69-outcome-audit':'v69-outcome-audit.ts',
 './v71-forward-validation':'v71-forward-validation.ts',
 './v74-multi-demo':'v74-multi-demo.ts',
 './v75-favorites-research':'v75-favorites-research.ts',
};
const cache=new Map();
function load(path){
 if(cache.has(path))return cache.get(path).exports;
 const source=fs.readFileSync(path,'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};cache.set(path,mod);
 vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:name=>
  map[name]?load('src/radar/'+map[name]):require(name),
  Date,Math,Number,JSON,Array,Set,Map},
  {filename:path});
 return mod.exports;
}
const I=load('src/radar/v80-release-passport.ts');
const G=load('src/radar/v80-migration-guard.ts');
const V=load('src/radar/v66-forward-study.ts');
const C=load('src/radar/v67-checkpoints.ts');
const F=load('src/radar/v64-futures-assistant.ts');
const R=load('src/radar/v76-rolling-checkpoints.ts');
const T=Date.UTC(2026,10,7,11);
const data=new Map();
const store={
 getItem:(k)=>data.has(k)?data.get(k):null,
 setItem:(k,v)=>data.set(k,v),
 removeItem:(k)=>data.delete(k)
};
let initial=I.auditReleaseStorage(store,T);
assert.equal(initial.damaged,0);
assert.equal(initial.readiness,'CHECKED');
assert.equal(initial.entries.find(x=>x.id==='protocol').status,'EMPTY');
assert.equal(initial.entries.find(x=>x.id==='checkpoints').status,'EMPTY');
assert.equal(initial.entries.find(x=>x.id==='favorites').status,'EMPTY');
const p=V.startStudyProtocol(T-1000),emptyVenue={plans:0,complete:0,active:0,expired:0,
 gaps:0,unscored:0,positive:0,negative:0,flat:0,grossUSDT:0};
const report=(n)=>({startedAt:p.startedAt,modelVersion:p.modelVersion,eligible:n,
 binance:{...emptyVenue,plans:n,complete:n,positive:n,grossUSDT:n},bybit:{...emptyVenue},
 priorExcluded:0,unmatchedExcluded:0,reviewable:n,verdict:'COLLECTING',daysObserved:0});
const checkpoint=C.saveStudyCheckpoint(C.EMPTY_CHECKPOINTS,p,report(2),T);
data.set('apex_v66_forward_protocol',JSON.stringify(p));
data.set('apex_v67_study_checkpoints',JSON.stringify(checkpoint));
let rolling=R.restoreRollingArchive(null,checkpoint,{version:1,segments:[]},T+5);
assert.equal(rolling.snapshots.length,1);
assert.equal(G.canInitializeRolling(store,rolling,T+5).safe,true,'verified legacy transfer may start');
const initBad=new Map(data);
initBad.set('apex_v67_study_checkpoints','{"version":1,"snapshots":[{"bad":true}]}');
assert.equal(G.canInitializeRolling({getItem:k=>initBad.get(k)??null},rolling,T+5).safe,false,
 'corrupted legacy cannot be silently replaced');
const newerBad=new Map(data);
newerBad.set('apex_v76_rolling_checkpoints','{"version":1,"snapshots":"bad"}');
assert.equal(G.canInitializeRolling({getItem:k=>newerBad.get(k)??null},rolling,T+5).safe,false,
 'existing rolling archive must never be clobbered');
store.setItem('apex_v76_rolling_checkpoints',JSON.stringify(rolling));
assert.equal(G.canRetireLegacySnapshots(store,rolling,T+5).safe,true,
 'validated written snapshot is safe to retire legacy');
const gateWrong=G.canRetireLegacySnapshots(store,C.EMPTY_CHECKPOINTS,T+5);
assert.equal(gateWrong.safe,false,'mismatch between runtime archive and stored archive');
store.setItem('apex_v76_rolling_checkpoints','corrupted-json');
assert.equal(G.canRetireLegacySnapshots(store,rolling,T+5).safe,false);
store.setItem('apex_v76_rolling_checkpoints',JSON.stringify(rolling));
let valid=I.auditReleaseStorage(store,T+5);
assert.equal(valid.entries.find(x=>x.id==='protocol').status,'OK');
assert.equal(valid.entries.find(x=>x.id==='checkpoints').count,1);
assert.equal(valid.entries.find(x=>x.id==='migration').status,'ATTENTION','old snapshot keys still present until migration cleanup');
store.removeItem('apex_v67_study_checkpoints');
valid=I.auditReleaseStorage(store,T+5);
assert.equal(valid.entries.find(x=>x.id==='migration').status,'OK');
assert.equal(valid.entries.find(x=>x.id==='coherence').status,'OK');
assert.equal(valid.damaged,0);
const setting={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const createdAt=T-500;
const oldTicket={
 id:'futures:binance:BTCUSDT:5m:1:LONG',createdAt,
 plan:{id:'futures:binance:BTCUSDT:5m:1:LONG',source:'binance',symbol:'BTCUSDT',frame:'5m',
  direction:'LONG',entry:100,stop:98,targets:[101,103,105],createdAt,expiresAt:T+500000,observedBarAt:T-300000,
  reason:'test',model:'futures-study-v1'},
 setup:setting,mode:'auto',state:'WAITING',quality:'OK',lastBarAt:T-300000,
 protectiveStop:98,tpReached:0,remainingPct:100,grossUSDT:0,
 events:[{at:createdAt,type:'PLAN',detail:'fixture'}]
};
store.setItem('apex_v64_futures_demo',JSON.stringify({version:1,tickets:[oldTicket]}));
const scored=I.auditReleaseStorage(store,T+5);
assert.equal(scored.entries.find(x=>x.id==='ledger').status,'OK');
const corruptTicket={...oldTicket,id:'not-futures'};
store.setItem('apex_v64_futures_demo',JSON.stringify({version:1,tickets:[oldTicket,corruptTicket]}));
const before=store.getItem('apex_v64_futures_demo');
const damaged=I.auditReleaseStorage(store,T+5);
assert.equal(damaged.entries.find(x=>x.id==='ledger').status,'DAMAGED',
 'a restore that silently filters bad entries must be identified as damaged');
assert.equal(damaged.readiness,'NEEDS_ATTENTION');
assert.equal(store.getItem('apex_v64_futures_demo'),before,
 'audit must NEVER auto-prune or rewrite corrupt data');
store.setItem('apex_v76_selected_favorites',JSON.stringify(['DOGEUSDT','DOGEUSDT']));
assert.equal(I.auditReleaseStorage(store,T+5).entries.find(x=>x.id==='favorites').status,'DAMAGED');
store.setItem('apex_v76_selected_favorites',JSON.stringify(['DOGEUSDT','GRAMUSDT']));
store.setItem('apex_v76_demo_venues','both');
assert.equal(I.auditReleaseStorage(store,T+5).entries.find(x=>x.id==='favorites').count,2);
assert.equal(I.auditReleaseStorage(store,T+5).entries.find(x=>x.id==='venues').status,'OK');
const wrongP=V.startStudyProtocol(T-100);
store.setItem('apex_v66_forward_protocol',JSON.stringify(wrongP));
assert.equal(I.auditReleaseStorage(store,T+5).entries.find(x=>x.id==='coherence').status,'ATTENTION');
const safeReport=I.formatReleasePassport(damaged);
assert(safeReport.includes('APEX 8.0'));
assert(!safeReport.includes('DOGEUSDT'),'diagnostic report must not disclose symbols');
assert(!safeReport.includes('futures:binance:BTCUSDT'),'diagnostic must not include virtual order identifiers');
assert(!safeReport.includes('"events"'));
assert(!safeReport.includes('apiSecret'));
assert.equal(I.auditReleaseStorage(store,T+5).entries.filter(x=>x.status==='DAMAGED').length>0,true);
assert.equal(C.restoreStudyCheckpoints(JSON.stringify(rolling),T+5).snapshots.length,1);
assert.equal(R.addRollingCheckpoint(rolling,p,report(3),T+5).snapshots.length,2,
 'existing rolling state still accepts a new immutable checkpoint after audit');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const key of ['РЫНОЧНЫЙ РАДАР • 8.0',
 'APEX 8.0 · Паспорт стабильности','auditReleaseStorage','formatReleasePassport',
 'canRetireLegacySnapshots','canInitializeRolling',
 'releasePassport','copyReleaseDiagnostic','Проверить заново','Копировать отчёт',
 'apex_v64_futures_demo','apex_v66_forward_protocol','apex_v76_rolling_checkpoints',
 'apex_v70_hypothesis_archive','apex_v72_shadow_archive','apex_v76_selected_favorites',
 'apex_v76_demo_venues','APEX 7.9 · Фоновое исследование выбранных Futures-пар',
 'apex_v78_monitor_notice_settings']){
 assert(app.includes(key),'APEX 8.0 missing release integration '+key);
}
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const code=fs.readFileSync('src/radar/v80-release-passport.ts','utf8')+fs.readFileSync('src/radar/v80-migration-guard.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|executeTrade|apiSecret|privateKey|sendOrder/.test(code));
console.log('APEX 8.0 PASS: data integrity audit, corrupt-ledger notice, privacy-safe diagnostic copy, migration persistence protection and legacy DEMO continuity');
