/** APEX 4.3: extend existing WorkManager job for opt-in fixed CORE research.
 * No second periodic scheduler; no extra notifications or retroactive forecasts.
 */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){
 if(!s.includes(a))throw Error('APEX 4.3 missing '+label);
 return s.replace(a,b);
}
const native='native/android/app/src/main/java/com/apexintelligence/monitor/';
let plugin=read(native+'BackgroundMonitorPlugin.java');
plugin=rep(plugin,'import androidx.work.WorkManager;',
'import androidx.work.WorkManager;\nimport androidx.work.ExistingWorkPolicy;\nimport androidx.work.OneTimeWorkRequest;\nimport androidx.work.Data;',
'WorkManager imports');
const oldStart=plugin.indexOf('            if(actual){');
const oldEnd=plugin.indexOf('            call.resolve(statusObject());',oldStart);
if(oldStart<0||oldEnd<oldStart)throw Error('APEX 4.3 scheduling block missing');
plugin=plugin.slice(0,oldStart)+
'            adjustSharedSchedule();\n'+plugin.slice(oldEnd);
const addedPlugin=[
'    /** Both personal monitoring and CORE research share the SAME periodic WorkManager job. */',
'    private void adjustSharedSchedule(){',
'        boolean active=prefs().getBoolean("enabled",false)||prefs().getBoolean("coreEnabled",false);',
'        WorkManager wm=WorkManager.getInstance(getContext());',
'        if(active){',
'            Constraints c=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();',
'            PeriodicWorkRequest task=new PeriodicWorkRequest.Builder(BackgroundScanWorker.class,15,TimeUnit.MINUTES)',
'                .setConstraints(c).build();',
'            wm.enqueueUniquePeriodicWork(JOB,ExistingPeriodicWorkPolicy.UPDATE,task);',
'        }else wm.cancelUniqueWork(JOB);',
'    }',
'    @PluginMethod public void configureCore(PluginCall call){',
'        boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled",false));',
'        try{',
'            prefs().edit().putBoolean("coreEnabled",enabled).apply();',
'            adjustSharedSchedule();',
'            call.resolve(coreStatusObject());',
'        }catch(Exception e){call.reject("Не удалось настроить фоновые исследования CORE",e);}',
'    }',
'    private JSObject coreStatusObject(){',
'        SharedPreferences p=prefs();',
'        JSObject out=new JSObject();',
'        out.put("enabled",p.getBoolean("coreEnabled",false));',
'        out.put("intervalMinutes",15);',
'        out.put("lastRunAt",p.getLong("coreLastRunAt",0));',
'        out.put("lastResult",p.getString("coreLastResult","Проверка ещё не выполнялась"));',
'        try{out.put("samples",new JSONArray(p.getString("coreHistory","[]")));}',
'        catch(Exception e){out.put("samples",new JSONArray());}',
'        return out;',
'    }',
'    @PluginMethod public void coreStatus(PluginCall call){call.resolve(coreStatusObject());}',
'    @PluginMethod public void runCoreNow(PluginCall call){',
'        if(!prefs().getBoolean("coreEnabled",false)){call.reject("Сначала включи исследования CORE");return;}',
'        try{',
'            Constraints c=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();',
'            Data payload=new Data.Builder().putBoolean("coreOnly",true).build();',
'            OneTimeWorkRequest task=new OneTimeWorkRequest.Builder(BackgroundScanWorker.class)',
'                .setConstraints(c).setInputData(payload).build();',
'            WorkManager.getInstance(getContext()).enqueueUniqueWork(JOB+"-core-now",ExistingWorkPolicy.KEEP,task);',
'            JSObject out=new JSObject();out.put("queued",true);call.resolve(out);',
'        }catch(Exception e){call.reject("Не удалось запросить проверку CORE",e);}',
'    }',
''
].join('\n');
plugin=rep(plugin,'    private JSObject statusObject(){',addedPlugin+'    private JSObject statusObject(){','CORE plugin methods');
write(native+'BackgroundMonitorPlugin.java',plugin);

