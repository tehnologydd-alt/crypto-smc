/** APEX 8.0 — final stability/release pass.
 * Audit research data without rewriting them; guard rolling-64 migration
 * against accidental deletion on malformed old/new localStorage records.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){
 const n=s.split(a).length-1;if(n!==1)throw Error('APEX 8.0 '+label+' matches='+n);
 return s.replace(a,b);
}
for(const f of ['v80-release-passport.ts','v80-migration-guard.ts'])
 fs.copyFileSync('updates/'+f,'src/radar/'+f);
fs.copyFileSync('updates/test-v80-release.cjs','scripts/test-v80-release.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {getFuturesNativeStatus,configureFuturesNative,queueFuturesNativeCheck,backgroundSnapshotSummary,latestFuturesSample,EMPTY_NATIVE_FUTURES,type NativeFuturesStatus} from './radar/v79-native-futures';",
 "import {getFuturesNativeStatus,configureFuturesNative,queueFuturesNativeCheck,backgroundSnapshotSummary,latestFuturesSample,EMPTY_NATIVE_FUTURES,type NativeFuturesStatus} from './radar/v79-native-futures';\nimport {auditReleaseStorage,formatReleasePassport,type ReleasePassport} from './radar/v80-release-passport';\nimport {canRetireLegacySnapshots,canInitializeRolling} from './radar/v80-migration-guard';",
 'passport + safe migration imports');
app=rep(app,
 " const [futuresBackgroundMessage,setFuturesBackgroundMessage]=useState('');",
 " const [futuresBackgroundMessage,setFuturesBackgroundMessage]=useState('');\n const [releasePassport,setReleasePassport]=useState<ReleasePassport>(()=>auditReleaseStorage(localStorage,Date.now()));\n const [releaseCopyMessage,setReleaseCopyMessage]=useState('');",
 'passive passport state');
app=rep(app,
 " const lastFuturesNative=useMemo(()=>latestFuturesSample(futuresNativeStatus),[futuresNativeStatus]);",
 [
 " const lastFuturesNative=useMemo(()=>latestFuturesSample(futuresNativeStatus),[futuresNativeStatus]);",
 " const copyReleaseDiagnostic=async()=>{",
 "  try{",
 "   await navigator.clipboard.writeText(formatReleasePassport(releasePassport));",
 "   setReleaseCopyMessage('Скопирован только технический отчёт без содержимого записей.');",
 "  }catch(e){setReleaseCopyMessage('Не удалось скопировать отчёт: '+String(e));}",
 " };"
 ].join('\n'),
 'explicit user-visible privacy-limited diagnostic copy');
const oldCommit=[
 " const commitRolling=(next:CheckpointArchive)=>{",
 "  if(next===rollingArchive)return false;",
 "  try{",
 "   localStorage.setItem('apex_v76_rolling_checkpoints',JSON.stringify(next));",
 "   setRollingArchive(next);",
 "   // User chose one rolling archive; remove OLD snapshot-only keys only",
 "   // after the new record is safely persisted. Do not touch study protocol.",
 "   localStorage.removeItem('apex_v67_study_checkpoints');",
 "   localStorage.removeItem('apex_v75_checkpoint_continuation');",
 "   return true;",
 "  }catch{setFuturesMessage('Не удалось сохранить контрольную точку. Предыдущая история не затронута.');return false;}",
 " };",
 " useEffect(()=>{",
 "  try{",
 "   const raw=localStorage.getItem('apex_v76_rolling_checkpoints');",
 "   if(raw!==JSON.stringify(rollingArchive))localStorage.setItem('apex_v76_rolling_checkpoints',JSON.stringify(rollingArchive));",
 "   localStorage.removeItem('apex_v67_study_checkpoints');",
 "   localStorage.removeItem('apex_v75_checkpoint_continuation');",
 "  }catch{setFuturesMessage('Не получилось перенести историю снимков. Старые ключи пока сохранены.');}",
 " },[rollingArchive]);"
].join('\n');
const newCommit=[
 " const commitRolling=(next:CheckpointArchive)=>{",
 "  if(next===rollingArchive)return false;",
 "  try{",
 "   const current=localStorage.getItem('apex_v76_rolling_checkpoints');",
 "   if(current!==null&&current!==JSON.stringify(rollingArchive)){",
 "    setFuturesMessage('Сохранённая история отличается от открытой. Перезапись запрещена: проверь паспорт стабильности.');",
 "    return false;",
 "   }",
 "   if(current===null){",
 "    const initial=canInitializeRolling(localStorage,rollingArchive,Date.now());",
 "    if(!initial.safe){setFuturesMessage(initial.reason);return false;}",
 "   }",
 "   const encoded=JSON.stringify(next);",
 "   localStorage.setItem('apex_v76_rolling_checkpoints',encoded);",
 "   if(localStorage.getItem('apex_v76_rolling_checkpoints')!==encoded)throw Error('Нет подтверждения записи');",
 "   setRollingArchive(next);",
 "   const gate=canRetireLegacySnapshots(localStorage,next,Date.now());",
 "   if(gate.safe){",
 "    localStorage.removeItem('apex_v67_study_checkpoints');",
 "    localStorage.removeItem('apex_v75_checkpoint_continuation');",
 "   }else if(localStorage.getItem('apex_v67_study_checkpoints')!==null||",
 "      localStorage.getItem('apex_v75_checkpoint_continuation')!==null){setFuturesMessage(gate.reason);}",
 "   return true;",
 "  }catch{setFuturesMessage('Запись контрольной точки не подтвердилась: старая история не удалена.');return false;}",
 " };",
 " useEffect(()=>{",
 "  try{",
 "   const raw=localStorage.getItem('apex_v76_rolling_checkpoints');",
 "   const encoded=JSON.stringify(rollingArchive);",
 "   if(raw===null){",
 "    const initial=canInitializeRolling(localStorage,rollingArchive,Date.now());",
 "    if(!initial.safe){setFuturesMessage(initial.reason);return;}",
 "    localStorage.setItem('apex_v76_rolling_checkpoints',encoded);",
 "    if(localStorage.getItem('apex_v76_rolling_checkpoints')!==encoded)throw Error('Запись не подтверждена');",
 "   }else if(raw!==encoded){",
 "    setFuturesMessage('История в хранилище не совпадает с экраном. Ничего не переписываем.');",
 "    return;",
 "   }",
 "   const gate=canRetireLegacySnapshots(localStorage,rollingArchive,Date.now());",
 "   if(gate.safe){",
 "    localStorage.removeItem('apex_v67_study_checkpoints');",
 "    localStorage.removeItem('apex_v75_checkpoint_continuation');",
 "   }else if(localStorage.getItem('apex_v67_study_checkpoints')!==null||",
 "      localStorage.getItem('apex_v75_checkpoint_continuation')!==null){",
 "    setFuturesMessage(gate.reason);",
 "   }",
 "  }catch{setFuturesMessage('Не получилось подтвердить перенос снимков. Старые ключи сохранены.');}",
 " },[rollingArchive]);"
].join('\n');
app=rep(app,oldCommit,newCommit,'safe checkpoint persistence and migration barrier');
app=rep(app,
 read('updates/v79-native-background-ui.txt'),
 read('updates/v79-native-background-ui.txt')+'\n'+read('updates/v80-release-panel.txt'),
 'new final passport panel below Android observation status');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.9','РЫНОЧНЫЙ РАДАР • 8.0','visible release');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;
 write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.9','РЫНОЧНЫЙ РАДАР • 8.0'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v80-release.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.0 — Final stability passport / non-destructive migration guard\n- The Futures assistant adds an on-demand read-only integrity passport for saved futures paper tickets, prospective study protocol, last 64 checkpoints, frozen hypotheses, shadow research, selected favorite symbols and venues, observation health, and alert permissions. It distinguishes empty/valid/damaged/needs-attention records. It intentionally does NOT claim to verify profitability, source freshness while Android is asleep, real account state or all possible device faults.\n- Users can explicitly copy a DIAGNOSTIC TEXT report containing only issue/status/count metadata, not underlying trades, favorites, account secrets or persistent objects. The tool never resets user data or silently attempts to repair damaged content.\n- Rolling-64 checkpoint migration is now conservative: validate source sections before initializing a new archive; require confirmed localStorage write/readback; never overwrite an unexpected existing rolling key; never remove prior checkpoint keys unless the persisted new archive validates and covers the previous history. Corrupt sources are preserved for explicit user review rather than lost on app upgrade.\n- Prior Futures DEMO and Spot ledgers, selected 4 Radar favorites, Binance/Bybit isolation, saved protocol, capped 64 snapshots, frozen hypotheses, shadow comparisons, CORE/Android WorkManager, native background checks and notifications are unchanged by the audit.\n');
console.log('APEX 8.0 PASS: final release passport & loss-averse checkpoint migration overlay applied');
