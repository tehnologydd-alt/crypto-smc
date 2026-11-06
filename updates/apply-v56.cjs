/** APEX 5.6: Android CORE WorkManager diagnostics, bounded missing-job repair, no new UI levels. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 5.6 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/core-reliability.ts','src/radar/core-reliability.ts');
fs.copyFileSync('updates/test-core-reliability.cjs','scripts/test-core-reliability.cjs');
let bridge=read('src/radar/core-background.ts');
bridge=rep(bridge,
" runCoreNow():Promise<unknown>;",
" runCoreNow():Promise<unknown>;\n coreReliability():Promise<unknown>;",
'plugin contract');
bridge+='\n'+read('updates/v56-core-bridge.txt');
write('src/radar/core-background.ts',bridge);
const nativePath='native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java';
let native=read(nativePath);
native=rep(native,'    private JSObject coreStatusObject(){',
read('updates/v56-native-method.txt')+'\n    private JSObject coreStatusObject(){',
'native WorkManager diagnostic/repair API');
write(nativePath,native);
let app=read('src/App.tsx');
app=rep(app,
"import {researchCouncil} from './radar/research-council';",
"import {researchCouncil} from './radar/research-council';\nimport {getCoreReliabilityStatus,type CoreReliabilityNativeState} from './radar/core-background';\nimport {coreReliabilitySummary} from './radar/core-reliability';",
'reliability imports');
app=rep(app,
" const [coreNativeMessage,setCoreNativeMessage]=useState('');",
" const [coreNativeMessage,setCoreNativeMessage]=useState('');\n const [coreReliabilityState,setCoreReliabilityState]=useState<CoreReliabilityNativeState>({supported:false,enabled:false,scheduled:false,workState:'UNKNOWN',repairQueued:false,lastRepairAt:0,checkedAt:0,lastRunAt:0,bufferEntries:0,lastResult:''});\n const [coreReliabilityBusy,setCoreReliabilityBusy]=useState(false);\n const [coreReliabilityMessage,setCoreReliabilityMessage]=useState('');",
'CORE reliability state');
const effectMarker=" const toggleCoreNative=async()=>{";
const effects=[
" useEffect(()=>{",
"  let mounted=true,inFlight=false,lastCheck=0;",
"  const check=()=>{if(document.hidden||inFlight||Date.now()-lastCheck<90_000)return;",
"   inFlight=true;lastCheck=Date.now();",
"   void getCoreReliabilityStatus().then(x=>{if(mounted)setCoreReliabilityState(x);})",
"    .catch(e=>{if(mounted)setCoreReliabilityMessage('Не удалось прочитать диагностику Android CORE: '+String(e));})",
"    .finally(()=>{inFlight=false;});",
"  };",
"  check();",
"  const onResume=()=>{if(!document.hidden)check();};",
"  document.addEventListener('visibilitychange',onResume);",
"  window.addEventListener('focus',onResume);",
"  const interval=setInterval(onResume,300_000);",
"  return ()=>{mounted=false;clearInterval(interval);document.removeEventListener('visibilitychange',onResume);window.removeEventListener('focus',onResume);};",
" },[]);",
" const refreshCoreReliability=async()=>{",
"  if(coreReliabilityBusy)return;setCoreReliabilityBusy(true);setCoreReliabilityMessage('');",
"  try{setCoreReliabilityState(await getCoreReliabilityStatus());}",
"  catch(e){setCoreReliabilityMessage('Диагностика CORE: '+String(e));}",
"  finally{setCoreReliabilityBusy(false);}",
" };",
""
].join('\n');
app=rep(app,effectMarker,effects+'\n'+effectMarker,'foreground-only WorkManager checks');
const memoMarker=" const coreResearchStats=useMemo(()=>coreResearchReport(coreResearch,now),[coreResearch,now]);";
app=rep(app,memoMarker,memoMarker+"\n const coreHealth=useMemo(()=>coreReliabilitySummary(coreNative,coreReliabilityState,coreResearchStats,coreMemoryQuarantined,replicationBroken,now),[coreNative,coreReliabilityState,coreResearchStats,coreMemoryQuarantined,replicationBroken,now]);",
'derived health status');
app=rep(app,
'<p className="text-[11px] text-slate-400">{coreNative.lastResult}</p>',
'<p className="text-[11px] text-slate-400">{coreNative.lastResult}</p>\n'+read('updates/v56-reliability-ui.txt'),
'inline CORE health: no nested tabs');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.5','РЫНОЧНЫЙ РАДАР • 5.6','version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-core-reliability.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.6 CORE autonomy and safe recovery\n- The existing single shared WorkManager periodic job remains the sole periodic scheduler. An Android plugin method asynchronously checks WorkInfo for this unique job on app launch/resume, plus on-demand status requests. It never schedules another periodic timer or silently turns CORE on.\n- If CORE was explicitly enabled but that periodic job truly disappeared, a cooldown-limited (30 min) repair re-enqueues the EXISTING shared job. A still-ENQUEUED or RUNNING task delayed by OS Doze/network is not reset. The app cannot override force-stop/background restrictions and does not guarantee any exact scan interval.\n- Diagnostic UI lives directly inside the existing CORE background collection card, not in the Research Director accordion stack. It reports real last completed scan, delayed vs missing work, recent native buffer size and quarantined research storage. No virtual observations, backfilling, changing study baselines, forecast creation or notification changes.\n- Research memory and replication quarantine statuses retain their existing protective semantics; read-only diagnosis does not overwrite damaged local records.\n');
console.log('APEX 5.6 native WorkManager reliability inspector and guarded schedule repair installed');
