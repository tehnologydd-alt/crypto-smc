/** APEX 3.0: Learning Engine, notification mute, and optional foreground screen-awake. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
let app=read('src/App.tsx');
function rep(from,to,name){if(!app.includes(from))throw Error('APEX 3.0 missing: '+name);app=app.replace(from,to)}
rep("import {LocalNotifications} from '@capacitor/local-notifications';",
 "import {LocalNotifications} from '@capacitor/local-notifications';\nimport {applyKeepScreenOn} from './radar/device';\nimport {openLearning,reconcileLearning,learningOverview,type LearningLedger} from './radar/learning';",'imports');
const anchor=" const [scenarios,setScenarios]=useState<Scenario[]>(safeScenarios);";
rep(anchor,anchor+"\n const [learning,setLearning]=useState<LearningLedger>(()=>openLearning(localStorage.getItem('apex_v30_learning'),Date.now()));\n const [keepScreenOn,setKeepScreenOn]=useState(()=>localStorage.getItem('apex_v30_screen_on')==='true');",'learning and screen setting state');
const persistence=" useEffect(()=>{try{localStorage.setItem('apex_v2_alerts',String(alerts));}catch{}},[alerts]);";
rep(persistence,
 " useEffect(()=>{setLearning(prev=>reconcileLearning(prev,scenarios,assets,Date.now()));},[scenarios]);\n useEffect(()=>{try{localStorage.setItem('apex_v30_learning',JSON.stringify(learning));}catch{}},[learning]);\n useEffect(()=>{try{localStorage.setItem('apex_v30_screen_on',String(keepScreenOn));}catch{};void applyKeepScreenOn(keepScreenOn).catch(e=>setLastError('Режим экрана: '+String(e)));},[keepScreenOn]);\n"+persistence,'effects');
const currentFn=" const requestNotifications=async()=>{try{const yes=await requestAlerts();setAlerts(yes);if(!yes)setLastError('Разреши уведомления для приложения в настройках Android.');}catch(e){setLastError('Не удалось запросить уведомления: '+String(e));}};";
const toggleFn=[
" const toggleNotifications=async()=>{",
"  setLastError('');",
"  if(alerts){",
"   setAlerts(false);",
"   try{",
"    if(Capacitor.isNativePlatform()){",
"     const pending=await LocalNotifications.getPending();",
"     if(pending.notifications.length)await LocalNotifications.cancel({notifications:pending.notifications.map(n=>({id:n.id}))});",
"     await LocalNotifications.removeAllDeliveredNotifications();",
"     if(background)await configureBackground(favorites,true,false,stagePrefs);",
"    }",
"   }catch(e){setLastError('Уведомления отключены; очистка ранее показанных: '+String(e));}",
"   return;",
"  }",
"  try{",
"   const yes=await requestAlerts();setAlerts(yes);",
"   if(!yes)setLastError('Уведомления запрещены в настройках Android.');",
"   else if(background)await configureBackground(favorites,true,true,stagePrefs);",
"  }catch(e){setLastError('Не удалось включить уведомления: '+String(e));}",
" };"
].join('\n');
rep(currentFn,toggleFn,'notification toggle function');
rep('aria-label="Разрешить уведомления" onClick={()=>void requestNotifications()}','aria-label={alerts?"Отключить уведомления":"Включить уведомления"} onClick={()=>void toggleNotifications()}','notification button action');
rep("{alerts?'Разрешены':'Разрешить'}","{alerts?'Отключить':'Включить'}",'notification button text');
const settingsAnchor='   <div className="p-4 space-y-3"><h3 className="text-sm font-semibold">Уведомлять только об этапах сигналов</h3>';
const screenUi=[
'   <div className="p-4 flex items-center gap-3">',
'    <span aria-hidden="true" className="text-teal-300 text-xl">☀</span>',
'    <div className="flex-1"><h3 className="font-semibold text-sm">Не гасить экран</h3><p className="text-xs text-slate-400 mt-1">Только пока APEX открыт. В фоне Android снова может выключить экран. Расход батареи увеличится.</p></div>',
'    <button type="button" aria-label="Переключить режим не гасить экран" aria-pressed={keepScreenOn} onClick={()=>setKeepScreenOn(v=>!v)} className={keepScreenOn?"rounded-lg px-3 py-2 text-xs font-bold bg-teal-500/20 text-teal-300":"rounded-lg px-3 py-2 text-xs font-bold bg-slate-800 text-slate-200"}>{keepScreenOn?"Включено":"Выключено"}</button>',
'   </div>'
].join('\n')+'\n';
rep(settingsAnchor,screenUi+settingsAnchor,'screen-on control');
rep('onClick={()=>void testNotification().catch(e=>setLastError(String(e)))}','disabled={!alerts} onClick={()=>void testNotification().catch(e=>setLastError(String(e)))}','test notification disabled');
rep('>Отправить тест</button>','>{alerts?"Отправить тест":"Оповещения выключены"}</button>','test notification label');
const metrics=" const stats=useMemo(()=>scenarioStats(scenarios),[scenarios]);";
rep(metrics,metrics+"\n const learningReport=useMemo(()=>learningOverview(learning),[learning]);",'learning analytics');
const marker='   <section className="rounded-2xl border border-teal-500/20 bg-[#101a2a] p-3 space-y-2">';
rep(marker,read('updates/v30-learning-ui.txt')+'\n'+marker,'Learning panel');
rep('РЫНОЧНЫЙ РАДАР • 2.9','РЫНОЧНЫЙ РАДАР • 3.0','version');
write('src/App.tsx',app);
fs.copyFileSync('updates/learning.ts','src/radar/learning.ts');
fs.copyFileSync('updates/device.ts','src/radar/device.ts');
fs.copyFileSync('updates/test-learning.cjs','scripts/test-learning.cjs');
let pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-learning.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
const javaPath='native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java';
let java=read(javaPath);const javaAnchor='    @PluginMethod public void heartbeat(PluginCall call){';
if(!java.includes(javaAnchor))throw Error('Native screen plugin anchor missing');
const nativeMethod=[
'    @PluginMethod public void setKeepScreenOn(PluginCall call){',
'        boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled",false));',
'        android.app.Activity activity=getActivity();',
'        if(activity==null){call.reject("Android activity unavailable");return;}',
'        prefs().edit().putBoolean("keepScreenOn",enabled).apply();',
'        activity.runOnUiThread(()->{',
'            if(enabled)activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
'            else activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
'        });',
'        JSObject out=new JSObject();out.put("enabled",enabled);call.resolve(out);',
'    }'
].join('\n')+'\n';
java=java.replace(javaAnchor,nativeMethod+javaAnchor);write(javaPath,java);
const mainPath='native/android/app/src/main/java/com/apexintelligence/monitor/MainActivity.java';
let main=read(mainPath);const mainAnchor='    @Override protected void onNewIntent(Intent intent){';
// MainActivity may not contain onNewIntent in every release; insert before the final class brace.
const lifecycle=[
'    @Override protected void onResume(){',
'        super.onResume();',
'        if(getSharedPreferences(BackgroundMonitorPlugin.PREF,Context.MODE_PRIVATE).getBoolean("keepScreenOn",false))',
'            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
'        else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
'    }',
'    @Override protected void onPause(){',
'        getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
'        super.onPause();',
'    }'
].join('\n')+'\n';
if(main.includes(mainAnchor))main=main.replace(mainAnchor,lifecycle+mainAnchor);\nelse if(/\\}\s*$/.test(main))main=main.replace(/\\}\s*$/,lifecycle+'\n}\n');\nelse throw Error('MainActivity class brace missing');write(mainPath,main);
fs.appendFileSync('README.md','\n\n## APEX 3.0 Learning Engine (initial release)\n- Stores only new paper scenarios created after Learning was enabled, with immutable entry-time context if fresh.\n- Tracks TP1/TP2/TP3, stops, cancellations, expiry per timeframe. Old statistics are excluded from new evaluation.\n- Separate global notification on/off switch; disabling also clears previously delivered local alerts.\n- Android FLAG_KEEP_SCREEN_ON is optional and active only while APEX is on screen (battery impact).\n- Does not place real exchange orders and cannot claim proven prediction accuracy.\n');
console.log('APEX 3.0 Learning + notification mute + Android keepScreenOn patch applied');
