/** APEX 7.9: opt-in PUBLIC Futures research inside the EXISTING Android
 * WorkManager job. One scheduler for CORE/personal/Futures. This does NOT
 * run the WebView trading simulation or backfill "missed" DEMO tickets.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.9 '+label+' matches='+n);return s.replace(a,b);}
const native='native/android/app/src/main/java/com/apexintelligence/monitor/';
let plugin=read(native+'BackgroundMonitorPlugin.java');
plugin=rep(plugin,'    private JSObject coreStatusObject(){',
 read('updates/v79-native-plugin-methods.txt')+'\n    private JSObject coreStatusObject(){',
 'native plugin opted-in Futures data config / real status');
plugin=rep(plugin,
 'boolean active=prefs().getBoolean("enabled",false)||prefs().getBoolean("coreEnabled",false);',
 'boolean active=prefs().getBoolean("enabled",false)||prefs().getBoolean("coreEnabled",false)||prefs().getBoolean("futuresStudyEnabled",false);',
 'reuse ONE periodic worker for Futures/public research');
write(native+'BackgroundMonitorPlugin.java',plugin);
let worker=read(native+'BackgroundScanWorker.java');
worker=rep(worker,
 '        boolean coreEnabled=prefs.getBoolean("coreEnabled",false);',
 [
 '        // APEX 7.9: one strictly opt-in PUBLIC Futures data-only sample.',
 '        // A one-time manual Futures check does not execute CORE/personal studies.',
 '        boolean futuresOnly=getInputData().getBoolean("futuresOnly",false);',
 '        if(prefs.getBoolean("futuresStudyEnabled",false)&&!getInputData().getBoolean("coreOnly",false)){',
 '            try{FuturesResearchSampler.sample(getApplicationContext(),prefs);}',
 '            catch(Exception ignored){/* never break existing CORE worker */}',
 '        }',
 '        if(futuresOnly)return Result.success();',
 '        boolean coreEnabled=prefs.getBoolean("coreEnabled",false);'
 ].join('\n'),
 'reuse existing worker and keep CORE/personal jobs unchanged');
write(native+'BackgroundScanWorker.java',worker);
fs.copyFileSync('updates/v79-FuturesResearchSampler.java',native+'FuturesResearchSampler.java');

fs.copyFileSync('updates/v79-native-futures.ts','src/radar/v79-native-futures.ts');
fs.copyFileSync('updates/test-v79-background.cjs','scripts/test-v79-background.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {publishObservationNotice} from './radar/v78-notification-publisher';",
 "import {publishObservationNotice} from './radar/v78-notification-publisher';\nimport {getFuturesNativeStatus,configureFuturesNative,queueFuturesNativeCheck,backgroundSnapshotSummary,latestFuturesSample,EMPTY_NATIVE_FUTURES,type NativeFuturesStatus} from './radar/v79-native-futures';",
 'native Android Futures research bridge');
app=rep(app,
 " const [monitorNoticeMessage,setMonitorNoticeMessage]=useState('');",
 [
 " const [monitorNoticeMessage,setMonitorNoticeMessage]=useState('');",
 " const [futuresNativeStatus,setFuturesNativeStatus]=useState<NativeFuturesStatus>(EMPTY_NATIVE_FUTURES);",
 " const [futuresBackgroundBusy,setFuturesBackgroundBusy]=useState(false);",
 " const [futuresBackgroundMessage,setFuturesBackgroundMessage]=useState('');",
 " const futuresNativeBusyRef=useRef(false);"
 ].join('\n'),
 'separate native worker state (never affects DEMO ledger)');
