const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const src=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 const localRequire=name=>{
  const known={'./v64-futures-assistant':'src/radar/v64-futures-assistant.ts',
   './v67-checkpoints':'src/radar/v67-checkpoints.ts'};
  return known[name]?load(known[name]):require(name);
 };
 vm.runInNewContext(js,{module:m,exports:m.exports,require:localRequire,Map,Set,Date,Math,Number,Array,JSON});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 M=load('src/radar/v74-multi-demo.ts'),
 V=load('src/radar/v66-forward-study.ts'),
 C=load('src/radar/v67-checkpoints.ts'),
 A=load('src/radar/v74-auto-checkpoints.ts');
assert.equal(M.restoreDemoSymbols(null).join(','),'BTCUSDT,ETHUSDT,SOLUSDT');
assert.equal(M.restoreDemoSymbols('broken').join(','),'BTCUSDT,ETHUSDT,SOLUSDT');
assert.equal(M.restoreDemoSymbols(JSON.stringify(['TONUSDT','TONUSDT','BOGUS','BTCUSDT'])).join(','),'TONUSDT,BTCUSDT');
assert.equal(M.toggleDemoSymbol(['BTCUSDT'],'BTCUSDT').join(','),'BTCUSDT','must retain at least 1 asset');
assert.equal(M.toggleDemoSymbol(['BTCUSDT','ETHUSDT','SOLUSDT'],'TONUSDT').length,4);
assert.equal(M.toggleDemoSymbol(['BTCUSDT','ETHUSDT','SOLUSDT','TONUSDT'],'ADAUSDT').length,4);
assert.equal(M.toggleDemoSymbol(['BTCUSDT','ETHUSDT'],'BTCUSDT').join(','),'ETHUSDT');
assert.equal(M.toggleDemoSymbol(['BTCUSDT'],'NOTREAL').join(','),'BTCUSDT');
const H=300000,T=Date.UTC(2026,10,7,9);
const bars=Array.from({length:36},(_,i)=>({time:T-36*H+i*H,
 open:100+i,high:102+i,low:99+i,close:101+i,volume:15,closed:true}));
const observations={
 'binance:BTCUSDT:5m':bars,'binance:ETHUSDT:5m':bars,
 'binance:SOLUSDT:5m':bars,'bybit:BTCUSDT:5m':bars
};
const plans=M.deriveMultiDemoPlans('binance','5m',['BTCUSDT','ETHUSDT','SOLUSDT','FAKEUSDT'],observations,T);
assert.equal(plans.length,3);
assert.equal(new Set(plans.map(p=>p.id)).size,3,'unique pair-specific signal IDs');
assert(plans.every(p=>p.source==='binance'&&p.study?.continuous===true));
assert.equal(M.deriveMultiDemoPlans('bybit','5m',['ETHUSDT'],observations,T).length,0,'never substitute other venue');
assert.equal(M.deriveMultiDemoPlans('binance','1h',['BTCUSDT'],observations,T).length,0,'no timeframe substitution');
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',
 notionalUSDT:100,portions:[50,30,20],breakeven:true};
