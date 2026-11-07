/** APEX 7.8: genuine Android CORE WorkManager facts and opt-in on-resume
 * interruption notices. Futures DEMO remains foreground-only and never uses
 * missing bars to invent paper-trading outcomes.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.8 '+label+' matches='+n);return s.replace(a,b);}
for(const f of ['v78-observation-notices.ts','v78-notification-publisher.ts'])fs.copyFileSync('updates/'+f,'src/radar/'+f);
fs.copyFileSync('updates/test-v78-background.cjs','scripts/test-v78-background.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {restoreMonitorJournal,startMonitorSession,noteMonitorVisibility,noteMonitorNetwork,noteMonitorSuccess,noteMonitorFailure,monitorRows,monitorOverview,hasFreshSourceEvidence,type MonitorJournal} from './radar/v77-monitor-health';",
 "import {restoreMonitorJournal,startMonitorSession,noteMonitorVisibility,noteMonitorNetwork,noteMonitorSuccess,noteMonitorFailure,monitorRows,monitorOverview,hasFreshSourceEvidence,type MonitorJournal} from './radar/v77-monitor-health';\nimport {restoreNoticePreferences,setNoticePermission,pickMonitoringNotice,recordMonitoringNotice,explainAndroidBackground,type NoticePreferences} from './radar/v78-observation-notices';\nimport {publishObservationNotice} from './radar/v78-notification-publisher';",
 'observation notices and real-background imports');
app=rep(app,
 " const [monitorJournal,setMonitorJournal]=useState<MonitorJournal>(()=>restoreMonitorJournal(localStorage.getItem('apex_v77_observation_health'),Date.now()));",
 [
 " const [monitorJournal,setMonitorJournal]=useState<MonitorJournal>(()=>restoreMonitorJournal(localStorage.getItem('apex_v77_observation_health'),Date.now()));",
 " const [monitorNotices,setMonitorNotices]=useState<NoticePreferences>(()=>restoreNoticePreferences(localStorage.getItem('apex_v78_monitor_notice_settings'),Date.now()));",
 " const [monitorNoticeMessage,setMonitorNoticeMessage]=useState('');",
 " const monitorNoticeBusy=useRef(false);"
 ].join('\n'),
 'opt-in alert settings, persisted locally');
const uiHook=[
 " const backgroundTruth=useMemo(()=>explainAndroidBackground(coreReliabilityState,monitorJournal,monitorFeedRows.length,now),[coreReliabilityState,monitorJournal,monitorFeedRows.length,now]);",
 " const toggleMonitorNotices=async()=>{",
 "  if(monitorNotices.enabled){setMonitorNotices(p=>setNoticePermission(p,false,Date.now()));setMonitorNoticeMessage('Уведомления о перерывах выключены.');return;}",
 "  if(!alerts){setMonitorNoticeMessage('Сначала включи общие уведомления в Настройках.');return;}",
 "  if(!Capacitor.isNativePlatform()){setMonitorNoticeMessage('Системные уведомления доступны только на Android.');return;}",
 "  try{",
 "   const granted=await requestAlerts();",
 "   if(!granted){setMonitorNoticeMessage('Android не разрешил уведомления. Можно включить их в настройках устройства.');return;}",
 "   setMonitorNotices(p=>setNoticePermission(p,true,Date.now()));",
 "   setMonitorNoticeMessage('Уведомления о перерывах включены. Старые события не будут отправлены заново.');",
 "  }catch(e){setMonitorNoticeMessage('Не удалось запросить разрешение Android: '+String(e));}",
 " };",
 " useEffect(()=>{try{localStorage.setItem('apex_v78_monitor_notice_settings',JSON.stringify(monitorNotices));}",
 "  catch{setMonitorNoticeMessage('Настройки уведомлений не сохранились на этом устройстве.');}",
 " },[monitorNotices]);",
 " useEffect(()=>{",
 "  if(!alerts||!Capacitor.isNativePlatform()||document.hidden||monitorNoticeBusy.current)return;",
 "  const notice=pickMonitoringNotice(monitorJournal,monitorNotices,Date.now());if(!notice)return;",
 "  monitorNoticeBusy.current=true;",
 "  void publishObservationNotice(notice).then(sent=>{",
 "   if(sent){setMonitorNotices(old=>recordMonitoringNotice(old,notice,Date.now()));}",
 "   else {",
 "    setMonitorNotices(old=>setNoticePermission(old,false,Date.now()));",
 "    setMonitorNoticeMessage('Android отключил системные уведомления. Разрешение можно запросить снова вручную.');",
 "   }",
 "  }).catch(e=>{setMonitorNoticeMessage('Ошибка информационного уведомления: '+String(e));})",
 "   .finally(()=>{monitorNoticeBusy.current=false;});",
 " },[alerts,monitorJournal,monitorNotices]);"
].join('\n');
app=rep(app,
 " const monitorCounts=useMemo(()=>monitorOverview(monitorFeedRows),[monitorFeedRows]);",
 " const monitorCounts=useMemo(()=>monitorOverview(monitorFeedRows),[monitorFeedRows]);\n"+uiHook,
 'native facts, user consent and rate-limited interruptions');
app=rep(app,read('updates/v77-monitor-ui.txt'),
 read('updates/v77-monitor-ui.txt')+'\n'+read('updates/v78-background-panel.txt'),
 'show native CORE facts and consented notifications after Futures health');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.7','РЫНОЧНЫЙ РАДАР • 7.8','version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.7','РЫНОЧНЫЙ РАДАР • 7.8'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v78-background.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.8 — truthful Android background status and opt-in low-noise observation interruption alerts\n- On the Futures DEMO Assistant, the native Android WorkManager CORE research state (actual WorkInfo plus last completed CORE scan) is displayed distinctly from the foreground-only selected Binance/Bybit Futures DEMO feed journal. The existing 15-minute CORE periodic worker is NOT a Futures worker. Existing WorkManager scheduler and repair logic are reused, not duplicated or falsely extended. Android Doze/network/force-stop can delay or prevent background execution.\n- Optional monitoring-health notifications are off by default and require explicit user enabling and granted Android notification permission. While the WebView is running (often on return to the app), a notice may describe a >=10-minute interruption, ongoing offline status, repeated public endpoint errors or recorded gaps in closed candles. Maximum 1 per 30 minutes and 3 per 24 hours, no notifications for historical records before opting in, bounded seen-event memory and no browser/Android background notification guarantees.\n- No modification to saved Radar favorites, 4 selected Futures DEMO assets, Binance/Bybit separation, rolling 64 checkpoints, paper ledger, independent study protocol, research hypotheses, model weights, signal entries or exchange accounts. No real order submission, financial notifications or data backfills.\n');
console.log('APEX 7.8 real scheduler truth and opt-in low-frequency interruption notices installed');
