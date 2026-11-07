const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const src=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};const localRequire=name=>{
  const known={
   './v64-futures-assistant':'src/radar/v64-futures-assistant.ts',
   './v67-checkpoints':'src/radar/v67-checkpoints.ts',
   './v75-favorites-research':'src/radar/v75-favorites-research.ts',
   './v74-multi-demo':'src/radar/v74-multi-demo.ts'};
  return known[name]?load(known[name]):require(name);
 };
 vm.runInNewContext(js,{module:m,exports:m.exports,require:localRequire,Date,Math,Number,JSON,Array,Set,Map});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 V=load('src/radar/v66-forward-study.ts'),
 C=load('src/radar/v67-checkpoints.ts'),
 G=load('src/radar/v75-favorites-research.ts'),
 M=load('src/radar/v76-scope-demo.ts'),
 R=load('src/radar/v76-rolling-checkpoints.ts');
const T=Date.UTC(2026,10,7,13),H=300000;
const favorites=['DOGEUSDT','BTCUSDT','ETHUSDT','TONUSDT','SOLUSDT','ADAUSDT'];
assert.equal(M.restoreSelectedFavorites(null),null,'fresh install defaults to first four current Radar favorites');
assert.equal(M.chosenFavorites(favorites,null).join(','),'DOGEUSDT,BTCUSDT,ETHUSDT,GRAMUSDT');
assert.equal(M.chosenFavorites(favorites,['SOLUSDT','DOGEUSDT','BOGUSUSDT']).join(','),'SOLUSDT,DOGEUSDT');
const selected=M.toggleFavoriteChoice(favorites,null,'DOGEUSDT');
assert.equal(selected.join(','),'BTCUSDT,ETHUSDT,GRAMUSDT');
const withDog=M.toggleFavoriteChoice(favorites,selected,'DOGEUSDT');
assert.equal(withDog.join(','),'BTCUSDT,ETHUSDT,GRAMUSDT,DOGEUSDT');
assert.equal(M.toggleFavoriteChoice(favorites,withDog,'SOLUSDT').join(','),withDog.join(','),
 'cannot select fifth asset');
assert.equal(M.toggleFavoriteChoice(favorites,['DOGEUSDT'],'DOGEUSDT').join(','),'DOGEUSDT',
 'retain one selected pair on user click');
assert.equal(M.chosenFavorites(['BTCUSDT'],['DOGEUSDT','BTCUSDT']).join(','),'BTCUSDT',
 'removed Radar favorites must stop new studies');