let worker=read(native+'BackgroundScanWorker.java');
worker=rep(worker,'import java.util.Set;',
'import java.util.Set;\nimport java.util.LinkedHashSet;',
'worker imports');
worker=rep(worker,'    static final String[] FRAMES={"5m","1h","4h"};',
'    static final String[] FRAMES={"5m","1h","4h"};\n    static final String[] CORE={"BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"};',
'fixed immutable CORE symbols');
worker=rep(worker,'    private static JSONArray readArray(SharedPreferences p,String k){',
'    private static boolean coreMember(String symbol){for(String s:CORE)if(s.equals(symbol))return true;return false;}\n    private static JSONArray readArray(SharedPreferences p,String k){',
'membership helper');
const sampleMethods=[
'    /** Only the latest VERIFIED CLOSED candle and pre-existing range features are retained. */',
'    private static JSONObject summarizeCoreBar(List<JSONArray> bars,int k,long now)throws Exception{',
'        JSONArray last=bars.get(bars.size()-1);',
'        long closedAt=last.getLong(6);long age=now-closedAt;',
'        double o=last.getDouble(1),h=last.getDouble(2),l=last.getDouble(3),c=last.getDouble(4),v=last.getDouble(5);',
'        double rangeHigh=0,rangeLow=Double.POSITIVE_INFINITY,vol=0;',
'        for(int i=bars.size()-25;i<bars.size()-5;i++){',
'            JSONArray bar=bars.get(i);rangeHigh=Math.max(rangeHigh,bar.getDouble(2));',
'            rangeLow=Math.min(rangeLow,bar.getDouble(3));vol+=bar.getDouble(5);',
'        }',
'        boolean fresh=age>=0&&age<=FRAME_MS[k]+300_000L&&closedAt>0&&',
'            Double.isFinite(o)&&Double.isFinite(h)&&Double.isFinite(l)&&Double.isFinite(c)&&',
'            Double.isFinite(v)&&Double.isFinite(rangeHigh)&&Double.isFinite(rangeLow)&&',
'            o>0&&l>0&&c>0&&h>=Math.max(o,c)&&l<=Math.min(o,c)&&h>=l&&v>=0&&rangeHigh>rangeLow;',
'        return new JSONObject().put("frame",FRAMES[k]).put("closedAt",closedAt)',
'            .put("open",o).put("high",h).put("low",l).put("close",c).put("volume",v)',
'            .put("rangeHigh",rangeHigh).put("rangeLow",rangeLow).put("meanVolume",vol/20)',
'            .put("fresh",fresh);',
'    }',
'    /** Bounded, real execution records. No synthetic samples during Doze or offline. */',
'    private static void persistCoreSample(SharedPreferences prefs,long started,JSONArray assets,int ready,int errors){',
'        long finished=System.currentTimeMillis();',
'        try{',
'            JSONObject s=new JSONObject().put("source","binance-spot-klines-v1")',
'                .put("runAt",started).put("finishedAt",finished).put("assets",assets)',
'                .put("readyAssets",ready).put("complete",ready==CORE.length).put("errors",errors);',
'            JSONArray history=readArray(prefs,"coreHistory");',
'            history.put(s);JSONArray bounded=new JSONArray();',
'            for(int i=Math.max(0,history.length()-96);i<history.length();i++)bounded.put(history.get(i));',
'            prefs.edit().putString("coreHistory",bounded.toString()).putLong("coreLastRunAt",finished)',
'                .putString("coreLastResult",ready+"/"+CORE.length+" активов проверены полностью; ошибок: "+errors).apply();',
'        }catch(Exception e){prefs.edit().putLong("coreLastRunAt",finished)',
'            .putString("coreLastResult","Ошибка записи CORE").apply();}',
'    }',
''
].join('\n');
worker=rep(worker,'    @NonNull @Override public Result doWork(){',
sampleMethods+'    @NonNull @Override public Result doWork(){','worker core sampling helpers');
worker=rep(worker,
'        if(!prefs.getBoolean("enabled",false))return Result.success();',
'        boolean coreEnabled=prefs.getBoolean("coreEnabled",false);\n        boolean personalEnabled=prefs.getBoolean("enabled",false)&&!getInputData().getBoolean("coreOnly",false);\n        if(!personalEnabled&&!coreEnabled)return Result.success();',
'separate core and favorite activation');
worker=rep(worker,
'        Set<String> symbols=prefs.getStringSet("symbols",Collections.emptySet());',
[
'        Set<String> favoriteSymbols=prefs.getStringSet("symbols",Collections.emptySet());',
'        Set<String> symbols=new LinkedHashSet<>();',
'        if(personalEnabled&&favoriteSymbols!=null)symbols.addAll(favoriteSymbols);',
'        if(coreEnabled)Collections.addAll(symbols,CORE);'
].join('\n'),
'monitor both universes without modifying favorites');
worker=rep(worker,'        int ok=0,fail=0,changed=0;',
'        int ok=0,fail=0,changed=0,coreReady=0,coreErrors=0;\n        long coreStarted=System.currentTimeMillis();\n        JSONArray coreAssets=new JSONArray();',
'core execution record');
worker=rep(worker,
'          for(String symbol:symbols){if(isStopped())break;',
[
'          for(String symbol:symbols){if(isStopped())break;',
'            boolean coreSymbol=coreEnabled&&coreMember(symbol);',
'            JSONArray coreFrames=new JSONArray();'
].join('\n'),'per-symbol core collection');
worker=rep(worker,
'                    if(bars.size()<25)continue;',
'                    if(bars.size()<25){if(coreSymbol)coreErrors++;continue;}\n                    if(coreSymbol)coreFrames.put(summarizeCoreBar(bars,k,System.currentTimeMillis()));',
'validate and record actual closed candles');
worker=rep(worker,
'                    changed+=scan(context,prefs,scenarios,events,symbol,FRAMES[k],FRAME_MS[k],bars);\n                    ok++;',
'                    if(personalEnabled&&favoriteSymbols!=null&&favoriteSymbols.contains(symbol)){\n                        changed+=scan(context,prefs,scenarios,events,symbol,FRAMES[k],FRAME_MS[k],bars);\n                    }\n                    ok++;',
'do not create paper scenarios or notifications for research-only pairs');
worker=rep(worker,
'                }catch(Exception e){fail++;}',
'                }catch(Exception e){fail++;if(coreSymbol)coreErrors++;}',
'count failed background fetches');
worker=rep(worker,
'          }\n          prefs.edit().putString("scenarios",scenarios.toString())',
[
'            if(coreSymbol){',
'                boolean ready=coreFrames.length()==FRAMES.length;',
'                for(int i=0;i<coreFrames.length();i++)',
'                    if(!coreFrames.optJSONObject(i).optBoolean("fresh",false))ready=false;',
'                try{coreAssets.put(new JSONObject().put("symbol",symbol).put("frames",coreFrames).put("ready",ready));}',
'                catch(Exception ignored){}',
'                if(ready)coreReady++;',
'            }',
'          }',
'          if(coreEnabled)persistCoreSample(prefs,coreStarted,coreAssets,coreReady,coreErrors);',
'          prefs.edit().putString("scenarios",scenarios.toString())'
].join('\n'),'store bounded CORE run without touching personal events');
write(native+'BackgroundScanWorker.java',worker);

