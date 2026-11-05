/** Apply APEX 2.6 stage-only notifications, branding and Android insets AFTER the 2.5 patch. */
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const requireChange=(s,from,to,label)=>{
 if(!s.includes(from))throw Error('APEX 2.6 patch mismatch: '+label);
 return s.replace(from,to);
};
fs.copyFileSync('updates/v26-stages.ts','src/radar/stages.ts');
fs.copyFileSync('updates/v26-notify.ts','src/radar/notify.ts');
fs.copyFileSync('updates/v26-test.cjs','scripts/test-stages.cjs');
let pkg=read('package.json');
pkg=requireChange(pkg,'node scripts/test-watch.cjs"','node scripts/test-watch.cjs && node scripts/test-stages.cjs"','tests');
write('package.json',pkg);
let conf=read('capacitor.config.ts');
conf=requireChange(conf,"plugins:{CapacitorHttp:{enabled:true}}","plugins:{CapacitorHttp:{enabled:true},LocalNotifications:{smallIcon:'ic_apex_notification',iconColor:'#36D7C2'}}",'notification icon config');
write('capacitor.config.ts',conf);

let app=read('src/App.tsx');
app=requireChange(app,"import {estimateEarlyHeadsUp} from './radar/early';\n",'','early imports');
app=requireChange(app,"import {configureBackground,getBackgroundStatus,getNativeScenarioUpdates,nativeForegroundHeartbeat,syncNativeScenarios,testNotification,publishSignal,publishEarlyWatch,publishScenarioStage,requestAlerts,retainAlert} from './radar/notify';",
"import {configureBackground,getBackgroundStatus,getNativeScenarioUpdates,getOpenedScenarioId,nativeForegroundHeartbeat,syncNativeScenarios,testNotification,publishScenarioStage,requestAlerts,retainAlert} from './radar/notify';\nimport {loadStagePrefs,STAGE_KEYS,type StagePrefs} from './radar/stages';",'notification imports');
app=app.replace(/^ const \[earlyAlerts,setEarlyAlerts\].*$/m," const [stagePrefs,setStagePrefs]=useState<StagePrefs>(()=>loadStagePrefs(localStorage.getItem('apex_v26_notification_prefs')));");
app=requireChange(app,' const earlyRef=useRef(earlyAlerts);','','early reference');
app=requireChange(app,' const notifyRef=useRef(false);','','notify reference');
app=app.replace(/^ useEffect\(\(\)=>\{earlyRef\.current=earlyAlerts;.*$/m," useEffect(()=>{try{localStorage.setItem('apex_v26_notification_prefs',JSON.stringify(stagePrefs));}catch{}},[stagePrefs]);");
app=app.replace(/^ useEffect\(\(\)=>\{notifyRef\.current=alerts;.*$/m," useEffect(()=>{try{localStorage.setItem('apex_v2_alerts',String(alerts));}catch{}},[alerts]);");
app=app.replace(/^      try\{localStorage\.setItem\(\`apex_lifecycle_alert_.*$/m,"      try{localStorage.setItem('apex_v26_stage_sent_'+item.id,item.status+':'+(item.tpReached||0));}catch{}");
app=requireChange(app,"  void applyBackgroundUpdates();void nativeForegroundHeartbeat().catch(()=>{});",
"  void applyBackgroundUpdates();void nativeForegroundHeartbeat().catch(()=>{});void checkOpenedScenario();",'initial tap');
app=requireChange(app," const onResume=()=>{if(!document.hidden){void nativeForegroundHeartbeat().catch(()=>{});void applyBackgroundUpdates();}};",
" const onResume=()=>{if(!document.hidden){void nativeForegroundHeartbeat().catch(()=>{});void applyBackgroundUpdates();void checkOpenedScenario();}};",'resume tap');
app=requireChange(app,"  document.addEventListener('visibilitychange',onResume);",
"  document.addEventListener('visibilitychange',onResume);window.addEventListener('focus',onResume);",'focus tap');
app=requireChange(app,"  const timer=setInterval(()=>{if(!document.hidden){void nativeForegroundHeartbeat().catch(()=>{});void applyBackgroundUpdates();}},60_000);",
"  const timer=setInterval(()=>{if(!document.hidden){void nativeForegroundHeartbeat().catch(()=>{});void applyBackgroundUpdates();void checkOpenedScenario();}},60_000);",'tap polling');
app=requireChange(app,"  return ()=>{document.removeEventListener('visibilitychange',onResume);clearInterval(timer);};",
"  return ()=>{document.removeEventListener('visibilitychange',onResume);window.removeEventListener('focus',onResume);clearInterval(timer);};",'listener cleanup');
app=app.replace(/void publishScenarioStage\(x\)\.catch\(\(\)=>\{\}\)/g,'void publishScenarioStage(x,stagePrefs).catch(()=>{})');
app=app.replace(/\[scenarios,alerts,favorites\.join\(','\)\]/g,"[scenarios,alerts,stagePrefs,favorites.join(',')]");
const start=app.indexOf('   const watch=decision.signal;');
const end=app.indexOf('\n  }\n  if(watchChanged',start);
if(start<0||end<start)throw Error('Could not remove early WATCH notification path');
app=app.slice(0,start)+app.slice(end);
app=app.replace(' const recompute=(asset:AssetState,emit=false,live=false)=>{',' const recompute=(asset:AssetState,emit=false)=>{');
app=app.replace('recompute(next,Boolean(candle),Boolean(ev.price||ev.trade))','recompute(next,Boolean(candle))');
app=app.replace(/configureBackground\(favorites,next,alerts,earlyAlerts\)/g,'configureBackground(favorites,next,alerts,stagePrefs)');
app=app.replace(/configureBackground\(favorites,true,alerts,earlyAlerts\)/g,'configureBackground(favorites,true,alerts,stagePrefs)');
app=app.replace(/\[favorites\.join\(','\),background,alerts,earlyAlerts\]/g,"[favorites.join(','),background,alerts,stagePrefs]");
app=requireChange(app,'РЫНОЧНЫЙ РАДАР • 2.5','РЫНОЧНЫЙ РАДАР • 2.6','version');
const earlyLine=app.split('\n').find(s=>s.includes('setEarlyAlerts(v=>!v)'));
if(!earlyLine)throw Error('Early watch setting not found');
const stageUi=[
'   <div className="p-4 space-y-3"><h3 className="text-sm font-semibold">Уведомлять только об этапах сигналов</h3>',
'    <p className="text-xs text-slate-400">Подготовки WATCH остаются в радаре без уведомлений. Одна обновляемая Android-карточка на сценарий.</p>',
'    {STAGE_KEYS.map(k=><label key={k} className="flex items-center justify-between gap-3 text-sm">',
'      <span className="text-slate-300">{({PENDING:"🟡 Новый лимитный сигнал",ACTIVE:"🔵 Активация входа",TP1:"🔵 Цель TP1",TP2:"🔵 Цель TP2",TARGET:"🟢 Финальная TP3",STOP:"🔴 Стоп",CANCELLED:"⚪ Отмена сценария",EXPIRED:"⚪ Истёк без входа"} as Record<string,string>)[k]}</span>',
'      <input type="checkbox" checked={stagePrefs[k]} onChange={e=>setStagePrefs(p=>({...p,[k]:e.target.checked}))} className="h-5 w-5 accent-teal-400" /></label>)}',
'   </div>'
].join('\n');
app=requireChange(app,earlyLine,stageUi,'stage toggles');
app=app.replace('Сообщать о новом сценарии, но не чаще раза в 30 минут на пару и направление','Уведомления об изменении состояний виртуальных сценариев');
app=app.replace('Предварительные предупреждения об уровне приходят раньше подтверждения, когда скорость и расстояние это позволяют. Оценка «около 5 минут» приблизительна: цена может ускориться или развернуться. Когда приложение открыто, WebSocket передаёт сделки и котировки почти сразу.',
'Подготовки WATCH видны только в радаре. Телефон уведомляет о появлении лимитного сценария и выбранных этапах его сопровождения. Когда приложение открыто, WebSocket передаёт котировки почти сразу.');
app=app.replace("CANCELLED:'border-rose-500/35 bg-rose-950/15 text-rose-300'","CANCELLED:'border-slate-500/35 bg-slate-900/30 text-slate-300'");
app=app.replace("CANCELLED:'🔴 Отменён'","CANCELLED:'⚪ Отменён'");
app=requireChange(app," const [selectedDetail,setSelectedDetail]=useState<string|null>(null);",
" const [selectedDetail,setSelectedDetail]=useState<string|null>(null);\n const [highlightScenario,setHighlightScenario]=useState<string>('');\n const checkOpenedScenario=async()=>{try{const id=await getOpenedScenarioId();if(id){setSelectedDetail(null);setView('history');setHighlightScenario(id);}}catch{}};\n useEffect(()=>{if(view!=='history'||!highlightScenario)return;const timer=setTimeout(()=>document.getElementById('scenario-'+highlightScenario)?.scrollIntoView({behavior:'smooth',block:'center'}),120);return ()=>clearTimeout(timer);},[view,highlightScenario]);",'tap routing');
app=requireChange(app,"{scenarios.map(x=><ScenarioCard key={x.id} scenario={x} now={now}/>)",
"{scenarios.map(x=><div key={x.id} id={'scenario-'+x.id} className={highlightScenario===x.id?'rounded-2xl ring-2 ring-teal-400':''}><ScenarioCard scenario={x} now={now}/></div>)",'signal focus');
const marker=" useEffect(()=>{const timer=setInterval(()=>setScenarios(xs=>";
app=requireChange(app,marker,
" useEffect(()=>{let dispose=()=>{};if(Capacitor.isNativePlatform()){void LocalNotifications.addListener('localNotificationActionPerformed',ev=>{const id=ev.notification?.extra?.scenarioId;if(typeof id==='string'&&id){setView('history');setSelectedDetail(null);setHighlightScenario(id);}}).then(listener=>{dispose=()=>{void listener.remove();}}).catch(()=>{});}return ()=>dispose();},[]);\n"+marker,'notification tap listener');
write('src/App.tsx',app);

let plugin=read('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java');
plugin=requireChange(plugin,'import java.util.HashSet;','import java.util.HashSet;\nimport java.util.Arrays;','java import');
plugin=requireChange(plugin,'        boolean earlyEnabled=Boolean.TRUE.equals(call.getBoolean("earlyEnabled",true));',
'        JSArray stagesRaw=call.getArray("stages");\n        Set<String> stages=new HashSet<>();\n        if(stagesRaw!=null)for(int i=0;i<stagesRaw.length();i++){\n            String s=stagesRaw.optString(i,"");\n            if(Arrays.asList("PENDING","ACTIVE","TP1","TP2","TARGET","STOP","CANCELLED","EXPIRED").contains(s))stages.add(s);\n        }','native stage parsing');
plugin=requireChange(plugin,'putBoolean("notifyEnabled",notifyEnabled).putBoolean("earlyEnabled",earlyEnabled)\n            .putStringSet("symbols",symbols).apply();',
'putBoolean("notifyEnabled",notifyEnabled)\n            .putStringSet("symbols",symbols).putStringSet("stages",stages).apply();','native stage persistence');
plugin=requireChange(plugin,'    @PluginMethod public void heartbeat(PluginCall call){',
'    @PluginMethod public void openedScenario(PluginCall call){\n        String id=prefs().getString("openedScenario","");\n        prefs().edit().remove("openedScenario").apply();\n        JSObject out=new JSObject();out.put("id",id);call.resolve(out);\n    }\n    @PluginMethod public void heartbeat(PluginCall call){','native scenario tap');
write('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java',plugin);

let worker=read('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundScanWorker.java');
worker=requireChange(worker,'import android.app.NotificationManager;','import android.app.NotificationManager;\nimport android.graphics.BitmapFactory;','large icon import');
const early=worker.indexOf('        if(direction==null){');
const until=worker.indexOf('        long candle=last.getLong(0);',early);
if(early<0||until<early)throw Error('Could not suppress background WATCH notifications');
worker=worker.slice(0,early)+'        // WATCH only in UI; background must never announce preparations.\n        if(direction==null)return changes;\n'+worker.slice(until);
const footer=worker.indexOf('    private void emit(Context ctx,SharedPreferences prefs,JSONArray events,JSONObject scenario){');
if(footer<0)throw Error('Worker notification footer missing');
const finalSection=[
'    private void emit(Context ctx,SharedPreferences prefs,JSONArray events,JSONObject scenario){',
'        events.put(scenario);',
'        if(!prefs.getBoolean("notifyEnabled",true)||System.currentTimeMillis()-prefs.getLong("lastForegroundAt",0)<120_000)return;',
'        String status=scenario.optString("status"),frame=scenario.optString("frame","5m").toUpperCase(Locale.US);',
'        String stage="ACTIVE".equals(status)&&scenario.optInt("tpReached",0)>0?"TP"+scenario.optInt("tpReached",0):status;',
'        Set<String> enabled=prefs.getStringSet("stages",null);',
'        if(enabled!=null&&!enabled.contains(stage))return;',
'        String id=scenario.optString("id","");if(id.isEmpty())return;',
'        String state=status+":"+scenario.optInt("tpReached",0),key="posted_"+id;',
'        if(state.equals(prefs.getString(key,"")))return;',
'        String label="PENDING".equals(status)?"🟡 Ожидает входа":"ACTIVE".equals(status)?',
'            (scenario.optInt("tpReached",0)>0?"🔵 TP"+scenario.optInt("tpReached",0)+" достигнута":"🔵 Вход активирован"):',
'            "TARGET".equals(status)?"🟢 Достигнута TP3":"STOP".equals(status)?"🔴 Стоп достигнут":',
'            "EXPIRED".equals(status)?"⚪ Истёк срок ожидания":"⚪ Сценарий отменён";',
'        String details="PENDING".equals(status)?"Entry "+format(scenario.optDouble("entry"))+" | SL "+format(scenario.optDouble("stop")):',
'            scenario.optString("resultNote","Состояние обновлено");',
'        postNotification(ctx,id,"APEX · "+scenario.optString("symbol")+" "+frame+" "+scenario.optString("direction"),label+". "+details);',
'        prefs.edit().putString(key,state).apply();',
'    }',
'    private static String format(double d){return String.format(Locale.US,"%.6g",d);}',
'    static void postNotification(Context ctx,String key,String title,String message){',
'        if(Build.VERSION.SDK_INT>=33&&ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;',
'        NotificationManager mgr=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);if(mgr==null)return;',
'        String channel="apex_signals";',
'        if(Build.VERSION.SDK_INT>=26){NotificationChannel ch=new NotificationChannel(channel,"APEX: этапы сигналов",NotificationManager.IMPORTANCE_DEFAULT);mgr.createNotificationChannel(ch);}',
'        Intent intent=new Intent(ctx,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);',
'        if(!"apex_test".equals(key))intent.putExtra("scenarioId",key);',
'        int id=key.hashCode()&0x7fffffff;',
'        PendingIntent open=PendingIntent.getActivity(ctx,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);',
'        Notification n=new NotificationCompat.Builder(ctx,channel).setSmallIcon(R.drawable.ic_apex_notification)',
'            .setLargeIcon(BitmapFactory.decodeResource(ctx.getResources(),R.drawable.apex_notification_large))',
'            .setColor(0xff36D7C2).setContentTitle(title).setContentText(message)',
'            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))',
'            .setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_DEFAULT).setContentIntent(open).build();',
'        mgr.notify(id,n);',
'    }',
'}',''
].join('\n');
worker=worker.slice(0,footer)+finalSection;
write('native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundScanWorker.java',worker);

fs.copyFileSync('updates/v26-main.java','native/android/app/src/main/java/com/apexintelligence/monitor/MainActivity.java');
const iconDir='native/android/app/src/main/res/drawable';
fs.mkdirSync(iconDir,{recursive:true});
fs.copyFileSync('updates/v26-icon.xml',path.join(iconDir,'ic_apex_notification.xml'));
fs.copyFileSync('native/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',path.join(iconDir,'apex_notification_large.png'));
console.log('APEX 2.6 notification stages + Android safe area patch applied');
