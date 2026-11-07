const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const source=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 const mockCore={Capacitor:{isNativePlatform:()=>false},
  registerPlugin:()=>({futuresStudyStatus:async()=>({}),configureFuturesStudy:async()=>({}),
   runFuturesStudyNow:async()=>({queued:false})})};
 vm.runInNewContext(js,{module:m,exports:m.exports,
  require:name=>name==='@capacitor/core'?mockCore:require(name),Date,Math,Number,JSON,Array,Set,Map});
 return m.exports;
}
const N=load('src/radar/v79-native-futures.ts');
const T=Date.UTC(2026,10,7,12),MIN=60000;
const checked=(source,symbol,frame=T?'5m':'5m',status='READY')=>({
 source,symbol,frame,sourceVersion:source==='binance'?'binance-futures-public-v1':'bybit-linear-public-v1',
 checkedAt:T+2000,lastClosedAt:T,barCount:39,gapCount:0,status,
 message:'Подтверждены закрытые свечи'
});
const sample={
 startedAt:T,finishedAt:T+10000,source:'public-futures-health-v1',
 venues:'both',frame:'5m',selectedCount:4,
 checks:[checked('binance','DOGEUSDT'),checked('bybit','DOGEUSDT'),
  checked('binance','GRAMUSDT'),checked('bybit','GRAMUSDT','5m','GAP')],
 ready:3,problems:1
};
const native={supported:true,enabled:true,scheduled:true,workState:'ENQUEUED',
 checkedAt:T+12000,lastRunAt:T+10000,lastResult:'3/4 READY',
 symbols:['DOGEUSDT','GRAMUSDT','BTCUSDT','SOLUSDT','UNEXPECTEDUSDT'],venues:'both',
 frame:'5m',samples:[sample]};
const status=N.parseNativeFuturesStatus(native,true,T+15000);
assert.equal(status.supported,true);assert.equal(status.enabled,true);
assert.equal(status.samples.length,1);assert.equal(status.samples[0].ready,3);
assert.equal(status.samples[0].checks[1].source,'bybit');
assert.equal(status.samples[0].checks[3].status,'GAP');
assert.equal(status.symbols.length,4,'enforce 4 selected symbols');
assert.equal(N.latestFuturesSample(status).finishedAt,T+10000);
assert(N.backgroundSnapshotSummary(status,T+15000).title.includes('записан'));
assert(N.backgroundSnapshotSummary(status,T+50*MIN).title.includes('задерживается'));
assert(N.backgroundSnapshotSummary({...status,samples:[]},T+15000).detail.includes('пока нет'));
assert(N.backgroundSnapshotSummary({...status,scheduled:false},T+15000).title.includes('не подтверждено'));
assert(N.backgroundSnapshotSummary({...status,enabled:false},T+15000).title.includes('выключен'));
assert(N.backgroundSnapshotSummary(N.EMPTY_NATIVE_FUTURES,T).title.includes('Android'));
const forged={...native,samples:[{...sample,checks:[...sample.checks,{...sample.checks[0]}],ready:4,problems:1}]};
assert.equal(N.parseNativeFuturesStatus(forged,true,T+20000).samples.length,0,
 'duplicated exchange-symbol-frame observations cannot be counted twice');
const mislabeled={...native,samples:[{...sample,checks:[{...sample.checks[0],sourceVersion:'bybit-linear-public-v1'}],
 ready:1,problems:0}]};
assert.equal(N.parseNativeFuturesStatus(mislabeled,true,T+20000).samples.length,0,
 'exchange data cannot be presented as the other venue');
assert.equal(N.parseNativeFuturesStatus({...native,samples:[{...sample,finishedAt:T+2*MIN}]},true,T+15000).samples.length,0,
 'future-dated synthetic run must be rejected');
assert.equal(N.parseNativeFuturesStatus({...native,samples:[{...sample,ready:4,problems:0}]},true,T+20000).samples.length,0);
assert.equal(N.parseNativeFuturesStatus({...native,samples:[{...sample,source:'real-trading-v1'}]},true,T+20000).samples.length,0);
assert.equal(N.parseNativeFuturesStatus(null,true,T).supported,true);
assert.equal(N.parseNativeFuturesStatus(native,false,T).enabled,false);
const plugin=fs.readFileSync('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java','utf8');
const worker=fs.readFileSync('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundScanWorker.java','utf8');
const sampler=fs.readFileSync('native/android/app/src/main/java/com/apexintelligence/monitor/FuturesResearchSampler.java','utf8');
assert(plugin.includes('@PluginMethod public void configureFuturesStudy(PluginCall call)'));
assert(plugin.includes('@PluginMethod public void futuresStudyStatus(PluginCall call)'));
assert(plugin.includes('@PluginMethod public void runFuturesStudyNow(PluginCall call)'));
assert(plugin.includes('getWorkInfosForUniqueWork(JOB)'),'real Android WorkInfo');
assert(plugin.includes('getBoolean("futuresStudyEnabled",false)'),'explicit local opt-in');
assert(plugin.includes('||prefs().getBoolean("futuresStudyEnabled",false)'),
 'same unique periodic WorkManager job should also run for opt-in Futures');
assert(plugin.includes('getWorkInfosForUniqueWork(JOB)'),'real work status not guessed');
assert(worker.includes('FuturesResearchSampler.sample(getApplicationContext(),prefs)'));
assert(worker.includes('getInputData().getBoolean("futuresOnly",false)'));
assert(worker.includes('if(futuresOnly)return Result.success()'),
 'on-demand check cannot run unrelated CORE/personal work');
assert(sampler.includes('https://fapi.binance.com/fapi/v1/klines'));
assert(sampler.includes('https://api.bybit.com/v5/market/kline'));
assert(sampler.includes('start+ms>now'),'never process unfinished market candle');
assert(sampler.includes('closedStarts.size()<36'),'minimum 36 actual closed bars');
assert(sampler.includes('new org.json.JSONArray(prefs.getString("futuresStudyHistory"'));
assert(sampler.includes('MAX_RESULTS=64'));
assert(sampler.includes('sourceVersion'));
assert(!/\/fapi\/v1\/order\b|\/v5\/order\/create\b|sendOrder|placeOrder|apiSecret|apiKey|privateKey|walletSecret/.test(plugin+worker+sampler),
 'research-only background worker must not contain private trading API endpoints');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const word of ['РЫНОЧНЫЙ РАДАР • 7.9',
 'APEX 7.9 · Фоновое исследование выбранных Futures-пар',
 'configureFuturesNative','getFuturesNativeStatus','queueFuturesNativeCheck',
 'selectedDemoFavorites','demoVenueMode','futuresFrame','futuresNativeStatus',
 'toggleNativeFuturesBackground','refreshNativeFuturesBackground','checkNativeFuturesNow',
 'apex_v76_selected_favorites','apex_v76_demo_venues','apex_v76_rolling_checkpoints',
 'apex_v64_futures_demo','apex_v66_forward_protocol','apex_v70_hypothesis_archive',
 'APEX 7.8 · Android фон и уведомления о перерывах'])
 assert(app.includes(word),'Missing APEX 7.9 integration '+word);
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
console.log('APEX 7.9 PASS: native WorkManager shared scheduler, explicit opt-in, independent closed Futures candles, timestamped actual status, no paper replay or real orders');