const hooks=[
 " const futuresNativeSummary=useMemo(()=>backgroundSnapshotSummary(futuresNativeStatus,now),[futuresNativeStatus,now]);",
 " const lastFuturesNative=useMemo(()=>latestFuturesSample(futuresNativeStatus),[futuresNativeStatus]);",
 " useEffect(()=>{",
 "  let alive=true,inFlight=false;",
 "  const refresh=()=>{if(document.hidden||inFlight)return;inFlight=true;",
 "   void getFuturesNativeStatus().then(state=>{if(alive)setFuturesNativeStatus(state);})",
 "    .catch(e=>{if(alive)setFuturesBackgroundMessage('Диагностика Futures WorkManager: '+String(e));})",
 "    .finally(()=>{inFlight=false;});",
 "  };",
 "  refresh();",
 "  const visible=()=>{if(!document.hidden)refresh();};",
 "  document.addEventListener('visibilitychange',visible);",
 "  const interval=setInterval(visible,180000);",
 "  return ()=>{alive=false;clearInterval(interval);document.removeEventListener('visibilitychange',visible);};",
 " },[]);",
 " const refreshNativeFuturesBackground=async()=>{",
 "  if(futuresNativeBusyRef.current)return;",
 "  setFuturesBackgroundMessage('');",
 "  try{setFuturesNativeStatus(await getFuturesNativeStatus());}",
 "  catch(e){setFuturesBackgroundMessage('Не удалось проверить расписание Android: '+String(e));}",
 " };",
 " const toggleNativeFuturesBackground=async()=>{",
 "  if(futuresNativeBusyRef.current)return;",
 "  const enable=!futuresNativeStatus.enabled;",
 "  if(enable&&(futuresScope!=='multi'||selectedDemoFavorites.length===0)){",
 "   setFuturesBackgroundMessage('Сначала выбери Мульти · избранные и хотя бы один контракт.');return;",
 "  }",
 "  futuresNativeBusyRef.current=true;setFuturesBackgroundBusy(true);setFuturesBackgroundMessage('');",
 "  try{const status=await configureFuturesNative(enable,selectedDemoFavorites,demoVenueMode,futuresFrame);",
 "   setFuturesNativeStatus(status);",
 "   setFuturesBackgroundMessage(enable?'Фоновый публичный сбор включён. Фактические запуски появятся после работы Android.':'Фоновый Futures-сбор выключен. Предыдущие наблюдения сохранены.');",
 "  }catch(e){setFuturesBackgroundMessage('Не удалось изменить фоновый сбор: '+String(e));}",
 "  finally{futuresNativeBusyRef.current=false;setFuturesBackgroundBusy(false);}",
 " };",
 " const checkNativeFuturesNow=async()=>{",
 "  if(futuresNativeBusyRef.current)return;",
 "  futuresNativeBusyRef.current=true;setFuturesBackgroundBusy(true);setFuturesBackgroundMessage('');",
 "  try{const queued=await queueFuturesNativeCheck();",
 "   setFuturesBackgroundMessage(queued?'Проверка добавлена в очередь Android. Дождись фактического выполнения — оно не гарантировано сразу.':'Не удалось запросить проверку.');",
 "  }catch(e){setFuturesBackgroundMessage('Ошибка постановки фоновой проверки: '+String(e));}",
 "  finally{futuresNativeBusyRef.current=false;setFuturesBackgroundBusy(false);}",
 " };",
 " // A previously consented background study follows later chosen favorites",
 " // and source/frame changes. If MULTI is disabled or all picks removed, stop",
 " // the native sampler instead of continuing to poll unwanted symbols.",
 " useEffect(()=>{",
 "  if(!futuresNativeStatus.supported||!futuresNativeStatus.enabled||futuresNativeBusyRef.current)return;",
 "  const desired=futuresScope==='multi'&&selectedDemoFavorites.length>0;",
 "  const same=desired&&futuresNativeStatus.venues===demoVenueMode&&",
 "   futuresNativeStatus.frame===futuresFrame&&",
 "   futuresNativeStatus.symbols.join('|')===selectedDemoFavorites.join('|');",
 "  if(same)return;",
 "  futuresNativeBusyRef.current=true;setFuturesBackgroundBusy(true);",
 "  void configureFuturesNative(desired,selectedDemoFavorites,demoVenueMode,futuresFrame)",
 "   .then(x=>{setFuturesNativeStatus(x);",
 "    setFuturesBackgroundMessage(desired?'Фон обновлён под новый выбор избранных активов и бирж.':'Мульти-режим выключен или нет пар: фоновый сбор остановлен.');})",
 "   .catch(e=>{setFuturesBackgroundMessage('Не удалось синхронизировать Android-выбор: '+String(e));})",
 "   .finally(()=>{futuresNativeBusyRef.current=false;setFuturesBackgroundBusy(false);});",
 " },[futuresNativeStatus,selectedDemoFavorites,futuresScope,demoVenueMode,futuresFrame]);"
].join('\n');
app=rep(app,
 " const backgroundTruth=useMemo(()=>explainAndroidBackground(coreReliabilityState,monitorJournal,monitorFeedRows.length,now),[coreReliabilityState,monitorJournal,monitorFeedRows.length,now]);",
 " const backgroundTruth=useMemo(()=>explainAndroidBackground(coreReliabilityState,monitorJournal,monitorFeedRows.length,now),[coreReliabilityState,monitorJournal,monitorFeedRows.length,now]);\n"+hooks,
 'factual native Futures background status and opt-in lifecycle');
app=rep(app,read('updates/v78-background-panel.txt'),
 read('updates/v78-background-panel.txt')+'\n'+read('updates/v79-native-background-ui.txt'),
 'opt-in Futures native worker UI beneath CORE diagnostic');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.8','РЫНОЧНЫЙ РАДАР • 7.9','version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.8','РЫНОЧНЫЙ РАДАР • 7.9'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v79-background.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.9 — Opt-in Android native public Futures health sampling\n- Native BackgroundMonitorPlugin adds a separate opt-in flag for max four selected Radar favorites, user-chosen Binance/Bybit/BOTH venues and the current futures frame. It extends the SAME EXISTING unique 15-minute WorkManager periodic worker already used for CORE/personal observations. No competing scheduler or second periodic job is added; when Futures research alone is enabled the shared job remains scheduled. The UI shows real WorkInfo, actual last completed run and bounded 64 observation summaries.\n- Android helper FuturesResearchSampler performs at most 8 requests/run to the public Binance Futures and Bybit linear kline endpoints. It validates OHLCV, excludes the current UNFINISHED candle, checks 36+ actual closed candles, continuity, and freshness, recording source/version, timestamps, READY/NO_DATA/STALE/GAP/ERROR and bounded descriptions. No virtual orders are generated or replayed by Android and no background evaluation is imported into paper trading outcomes or research validity statistics.\n- Users may explicitly enable/disable in the Futures Assistant; manual one-time verification queues separate existing worker with a futuresOnly flag. Saved native settings synchronize to updated selected favorite symbols/venues/frame; removing favorites or leaving MULTI deactivates the sampler without deleting historical records. Android Doze, force-stop and network conditions can delay/suppress actual execution: never claim 24/7 or deterministic 15-minute checks.\n- Prior Radar favorites, DEMO ledgers and their historical venue/symbol, rolling-64 checkpoints, future-only protocol, CORE scheduler/history, and all hypothesis archives remain unchanged. No exchange account credentials, private APIs, order placement, auto risk/lot management or promises about profitability.\n');
console.log('APEX 7.9 single shared WorkManager native Futures sampler and Android diagnostic UI integrated');
