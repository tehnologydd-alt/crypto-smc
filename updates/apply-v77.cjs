/** APEX 7.7: diagnostic-only WebView pause/resume & per-venue public candle health.
 * No Android always-on service is claimed or created. Do not backfill virtual
 * orders with invented data after the phone/browser suspends execution.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.7 '+label+' matches='+n);return s.replace(a,b);}
function regexRep(s,pattern,b,label){
 const hits=[...s.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:'g'+pattern.flags))];
 if(hits.length!==1)throw Error('APEX 7.7 '+label+' matches='+hits.length);
 return s.replace(hits[0][0],b);
}
fs.copyFileSync('updates/v77-monitor-health.ts','src/radar/v77-monitor-health.ts');
fs.copyFileSync('updates/test-v77-health.cjs','scripts/test-v77-health.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {restoreRollingArchive,rollingSnapshots,addRollingCheckpoint,autoRollingCheckpoint,type ROLLING_MAX} from './radar/v76-rolling-checkpoints';",
 "import {restoreRollingArchive,rollingSnapshots,addRollingCheckpoint,autoRollingCheckpoint,type ROLLING_MAX} from './radar/v76-rolling-checkpoints';\nimport {restoreMonitorJournal,startMonitorSession,noteMonitorVisibility,noteMonitorNetwork,noteMonitorSuccess,noteMonitorFailure,monitorRows,monitorOverview,hasFreshSourceEvidence,type MonitorJournal} from './radar/v77-monitor-health';",
 'diagnostic-only import');
app=rep(app,
 " const [futuresBars,setFuturesBars]=useState<Record<string,FutureBar[]>>({});",
 " const [futuresBars,setFuturesBars]=useState<Record<string,FutureBar[]>>({});\n const [monitorJournal,setMonitorJournal]=useState<MonitorJournal>(()=>restoreMonitorJournal(localStorage.getItem('apex_v77_observation_health'),Date.now()));",
 'persisted bounded observation health');
app=rep(app,
 " const futuresObserveKey=futuresObserveKeys.join('|');",
 [
 " const futuresObserveKey=futuresObserveKeys.join('|');",
 " const monitorFeedRows=useMemo(()=>monitorRows(monitorJournal,futuresObserveKeys,now),[monitorJournal,futuresObserveKeys,now]);",
 " const monitorCounts=useMemo(()=>monitorOverview(monitorFeedRows),[monitorFeedRows]);",
 " useEffect(()=>{",
 "  setMonitorJournal(prev=>startMonitorSession(prev,Date.now()));",
 "  const visibility=()=>setMonitorJournal(prev=>noteMonitorVisibility(prev,!document.hidden,Date.now()));",
 "  const online=()=>setMonitorJournal(prev=>noteMonitorNetwork(prev,true,Date.now()));",
 "  const offline=()=>setMonitorJournal(prev=>noteMonitorNetwork(prev,false,Date.now()));",
 "  document.addEventListener('visibilitychange',visibility);",
 "  window.addEventListener('online',online);window.addEventListener('offline',offline);",
 "  if(document.hidden)visibility();",
 "  else if(navigator.onLine===false)offline();",
 "  return ()=>{",
 "   document.removeEventListener('visibilitychange',visibility);",
 "   window.removeEventListener('online',online);window.removeEventListener('offline',offline);",
 "  };",
 " },[]);",
 " useEffect(()=>{try{",
 "  localStorage.setItem('apex_v77_observation_health',JSON.stringify(monitorJournal));",
 " }catch{setFuturesMessage('Журнал качества данных не удалось сохранить; торговые DEMO-журналы не изменены.');}},[monitorJournal]);"
 ].join('\n'),
 'health calculation and lifecycle events');
const polling=[
 " useEffect(()=>{",
 "  if(!futuresObserveKey)return;",
 "  let alive=true,busy=false;",
 "  const poll=async()=>{",
 "   if(document.hidden||busy)return;",
 "   busy=true;",
 "   try{",
 "    const keys=futuresObserveKey.split('|');",
 "    const results=await Promise.allSettled(keys.map(async key=>{",
 "     const [exchange,symbol,frame]=key.split(':');",
 "     const bars=await fetchFuturesClosedBars(exchange as AssistantExchange,symbol,frame as AssistantFrame,Date.now());",
 "     return {key,bars};",
 "    }));",
 "    if(!alive||document.hidden)return;",
 "    const completed=results.filter((x):x is PromiseFulfilledResult<{key:string;bars:FutureBar[]}>=>x.status==='fulfilled').map(x=>x.value);",
 "    if(completed.length)setFuturesBars(prev=>{",
 "     let changed=false;const next={...prev};",
 "     for(const item of completed){",
 "      const old=prev[item.key],latest=item.bars.at(-1);",
 "      if(!old||old.length!==item.bars.length||old.at(-1)?.time!==latest?.time){",
 "       next[item.key]=item.bars;changed=true;",
 "      }",
 "     }",
 "     return changed?next:prev;",
 "    });",
 "    const at=Date.now();",
 "    setMonitorJournal(prev=>{",
 "     let next=prev;",
 "     for(let i=0;i<keys.length;i++){",
 "      const result=results[i];",
 "      next=result.status==='fulfilled'",
 "       ?noteMonitorSuccess(next,keys[i],result.value.bars,at)",
 "       :noteMonitorFailure(next,keys[i],result.reason,at);",
 "     }",
 "     return next;",
 "    });",
 "    const failure=results.find((x):x is PromiseRejectedResult=>x.status==='rejected');",
 "    setFuturesError(failure?'Фьючерсные данные: '+String(failure.reason):'');",
 "   }catch(e){if(alive)setFuturesError('Не удалось обновить публичные фьючерсные свечи: '+String(e));}",
 "   finally{busy=false;}",
 "  };",
 "  void poll();",
 "  const interval=setInterval(()=>{void poll();},75000);",
 "  const onVisible=()=>{if(!document.hidden)void poll();};",
 "  const onOnline=()=>{if(!document.hidden)void poll();};",
 "  window.addEventListener('online',onOnline);",
 "  document.addEventListener('visibilitychange',onVisible);",
 "  return ()=>{alive=false;clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onOnline);};",
 " },[futuresObserveKey]);"
].join('\n');
app=regexRep(app,/ useEffect\(\(\)=>\{\n  if\(!futuresObserveKey\)return;[\s\S]*?\},\[futuresObserveKey\]\);/,polling,
 'replace Futures public poll with success/error records');
app=rep(app,
 "  if(futuresMode!=='auto'||futuresScope!=='single'||!futuresStudyPlan||futuresStudyPlan.expiresAt<=Date.now())return;",
 "  if(futuresMode!=='auto'||futuresScope!=='single'||!futuresStudyPlan||futuresStudyPlan.expiresAt<=Date.now()||!monitorJournal.online||monitorJournal.pausedAt!==null)return;\n  if(!hasFreshSourceEvidence(monitorJournal,futuresSelectedKey,Date.now()))return;",
 'single-pair automatic plans require recently confirmed public data');
app=rep(app,
 " },[futuresMode,futuresScope,futuresStudyPlan,futuresSetup]);",
 " },[futuresMode,futuresScope,futuresStudyPlan,futuresSetup,futuresSelectedKey,monitorJournal]);",
 'single mode health dependencies');
app=rep(app,
 "  if(futuresMode!=='auto'||futuresScope!=='multi'||futuresMultiPlans.length===0)return;\n  setFuturesLedger(prev=>enrollChosenDemoPlans(prev,futuresMultiPlans,futuresSetup,Date.now()));",
 "  if(futuresMode!=='auto'||futuresScope!=='multi'||futuresMultiPlans.length===0||!monitorJournal.online||monitorJournal.pausedAt!==null)return;\n  const nowMs=Date.now();\n  const eligible=futuresMultiPlans.filter(plan=>hasFreshSourceEvidence(monitorJournal,plan.source+':'+plan.symbol+':'+plan.frame,nowMs));\n  if(!eligible.length)return;\n  setFuturesLedger(prev=>enrollChosenDemoPlans(prev,eligible,futuresSetup,nowMs));",
 'multi-venue automatic plans require their own successful fresh market poll');
app=rep(app,
 " },[futuresMode,futuresScope,futuresMultiPlans,futuresSetup]);",
 " },[futuresMode,futuresScope,futuresMultiPlans,futuresSetup,monitorJournal]);",
 'multi-venue health dependencies');
app=rep(app,read('updates/v76-multi-choice-ui.txt'),
 read('updates/v76-multi-choice-ui.txt')+'\n'+read('updates/v77-monitor-ui.txt'),
 'observation quality panel below selected-pair controls');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.6','РЫНОЧНЫЙ РАДАР • 7.7','visible version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.6','РЫНОЧНЫЙ РАДАР • 7.7'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v77-health.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.7 — truthful per-market data health and Android WebView pause/resume diagnostics\n- Futures DEMO monitors each active Binance/Bybit + symbol/frame key and records last successful public candle request, latest closed candle, gaps within received candles, request errors and network/offline visibility transitions. A capped 40-event/48-feed local journal survives restarts without changing the independent protocol, rolling-64 snapshots, virtual trades, favorites or hypotheses.\n- Backgrounding the phone is recorded as a pause, and return to the WebView triggers a fresh public fetch. There is no Android foreground service, WorkManager continuity promise, overnight processing, missing-tick backfill or simulated historical order fill. Already OPEN/WAITING DEMO tickets retain prior gap-handling rules.\n- Automatic NEW paper plans for selected single or dual venues are considered only after a fresh successful request for THAT specific source/symbol/frame; stale cached bars or failed public endpoints cannot initiate new virtual setups. Data health is purely observational, not real financial advice or order execution.\n');
console.log('APEX 7.7 public-data reliability journal and safe resume guards installed');
