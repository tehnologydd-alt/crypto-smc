const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,JSON,Set,Map,Array});
 return m.exports;
}
const N=load('src/radar/v78-observation-notices.ts');
const T=Date.UTC(2026,10,7,12),MIN=60000,base={
 version:1,lastSeenAt:T,pausedAt:null,online:true,feeds:{},events:[]
};
const evt=(id,type,at,durationMs=null,key=null)=>({id,at,type,key,durationMs,message:'synthetic test'});
let settings=N.setNoticePermission(N.EMPTY_NOTICE_PREFS,true,T);
assert.equal(settings.enabled,true);assert.equal(settings.armedAt,T);
assert.equal(N.pickMonitoringNotice(base,settings,T+1000),null);
const earlier={...base,events:[evt('old','RESUMED',T-1,60*MIN)]};
assert.equal(N.pickMonitoringNotice(earlier,settings,T+1000),null,'no notification before opt-in');
const tiny={...base,events:[evt('short','RESUMED',T+1000,9*MIN)]};
assert.equal(N.pickMonitoringNotice(tiny,settings,T+1000),null,'short pauses are silent');
const resumed={...base,events:[evt('long','RESUMED',T+2000,11*MIN)]};
const first=N.pickMonitoringNotice(resumed,settings,T+2000);
assert(first&&first.type==='INTERRUPTED');
assert(first.body.includes('не восстанавливаются'));
settings=N.recordMonitoringNotice(settings,first,T+2000);
assert.equal(settings.sent.length,1);
assert.equal(N.pickMonitoringNotice(resumed,settings,T+2000),null,'do not repeat event');
const next={...base,events:[...resumed.events,evt('second','RESUMED',T+5*MIN,20*MIN)]};
assert.equal(N.pickMonitoringNotice(next,settings,T+6*MIN),null,'30-minute cooldown');
const afterCooldown=N.pickMonitoringNotice(next,settings,T+35*MIN);
assert.equal(afterCooldown,null,'events older than 30 minutes do not get delivered retrospectively');
let offline={...base,online:false,events:[evt('net-off','OFFLINE',T+35*MIN)]};
let second=N.pickMonitoringNotice(offline,settings,T+35*MIN);
assert(second&&second.type==='NO_NETWORK');
settings=N.recordMonitoringNotice(settings,second,T+35*MIN);
assert.equal(N.pickMonitoringNotice({...offline,online:true},settings,T+70*MIN),null,
 'resolved outages must not be announced later');
const key='binance:DOGEUSDT:5m';
const feed={key,lastAttemptAt:T,lastSuccessAt:null,lastClosedAt:null,lastErrorAt:T+70*MIN,
 error:'HTTP 429',consecutiveFailures:2,observedGaps:0,checkedBars:0};
const failures={...base,events:[evt('err','DATA_ERROR',T+70*MIN,null,key)],feeds:{[key]:feed}};
assert.equal(N.pickMonitoringNotice(failures,settings,T+70*MIN),null,'no repeated error threshold yet');
const consecutive={...failures,feeds:{[key]:{...feed,consecutiveFailures:3}}};
const third=N.pickMonitoringNotice(consecutive,settings,T+70*MIN);
assert(third&&third.type==='REPEATED_ERRORS');
settings=N.recordMonitoringNotice(settings,third,T+70*MIN);
assert.equal(settings.sent.length,3);
const gaps={...base,events:[evt('gap','GAP',T+110*MIN,null,key)],
 feeds:{[key]:{...feed,consecutiveFailures:0,observedGaps:1}}};
assert.equal(N.pickMonitoringNotice(gaps,settings,T+110*MIN),null,'maximum three per day');
const enabledAgain=N.setNoticePermission(N.setNoticePermission(settings,false,T+110*MIN),true,T+110*MIN);
assert.equal(enabledAgain.armedAt,T+110*MIN);
assert.equal(N.pickMonitoringNotice({...base,events:[evt('old-gap','GAP',T+109*MIN,null,key)],
 feeds:gaps.feeds},enabledAgain,T+111*MIN),null,'no old events on reenable');
