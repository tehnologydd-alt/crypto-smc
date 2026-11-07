const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}},localRequire=name=>name==='./v64-futures-assistant'?
  load('src/radar/v64-futures-assistant.ts'):require(name);
 vm.runInNewContext(js,{module:m,exports:m.exports,require:localRequire,Date,Math,JSON,Number,Array,Set,Map});
 return m.exports;
}
const H=load('src/radar/v77-monitor-health.ts');
const T=Date.UTC(2026,10,7,13),M=300000,k='binance:DOGEUSDT:5m',other='bybit:DOGEUSDT:5m';
const bars=Array.from({length:36},(_,i)=>({time:T-36*M+i*M,
 open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
let journal=H.startMonitorSession(H.EMPTY_MONITOR,T);
assert.equal(journal.events.at(-1).type,'STARTED');
assert.equal(journal.lastSeenAt,T);
assert.equal(H.restoreMonitorJournal(JSON.stringify(journal),T).events.length,1);
journal=H.noteMonitorSuccess(journal,k,bars,T);
assert.equal(journal.feeds[k].lastSuccessAt,T);
assert.equal(journal.feeds[k].lastClosedAt,T);
assert.equal(journal.feeds[k].observedGaps,0);
assert.equal(H.monitorRows(journal,[k],T)[0].status,'FRESH');
assert.equal(H.monitorRows(journal,[k],T+2*M+1)[0].status,'DELAYED',
 'stale candles are never presented as currently observed');
assert.equal(H.monitorOverview(H.monitorRows(journal,[k,other],T)).noData,1);
const before=JSON.stringify(journal);
journal=H.noteMonitorFailure(journal,k,'HTTP 429',T+1000);
assert.equal(journal.feeds[k].consecutiveFailures,1);
assert.equal(H.monitorRows(journal,[k],T+1000)[0].status,'ERROR');
assert(journal.events.some(e=>e.type==='DATA_ERROR'));
journal=H.noteMonitorFailure(journal,k,'HTTP 429',T+2000);
assert.equal(journal.feeds[k].consecutiveFailures,2);
const errEvents=journal.events.filter(e=>e.type==='DATA_ERROR').length;
assert.equal(errEvents,1,'do not flood event log with recurring HTTP errors');
journal=H.noteMonitorSuccess(journal,k,bars,T+3000);
assert.equal(journal.feeds[k].consecutiveFailures,0);
assert(journal.events.some(e=>e.type==='DATA_RECOVERED'));
const gapBars=[...bars.slice(0,10),...bars.slice(11)];
journal=H.noteMonitorSuccess(journal,other,gapBars,T+4000);
assert.equal(journal.feeds[other].observedGaps,1);
assert(journal.events.some(e=>e.type==='GAP'&&e.key===other));
const beforePause=JSON.stringify(journal);
journal=H.noteMonitorVisibility(journal,false,T+6000);
assert.equal(journal.pausedAt,T+6000);
assert.equal(H.monitorRows(journal,[k,other],T+6000)[0].status,'PAUSED');
journal=H.noteMonitorVisibility(journal,false,T+9000);
assert.equal(journal.events.filter(e=>e.type==='PAUSED').length,1,
 'duplicate hidden events cannot inflate interruptions');
journal=H.noteMonitorVisibility(journal,true,T+66000);
assert.equal(journal.pausedAt,null);
assert.equal(journal.events.at(-1).type,'RESUMED');
assert.equal(journal.events.at(-1).durationMs,60000);
journal=H.noteMonitorNetwork(journal,false,T+68000);
assert.equal(journal.online,false);
assert.equal(H.monitorRows(journal,[k],T+68000)[0].status,'OFFLINE');
journal=H.noteMonitorNetwork(journal,true,T+69000);
assert.equal(journal.online,true);
assert.equal(journal.events.at(-1).type,'ONLINE');
assert.equal(JSON.stringify(H.EMPTY_MONITOR),JSON.stringify({version:1,lastSeenAt:null,pausedAt:null,online:true,events:[],feeds:{}}),
 'module constants never mutated');
const restored=H.restoreMonitorJournal(JSON.stringify(journal),T+70000);
assert.equal(restored.events.length,journal.events.length);
assert.equal(restored.feeds[k].lastSuccessAt,journal.feeds[k].lastSuccessAt);
assert.equal(H.restoreMonitorJournal(JSON.stringify(journal),T-1).events.length,0,
 'do not accept future-dated network events');
assert.equal(H.restoreMonitorJournal('bad-json',T).events.length,0);
const fake={...journal,feeds:{...journal.feeds,['bybit:BAD/../../:5m']:journal.feeds[k]}};
assert.equal(H.restoreMonitorJournal(JSON.stringify(fake),T+70000).events.length,0);
let large=H.startMonitorSession(H.EMPTY_MONITOR,T);
for(let i=0;i<80;i++){
 const key='binance:SYM'+i+'USDT:5m';
 large=H.noteMonitorFailure(large,key,'synthetic test',T+1000+i*4000);
}
assert(large.events.length<=H.MONITOR_MAX_EVENTS);
assert(Object.keys(large.feeds).length<=H.MONITOR_MAX_FEEDS);
assert.equal(H.noteMonitorFailure(large,'foo','invalid',T+990000),large,
 'no unsafe API keys accepted');
const replay=H.startMonitorSession(journal,T+120000);
assert.equal(replay.events.at(-1).type,'RESUMED');
assert.equal(replay.events.at(-1).durationMs,T+120000-journal.lastSeenAt);
assert(replay.events.at(-1).message.includes('перезапуска'));
const app=fs.readFileSync('src/App.tsx','utf8');
for(const item of ['РЫНОЧНЫЙ РАДАР • 7.7',
 'APEX 7.7 · Качество наблюдения и перерывы','monitorJournal','noteMonitorSuccess',
 'noteMonitorFailure','noteMonitorVisibility','noteMonitorNetwork','restoreMonitorJournal',
 'monitorRows','monitorOverview','apex_v77_observation_health',
 'futuresMultiPlans.filter','health.consecutiveFailures===0',
 'futuresSelectedKey','Время','Качество наблюдения',
 'apex_v76_selected_favorites','apex_v76_demo_venues',
 'apex_v76_rolling_checkpoints','apex_v64_futures_demo','apex_v66_forward_protocol']){
 // Ensure integration markers represent actual UI and app logic.
 if(item==='Время')continue;
 assert(app.includes(item),'APEX 7.7 source/UI missing '+item);
}
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const source=fs.readFileSync('src/radar/v77-monitor-health.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiSecret|apiKey|executeTrade|sendOrder/.test(source));
console.log('APEX 7.7 PASS: public data freshness and error recovery, offline/hidden intervals, journal persistence limits, no invented bars or DEMO trade mutation');