const original=F.EMPTY_FUTURES_LEDGER;
let ledger=M.enrollMultiDemoPlans(original,plans,setup,T);
assert.equal(ledger.tickets.length,3);
assert.equal(ledger.tickets.every(t=>t.mode==='auto'&&t.state==='WAITING'),true);
assert.equal(ledger.tickets.filter(t=>t.plan.symbol==='BTCUSDT').length,1);
assert.equal(M.enrollMultiDemoPlans(ledger,plans,setup,T),ledger,'same candle must never create duplicate virtual orders');
assert.equal(M.enrollMultiDemoPlans(original,plans,{...setup,exchange:'bybit'},T),original,'venue-specific setup');
const badBars=[...bars.slice(0,10),...bars.slice(11)];
assert.equal(M.deriveMultiDemoPlans('binance','5m',['BTCUSDT'],{'binance:BTCUSDT:5m':badBars},T).length,0,'gaps never create demo plans');
const staleT=T+4*H;
assert.equal(M.deriveMultiDemoPlans('binance','5m',['BTCUSDT'],observations,staleT).length,0,'stale bar must not reenter');
const singles=M.multiDemoKeys('binance','5m','single','BTCUSDT',['ETHUSDT','SOLUSDT'],true,true,original);
assert.equal(singles.join(','),'binance:BTCUSDT:5m');
const manual=M.multiDemoKeys('binance','5m','multi','BTCUSDT',['ETHUSDT','SOLUSDT'],false,true,original);
assert.equal(manual.join(','),'binance:BTCUSDT:5m','manual mode must not auto-scan multi list');
const multi=M.multiDemoKeys('binance','5m','multi','BTCUSDT',['ETHUSDT','SOLUSDT'],true,true,original);
assert.deepEqual([...multi].sort(),['binance:BTCUSDT:5m','binance:ETHUSDT:5m','binance:SOLUSDT:5m'].sort());
const background=M.multiDemoKeys('binance','5m','multi','BTCUSDT',['ETHUSDT','SOLUSDT'],true,false,original);
assert.equal(background.length,2,'when another tab is visible multi research still observes opted pairs in foreground');
const active=M.multiDemoKeys('bybit','5m','single','BTCUSDT',[],false,false,ledger);
assert.equal(active.length,3);
assert(active.every(s=>s.startsWith('binance:')),'already-active records use their ORIGINAL venue');
const EMPTY_V={plans:0,complete:0,active:0,expired:0,gaps:0,unscored:0,positive:0,negative:0,flat:0,grossUSDT:0};
const p=V.startStudyProtocol(T-1000);
function report(n){
 return {startedAt:p.startedAt,modelVersion:p.modelVersion,eligible:n,
  binance:{...EMPTY_V,plans:n,complete:n,positive:n,grossUSDT:n},bybit:{...EMPTY_V},
  priorExcluded:0,unmatchedExcluded:0,daysObserved:0,verdict:'COLLECTING',reviewable:n};
}
let archive=A.autoCheckpointIfDue(C.EMPTY_CHECKPOINTS,p,report(1),true,T);
assert.equal(archive.snapshots.length,1);
assert.equal(archive.snapshots[0].reviewable,1);
assert.equal(A.autoCheckpointIfDue(archive,p,report(1),true,T+1000),archive,'unchanged studies never make duplicates');
assert.equal(A.autoCheckpointIfDue(archive,p,report(4),true,T+1000),archive,'do not save on every new event');
const second=A.autoCheckpointIfDue(archive,p,report(6),true,T+2000);
assert.equal(second.snapshots.length,2);
assert.equal(second.snapshots[0].reviewable,1,'immutable previous snapshot');
assert.equal(second.snapshots[1].reviewable,6);
const daily=A.autoCheckpointIfDue(second,p,report(7),true,T+86400000+3000);
assert.equal(daily.snapshots.length,3,'one new result after a day triggers snapshot');
assert.equal(daily.snapshots[2].reviewable,7);
assert.equal(A.autoCheckpointIfDue(daily,p,report(7),true,T+2*86400000),daily,'no new results no snapshot');
assert.equal(A.autoCheckpointIfDue(daily,p,report(17),false,T+2*86400000),daily,'user disabled auto');
const manual=C.saveStudyCheckpoint(daily,p,report(7),T+86400000+4000);
assert.equal(manual.snapshots.length,4,'manual capture remains available');
assert.equal(C.restoreStudyCheckpoints(JSON.stringify(manual),T+86400000+4000).snapshots.length,4);
assert.equal(A.autoCheckpointIfDue(daily,V.startStudyProtocol(T),report(10),true,T+86400000+5000),daily,'protocol mismatch must not reset');
assert.equal(A.autoCheckpointIfDue(C.EMPTY_CHECKPOINTS,null,report(10),true,T),C.EMPTY_CHECKPOINTS);
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 7.4','Одна пара','Мульти DEMO','futuresScope',
 'multiDemoSymbols','multiDemoKeys','deriveMultiDemoPlans','enrollMultiDemoPlans',
 'autoCheckpointIfDue','Автосохранение контрольных точек','Сохранить контрольную точку',
 'apex_v74_auto_checkpoints','apex_v74_multi_symbols','apex_v74_futures_scope',
 'apex_v63_assistant_demo','apex_v64_futures_demo','apex_v66_forward_protocol',
 'apex_v67_study_checkpoints','apex_v70_hypothesis_archive',
 'APEX 7.3 · Интеллектуальный наставник'])
 assert(app.includes(token),'APEX 7.4 missing UI/data '+token);
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
for(const file of ['v74-multi-demo.ts','v74-auto-checkpoints.ts']){
 const src=fs.readFileSync('src/radar/'+file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiSecret|apiKey|sendOrder|executeTrade/.test(src),'no real trading in '+file);
}
console.log('APEX 7.4 PASS: multi-pair Futures DEMO without cross-source reuse; automatic immutable snapshot thresholds, user toggle, legacy preservation');