const invalid={version:1,enabled:true,armedAt:T,sent:[{id:'bad',at:T+200*MIN}]};
assert.equal(N.restoreNoticePreferences(JSON.stringify(invalid),T).enabled,false);
assert.equal(N.restoreNoticePreferences(JSON.stringify(settings),T+111*MIN).sent.length,3);
assert.equal(N.restoreNoticePreferences('bad',T).enabled,false);
const android={
 supported:true,enabled:true,scheduled:true,workState:'ENQUEUED',
 repairQueued:false,lastRepairAt:0,checkedAt:T,lastRunAt:T-10*MIN,bufferEntries:1,lastResult:'OK'
};
const truth=N.explainAndroidBackground(android,base,8,T);
assert.equal(truth.coreTitle,'Фон CORE: задание запланировано');
assert.equal(truth.futuresTitle,'Futures DEMO: наблюдение в приложении');
assert(truth.futuresDetail.includes('НЕ мониторит'));
assert(truth.coreDetail.includes('10 мин'));
assert.equal(N.explainAndroidBackground({...android,enabled:false},base,8,T).coreTitle,'Фон CORE: выключен');
assert.equal(N.explainAndroidBackground({...android,scheduled:false,workState:'MISSING'},base,8,T).coreTitle,'Фон CORE: расписание не обнаружено');
assert.equal(N.explainAndroidBackground({...android,lastRunAt:T-60*MIN},base,8,T).coreTitle,'Фон CORE: задание задерживается');
assert.equal(N.explainAndroidBackground({...android,workState:'REQUEUED',repairQueued:true},base,8,T).coreTitle,'Фон CORE: восстановление запрошено');
assert.equal(N.explainAndroidBackground({...android,checkedAt:T-25*MIN},base,8,T).coreTitle,'Фон CORE: нужна новая проверка');
assert.equal(N.explainAndroidBackground({...android,supported:false},base,8,T).coreTitle,'Фон CORE: Android не проверен');
assert.equal(N.explainAndroidBackground(android,{...base,pausedAt:T},8,T).futuresTitle,'Futures DEMO: экран скрыт');
assert.equal(N.explainAndroidBackground(android,{...base,online:false},8,T).futuresTitle,'Futures DEMO: нет сети');
assert.equal(N.explainAndroidBackground(android,base,0,T).futuresTitle,'Futures DEMO: нет отслеживаемых потоков');
const ui=fs.readFileSync('src/App.tsx','utf8');
for(const x of ['РЫНОЧНЫЙ РАДАР • 7.8','APEX 7.8 · Android фон и уведомления о перерывах',
 'backgroundTruth','monitorNotices','toggleMonitorNotices','pickMonitoringNotice','publishObservationNotice',
 'recordMonitoringNotice','setNoticePermission','requestAlerts()','monitorNoticeBusy',
 'apex_v78_monitor_notice_settings','Проверить реальное расписание Android CORE',
 'APEX 7.7 · Качество наблюдения и перерывы','Мульти · избранные',
 'apex_v76_selected_favorites','apex_v76_demo_venues','apex_v76_rolling_checkpoints',
 'apex_v64_futures_demo','apex_v66_forward_protocol','apex_v70_hypothesis_archive'])
 assert(ui.includes(x),'APEX 7.8 screen or existing research invariant missing: '+x);
const ast=ts.createSourceFile('App.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const source=fs.readFileSync('src/radar/v78-observation-notices.ts','utf8');
const publisher=fs.readFileSync('src/radar/v78-notification-publisher.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|sendOrder|apiKey|apiSecret|executeTrade/.test(source+publisher));
assert(publisher.includes('LocalNotifications.checkPermissions()'));
assert(publisher.includes('Capacitor.isNativePlatform()'));
assert(!publisher.includes('requestPermissions()'),'only user click requests notification permission');
console.log('APEX 7.8 PASS: factual Android CORE vs Futures distinction, opt-in/no retro-alert, cooldown, daily cap, actual Android permission and no trade APIs');
