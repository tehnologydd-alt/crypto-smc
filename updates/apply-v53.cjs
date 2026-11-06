/** APEX 5.3: validated long-lived CORE memory and safe Android file backup/merge. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){if(!s.includes(a))throw Error('APEX 5.3 missing '+name);return s.replace(a,b);}
fs.copyFileSync('updates/core-memory.ts','src/radar/core-memory.ts');
fs.copyFileSync('updates/test-core-memory.cjs','scripts/test-core-memory.cjs');
let vaultFile=read('src/radar/vault-file.ts');
vaultFile=rep(vaultFile,
"export async function writeResearchBackup(contents:string):Promise<boolean>{",
"export async function writeResearchBackup(contents:string,prefix:'APEX-Research'|'APEX-CORE-Memory'='APEX-Research'):Promise<boolean>{",
'optional backup filename without changing existing Vault 3.2');
vaultFile=rep(vaultFile,
"const filename='APEX-Research-'+date.getFullYear()",
"const filename=prefix+'-'+date.getFullYear()",
'choose safe backup prefix');
write('src/radar/vault-file.ts',vaultFile);
const nativePath='native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java';
let native=read(nativePath);
native=rep(native,'!content.contains("apex-research-vault")',
'(!content.contains("apex-research-vault")&&!content.contains("apex-core-memory-v1"))',
'allow new research-only backup schema');
native=rep(native,'APEX-Research-[A-Za-z0-9-]{0,50}',
'APEX-(?:Research|CORE-Memory)-[A-Za-z0-9-]{0,50}',
'allow new fixed filename prefix in Android SAF');
write(nativePath,native);
let app=read('src/App.tsx');
app=rep(app,
"import {openResearchReviews,advanceResearchReviews,researchReviewOverview} from './radar/research-reports';",
"import {openResearchReviews,advanceResearchReviews,researchReviewOverview} from './radar/research-reports';\nimport {openCoreMemory,appendCoreMemory,coreMemoryStats,exportCoreMemory,importCoreMemory,mergeCoreMemory,validateCoreMemory} from './radar/core-memory';",
'archive module imports');
app=rep(app,
" const [reviewReportsExpanded,setReviewReportsExpanded]=useState(false);",
" const [reviewReportsExpanded,setReviewReportsExpanded]=useState(false);\n const [coreMemoryExpanded,setCoreMemoryExpanded]=useState(false);\n const [coreMemoryBusy,setCoreMemoryBusy]=useState(false);\n const [coreMemoryMessage,setCoreMemoryMessage]=useState('');\n const [coreMemory,setCoreMemory]=useState(()=>openCoreMemory(localStorage.getItem('apex_v53_core_memory'),Date.now()));\n const [coreMemoryQuarantined,setCoreMemoryQuarantined]=useState(()=>{const raw=localStorage.getItem('apex_v53_core_memory');if(raw===null)return false;try{return !validateCoreMemory(JSON.parse(raw),Date.now());}catch{return true;}});",
'archival state');
const marker=" const reviewReportStats=useMemo(()=>researchReviewOverview(researchReviews,researchQueue),[researchReviews,researchQueue]);";
const block=[
" const memoryStats=useMemo(()=>coreMemoryStats(coreMemory),[coreMemory]);",
" const coreMemoryDay=Math.floor(now/86400000);",
" useEffect(()=>{",
"  if(coreMemoryQuarantined)return;\n  try{const next=appendCoreMemory(coreMemory,{core:coreResearch,transitions:transitionStats.evidence,context:contextLedger,reviews:researchReviews},Date.now());",
"   if(next!==coreMemory)setCoreMemory(next);",
"  }catch(e){setCoreMemoryMessage('Архив сохранён без изменений: '+String(e));}",
" },[coreResearch,contextLedger,researchReviews,coreMemoryDay,coreMemory,coreMemoryQuarantined]);",
" useEffect(()=>{if(coreMemoryQuarantined){setCoreMemoryMessage('Локальный архив повреждён: автоматическая запись остановлена. Импортируйте исправную копию.');return;}try{localStorage.setItem('apex_v53_core_memory',JSON.stringify(coreMemory));}catch(e){setCoreMemoryMessage('Ошибка записи долговременной памяти: '+String(e));}},[coreMemory,coreMemoryQuarantined]);",
" const exportCoreMemoryFile=async()=>{",
"  if(coreMemoryBusy)return;setCoreMemoryBusy(true);setCoreMemoryMessage('');",
"  try{const content=exportCoreMemory(coreMemory,Date.now());",
"   const ok=await writeResearchBackup(content,'APEX-CORE-Memory');",
"   setCoreMemoryMessage(ok?'Резервная копия архива сохранена в выбранный файл.':'Сохранение отменено.');",
"  }catch(e){setCoreMemoryMessage('Ошибка резервного копирования: '+String(e));}finally{setCoreMemoryBusy(false);}",
" };",
" const restoreCoreMemoryFile=async()=>{",
"  if(coreMemoryBusy)return;setCoreMemoryBusy(true);setCoreMemoryMessage('');",
"  try{const file=await readResearchBackup();if(file===null){setCoreMemoryMessage('Выбор файла отменён.');return;}",
"   const backup=importCoreMemory(file,Date.now());",
"   const merged=mergeCoreMemory(coreMemory,backup,Date.now());",
"   const added=merged.days.length-coreMemory.days.length+merged.h1.length-coreMemory.h1.length+merged.h4.length-coreMemory.h4.length+merged.reports.length-coreMemory.reports.length;",
"   if(added===0){setCoreMemoryMessage('Все данные архива уже есть.');return;}",
"   if(!window.confirm('Импортировать '+added+' новых записей в долгосрочный архив CORE? Рабочие сигналы и активные исследования не затрагиваются.')){setCoreMemoryMessage('Импорт отменён.');return;}",
"   localStorage.setItem('apex_v53_core_memory',JSON.stringify(merged));",
"   setCoreMemory(merged);setCoreMemoryQuarantined(false);setCoreMemoryMessage('Архив восстановлен: добавлено '+added+' записей.');",
"  }catch(e){setCoreMemoryMessage('Импорт заблокирован: '+String(e));}finally{setCoreMemoryBusy(false);}",
" };"
].join('\n');
app=rep(app,marker,marker+'\n'+block,'archive derived info, daily synchronizer, safe file handlers');
const uiMarker='<p className="text-xs font-semibold text-violet-200">Журнал изменений задач</p>';
app=rep(app,uiMarker,read('updates/v53-memory-ui.txt')+'\n  '+uiMarker,'archival UI inside Research Director queue');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.2','РЫНОЧНЫЙ РАДАР • 5.3','app version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-core-memory.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.3 Long-lived CORE research memory\n- New append-only on-device archive survives the rolling 14-day CORE cache: actual H1 transitions, context H4 observations, completed UTC-day summaries of observed native CORE checks, and immutable 5.2 Research Director reports. Registration is prospective; no invented/backfilled gaps. Existing recorded 5.2 report snapshots may be copied to long-lived memory.\n- Stored with explicit bounded caps (730 days, 7,000 H1 edges, 3,500 H4 contexts, 128 reports). On capacity/conflict ingest is stopped with a clear message; old research facts are never silently removed. Local storage is still device-local and can be erased by uninstall/clear data.\n- Save/export and import/merge via the existing Android Storage Access Framework, with a NEW namespaced backup format independent of the original 3.2 Learning Vault. The canonical checksum detects accidental corruption (not malicious tampering). Entire file and all individual records are validated before import; contradictory timestamps or H1/H4 outcomes cause fail-closed rejection, with user confirmation before a verified merge.\n- Archive import restores only the history vault. It intentionally never replaces the live 4.4-5.2 in-app study state, Signal views, WorkManager, or demo records; those are separate stores. Research memory sync depends on opening app/receiving CORE observations and is not guaranteed to fill offline gaps.\n');
console.log('APEX 5.3 long-lived CORE memory, native backup and guarded restoration applied');