let app=read('src/App.tsx');
app=rep(app,
"import {openCoreCoverage,recordCoreCoverage,coreCoverageReport,strictCorePulse} from './radar/core-coverage';",
"import {openCoreCoverage,recordCoreCoverage,coreCoverageReport,strictCorePulse} from './radar/core-coverage';\nimport {getCoreNativeStatus,configureCoreNative,requestCoreCheck,type CoreNativeState} from './radar/core-background';",
'App bridge imports');
const coverageState=" const [coverageExpanded,setCoverageExpanded]=useState(false);";
const nativeStates=[
" const [coreNative,setCoreNative]=useState<CoreNativeState>({supported:Capacitor.isNativePlatform(),enabled:false,intervalMinutes:15,lastRunAt:0,lastResult:'Загрузка статуса…',samples:[]});",
" const [coreNativeBusy,setCoreNativeBusy]=useState(false);",
" const [coreNativeMessage,setCoreNativeMessage]=useState('');",
""
].join('\n');
app=rep(app,coverageState,coverageState+'\n'+nativeStates,'native state');
const effectMark=" useEffect(()=>{try{localStorage.setItem('apex_v42_core_coverage',JSON.stringify(coreCoverage));}catch{}},[coreCoverage]);";
const nativeEffects=[
" useEffect(()=>{",
"  let active=true;",
"  const update=()=>{void getCoreNativeStatus().then(s=>{if(active)setCoreNative(s)}).catch(e=>{if(active)setCoreNativeMessage('Android CORE: '+String(e))});};",
"  update();",
"  const resume=()=>{if(!document.hidden)update();};",
"  document.addEventListener('visibilitychange',resume);",
"  const timer=setInterval(resume,60_000);",
"  return ()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);};",
" },[]);",
" const toggleCoreNative=async()=>{",
"  if(coreNativeBusy)return;",
"  setCoreNativeBusy(true);setCoreNativeMessage('');",
"  try{const next=await configureCoreNative(!coreNative.enabled);setCoreNative(next);}",
"  catch(e){setCoreNativeMessage('Не удалось изменить фон CORE: '+String(e));}",
"  finally{setCoreNativeBusy(false);}",
" };",
" const checkCoreNative=async()=>{",
"  if(coreNativeBusy||!coreNative.enabled)return;",
"  setCoreNativeBusy(true);setCoreNativeMessage('');",
"  try{await requestCoreCheck();setCoreNativeMessage('Проверка запланирована Android. Результат появится после фактического выполнения.');}",
"  catch(e){setCoreNativeMessage('Ошибка проверки CORE: '+String(e));}",
"  finally{setCoreNativeBusy(false);}",
" };",
""
].join('\n');
app=rep(app,effectMark,effectMark+'\n'+nativeEffects,'native status, opt-in and user-triggered check');
app=rep(app,
'РЫНОЧНЫЙ РАДАР • 4.2','РЫНОЧНЫЙ РАДАР • 4.3','version');
app=rep(app,
'<section className="rounded-2xl border border-sky-500/20 bg-[#101d2e] p-3 space-y-2">',
read('updates/v43-background-ui.txt')+'\n<section className="rounded-2xl border border-sky-500/20 bg-[#101d2e] p-3 space-y-2">',
'CORE background status panel in Statistics');
write('src/App.tsx',app);
fs.copyFileSync('updates/core-background.ts','src/radar/core-background.ts');
fs.copyFileSync('updates/test-core-background.cjs','scripts/test-core-background.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-core-background.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.3 Android CORE background studies\n- Opt-in setting in Statistics enables independent public-data research of BTC/ETH/SOL/BNB/XRP on the EXISTING WorkManager 15-minute periodic job (no second periodic scheduler).\n- When enabled, each ACTUAL job collects CLOSED Binance Spot 5m/1h/4h candle snapshots and pre-existing range/volume features from 80 fetched bars. All checks are timestamped, source-tagged, bounded to 96 runs in native Android storage, and available in the CORE status panel.\n- Research-only assets NEVER create native paper forecasts, exchange orders, or notifications; favorite-only signals and notifications preserve their existing path.\n- Opt-in is independent of the favorite-background notification toggle. WorkManager may defer or suppress runs due to Android Doze, power policies, force-stop or missing network. No synthetic backfill and no 24/7 or 5-minute timing guarantee.\n- The native snapshots are not auto-imported into Learning as scored forecasts. Outcome research still uses its separate, prospective evidence guard. Future offline forecasting must use this source without look-ahead or silent mixing of different engines.\n');
console.log('APEX 4.3 opt-in CORE research shared WorkManager background installed');