assert.equal(M.restoreSelectedFavorites(JSON.stringify(['tonusdt','GRAMUSDT','DOGEUSDT'])).join(','),'GRAMUSDT,DOGEUSDT');
assert.equal(M.restoreDemoVenue(null,'bybit'),'bybit','migrate existing exchange selector');
for(const x of ['binance','bybit','both'])assert.equal(M.restoreDemoVenue(x,'binance'),x);
assert.equal(M.chosenVenues('both').join(','),'binance,bybit');
const bars=Array.from({length:36},(_,i)=>({time:T-36*H+i*H,
 open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
const chosen=['DOGEUSDT','BTCUSDT','ETHUSDT','GRAMUSDT'];
const observations={};
for(const venue of ['binance','bybit'])for(const sym of chosen)
 observations[venue+':'+sym+':5m']=bars;
const empty=F.EMPTY_FUTURES_LEDGER;
const keys=M.chosenMonitorKeys('both','5m','binance','DOGEUSDT',chosen,0,true,true,empty);
assert.equal(keys.length,8,'4 pairs x 2 exchanges is 8 distinct public feeds, no duplicate ui key');
for(const sym of chosen){
 assert(keys.includes('binance:'+sym+':5m'));
 assert(keys.includes('bybit:'+sym+':5m'));
}
const binance=M.chosenMonitorKeys('binance','5m','bybit','DOGEUSDT',chosen,0,true,true,empty);
assert.equal(binance.length,5,'single chosen venue plus separate UI key');
assert.equal(M.chosenMonitorKeys('both','5m','binance','DOGEUSDT',chosen,0,false,false,empty).length,0,
 'manual mode does not auto-study chosen pairs when screen hidden');
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',
 notionalUSDT:100,portions:[50,30,20],breakeven:true};
const plans=M.plansForChosenVenues('both','5m',chosen,observations,T);
assert.equal(plans.length,8);
assert.equal(plans.filter(p=>p.source==='binance').length,4);
assert.equal(plans.filter(p=>p.source==='bybit').length,4);
assert(plans.every(p=>p.study?.continuous===true&&p.observedBarAt<T));
assert.equal(new Set(plans.map(p=>p.id)).size,8,'two exchanges must have independent virtual plan IDs');
const noCopy={...observations};
delete noCopy['bybit:DOGEUSDT:5m'];
assert.equal(M.plansForChosenVenues('both','5m',['DOGEUSDT'],noCopy,T).length,1,
 'never invent Bybit observation from Binance candles');
assert.equal(M.plansForChosenVenues('bybit','5m',['DOGEUSDT'],noCopy,T).length,0);
const ledger=M.enrollChosenDemoPlans(empty,plans,setup,T);
assert.equal(ledger.tickets.length,6,'retain global safety cap of six active virtual paper tickets');
assert.equal(ledger.tickets.filter(t=>t.plan.source==='binance').length,3,'two-source paper monitoring should share virtual capacity fairly');
assert.equal(ledger.tickets.filter(t=>t.plan.source==='bybit').length,3);
assert(ledger.tickets.every(t=>t.setup.exchange===t.plan.source));
assert.equal(M.enrollChosenDemoPlans(ledger,plans,setup,T),ledger,'no duplicate paper signal');
const rows=M.chosenFeedRows('both','5m',chosen,observations,ledger,T);
assert.equal(rows.length,8);
assert.equal(rows.filter(x=>x.source==='binance').length,4);
assert.equal(rows.filter(x=>x.source==='bybit').length,4);
const missing=M.chosenFeedRows('both','5m',['DOGEUSDT'],noCopy,ledger,T);
assert.equal(missing.find(x=>x.source==='bybit').state,'NO_DATA','independent venue diagnostic');
assert.equal(JSON.stringify(empty),JSON.stringify(F.EMPTY_FUTURES_LEDGER),'original ledger never overwritten');
const protocol=V.startStudyProtocol(T-1000);
const base={plans:0,complete:0,active:0,expired:0,gaps:0,unscored:0,positive:0,negative:0,flat:0,grossUSDT:0};
const report=n=>({startedAt:protocol.startedAt,modelVersion:protocol.modelVersion,eligible:n,
 binance:{...base,plans:n,complete:n,positive:n,grossUSDT:n},bybit:{...base},
 reviewable:n,priorExcluded:0,unmatchedExcluded:0,daysObserved:0,verdict:'COLLECTING'});
let archive=C.EMPTY_CHECKPOINTS;
for(let i=1;i<=64;i++)archive=C.saveStudyCheckpoint(archive,protocol,report(i),T+i*1000);
assert.equal(archive.snapshots.length,64);
const continuation={version:1,segments:[C.saveStudyCheckpoint(C.EMPTY_CHECKPOINTS,protocol,report(65),T+65000)]};
const migrated=R.restoreRollingArchive(null,archive,continuation,T+65000);
assert.equal(migrated.snapshots.length,64,'migration retains only 64 newest checkpoints');
assert.equal(R.restoreRollingArchive(JSON.stringify({version:999,snapshots:[]}),archive,continuation,T+65000).snapshots.length,64,'invalid new storage must not discard legacy checkpoints');
assert.equal(migrated.snapshots[0].reviewable,2,'first of legacy 64 deliberately expired');
assert.equal(migrated.snapshots.at(-1).reviewable,65);
assert.equal(R.restoreRollingArchive(JSON.stringify(migrated),C.EMPTY_CHECKPOINTS,{version:1,segments:[]},T+65000).snapshots.length,64,
 'restart reads new authoritative snapshot key');
const migratedBefore=JSON.stringify(migrated);
const rotated=R.addRollingCheckpoint(migrated,protocol,report(66),T+66000);
assert.equal(rotated.snapshots.length,64);
assert.equal(rotated.snapshots[0].reviewable,3);
assert.equal(rotated.snapshots.at(-1).reviewable,66);
assert.equal(JSON.stringify(migrated),migratedBefore,'previous in-memory archive not mutated');
assert.equal(R.addRollingCheckpoint(rotated,protocol,report(66),T+66000),rotated,'duplicate time ignored');
assert.equal(R.autoRollingCheckpoint(rotated,protocol,report(66),true,T+67000),rotated,'no duplicate automatic checkpoint');
assert.equal(R.autoRollingCheckpoint(rotated,protocol,report(71),true,T+71000).snapshots.at(-1).reviewable,71);
assert.equal(R.autoRollingCheckpoint(rotated,protocol,report(72),false,T+72000),rotated);
assert.equal(R.rollingSnapshots(rotated,V.startStudyProtocol(T)).length,0);
assert.equal(R.rollingSnapshots(rotated,protocol).length,64);
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 7.6','Мульти · избранные','Биржи мульти-DEMO',
 'Binance Futures','Bybit Futures','Обе','futuresFavorites','selectedDemoFavorites',
 'favoriteChoice','demoVenueMode','chosenMonitorKeys','plansForChosenVenues',
 'enrollChosenDemoPlans','chosenFeedRows','rollingSnapshots','addRollingCheckpoint',
 'autoRollingCheckpoint','apex_v76_rolling_checkpoints','apex_v76_selected_favorites',
 'apex_v76_demo_venues','Положительные и отрицательные результаты DEMO',
 'apex_v66_forward_protocol','apex_v64_futures_demo','apex_v70_hypothesis_archive'])
 assert(app.includes(token),'APEX 7.6 missing UI/feature '+token);
assert(!app.includes('disabled={studySnapshots.length>=64}'));
const tsx=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(tsx.parseDiagnostics.length,0,tsx.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
for(const fname of ['v76-scope-demo.ts','v76-rolling-checkpoints.ts']){
 const src=fs.readFileSync('src/radar/'+fname,'utf8');
 assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiKey|apiSecret|executeTrade|sendOrder/.test(src));
}
console.log('APEX 7.6 PASS: pick four favorites, independent Binance/Bybit/Both virtual scans, no cross-source copy, rolling latest-64 and migration');
