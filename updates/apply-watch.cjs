/** Apply APEX 2.5 UI/radar patch to the restored release source before GitHub Actions tests. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function change(s,from,to,name){
 if(!s.includes(from))throw Error('APEX WATCH overlay mismatch: '+name);
 return s.replace(from,to);
}
let app=read('src/App.tsx');
app=change(app,"import {estimateEarlyHeadsUp} from './radar/early';",
 "import {estimateEarlyHeadsUp} from './radar/early';\nimport {stabilizeWatch,restoreWatches,type WatchMemory} from './radar/watch';",'imports');
app=change(app,'const safeHistory=()=>',
 "const safeWatches=():Record<string,WatchMemory>=>{try{return restoreWatches(JSON.parse(localStorage.getItem('apex_v25_watch_memory')||'{}'));}catch{return {};}};\nconst safeHistory=()=>",'persistence');
app=change(app," const confirm=signal.phase==='CONFIRMED',up=signal.direction==='LONG';",
 " const confirm=signal.phase==='CONFIRMED',up=signal.direction==='LONG';\n const held=signal.watchState==='HELD',stale=signal.watchState==='STALE';",'card state');
app=change(app,"{confirm?'Подтверждение':'Подготовка'}</span>",
 "{confirm?'Подтверждение':stale?'Нет свежих данных':held?'Под наблюдением':'Подготовка'}</span>",'card label');
app=change(app,'  <p className="mt-3 text-sm text-slate-200">{signal.reason}</p>',
 '  <p className="mt-3 text-sm text-slate-200">{signal.reason}</p>\n  {signal.phase===\'WATCH\'&&signal.watchNote&&<p className="mt-2 text-[11px] text-amber-200/90">{signal.watchNote}</p>}', 'note');
app=change(app,' const earlyRef=useRef(earlyAlerts);',
 ' const earlyRef=useRef(earlyAlerts);\n const watchMemory=useRef<Record<string,WatchMemory>>(safeWatches());\n const watchSavedAt=useRef(0);','watch ref');
const begin=app.indexOf("  const values=results['5m'];"),end=app.indexOf('  cache.current[asset.symbol]=next;',begin);
if(begin<0||end<0)throw Error('APEX recompute block missing');
const block=[
"  const values=results['5m'];",
"  const time=Date.now();",
"  let watchChanged=false;",
"  const signals={} as AssetState['signals'];",
"  for(const frame of FRAMES){",
"   const key=asset.symbol+':'+frame;",
"   const previous=watchMemory.current[key]||null;",
"   const bars=frame==='5m'?asset.candles:asset.frames[frame]||[];",
"   const closed=bars.filter(c=>c.closed!==false).at(-1)||null;",
"   const result=results[frame];",
"   const decision=stabilizeWatch(previous,result.signal,{",
"    now:time,frame,price:asset.price,rangeHigh:result.rangeHigh,rangeLow:result.rangeLow,",
"    lastClosed:closed,liveFresh:asset.lastTick>0&&time-asset.lastTick<120_000,",
"   });",
"   if(decision.memory)watchMemory.current[key]=decision.memory;",
"   else delete watchMemory.current[key];",
"   if((previous?.signal.id||'')!==(decision.memory?.signal.id||''))watchChanged=true;",
"   signals[frame]=decision.signal;",
"   const watch=decision.signal;",
"   if(live&&notifyRef.current&&earlyRef.current&&!document.hidden&&",
"      time-asset.lastTick<15_000&&watch?.phase==='WATCH'&&watch.watchState==='LIVE'){",
"    const early=estimateEarlyHeadsUp(watch,bars,time);",
"    if(early)void publishEarlyWatch(watch,early).catch(()=>{});",
"   }",
"  }",
"  if(watchChanged||time-watchSavedAt.current>30_000){",
"   watchSavedAt.current=time;",
"   try{localStorage.setItem('apex_v25_watch_memory',JSON.stringify(watchMemory.current));}catch{}",
"  }",
"  const next={...asset,signals,signal:signals['5m']||null,high:values.rangeHigh,low:values.rangeLow,volumeRatio:values.volumeRatio};",
""
].join('\n');
app=app.slice(0,begin)+block+app.slice(end);
const list=" const visibleSignals=candidates.flatMap(a=>FRAMES.map(f=>a.signals[f]).filter((x):x is RadarSignal=>Boolean(x))).sort((a,b)=>(a.phase===b.phase?0:a.phase==='CONFIRMED'?-1:1));";
app=change(app,list," const running=new Set(scenarios.filter(x=>x.status==='PENDING'||x.status==='ACTIVE').map(x=>x.symbol+':'+(x.frame||'5m')));\n const visibleSignals=candidates.flatMap(a=>FRAMES.map(f=>a.signals[f]).filter((x):x is RadarSignal=>Boolean(x))).filter(s=>s.phase!=='WATCH'||!running.has(s.symbol+':'+(s.frame||'5m'))).sort((a,b)=>(a.phase===b.phase?0:a.phase==='CONFIRMED'?-1:1));",'signal list');
app=change(app,'РЫНОЧНЫЙ РАДАР • 2.4','РЫНОЧНЫЙ РАДАР • 2.5','version');
write('src/App.tsx',app);
let engine=read('src/radar/engine.ts');
engine=change(engine,'  volumeRatio: number; aggression: number | null; reason: string;',
 "  volumeRatio: number; aggression: number | null; reason: string;\n  watchState?: 'LIVE'|'HELD'|'STALE'; watchNote?: string;",'types');
write('src/radar/engine.ts',engine);
let notify=read('src/radar/notify.ts');
const i=notify.indexOf('export async function publishEarlyWatch(');
if(i<0)throw Error('Early notification method not found');
let method=notify.slice(i);
method=change(method,' const last=Number(localStorage.getItem(key)||0);',
 " const episodeKey='apex_early_episode_'+s.id;\n if(localStorage.getItem(episodeKey)==='1')return false;\n const last=Number(localStorage.getItem(key)||0);",'episode dedupe');
method=change(method," if(sent)localStorage.setItem(key,String(Date.now()));\n return sent;",
 " if(sent){localStorage.setItem(key,String(Date.now()));localStorage.setItem(episodeKey,'1');}\n return sent;",'dedupe persist');
write('src/radar/notify.ts',notify.slice(0,i)+method);
fs.copyFileSync('updates/watch.ts','src/radar/watch.ts');
fs.copyFileSync('updates/test-watch.cjs','scripts/test-watch.cjs');
let pkg=read('package.json');
pkg=change(pkg,'node scripts/test-early.cjs"','node scripts/test-early.cjs && node scripts/test-watch.cjs"','tests');
write('package.json',pkg);
let config=JSON.parse(read('tsconfig.json'));
config.exclude=[...new Set([...(config.exclude||[]),'updates'])];
write('tsconfig.json',JSON.stringify(config,null,2)+'\n');
console.log('APEX 2.5 stable WATCH overlay applied');
// APEX 2.6: apply focused native/UI notification patch after stable WATCH.
require('./apply-v26.cjs');

const bundle='updates/APEX_v27_apply.xz.b64';
if(fs.existsSync(bundle)){
 const compressed=Buffer.from(fs.readFileSync(bundle,'utf8').replace(/\s+/g,''),'base64');
 const decoded=require('node:child_process').execFileSync('xz',['-dc'],{input:compressed});
 fs.writeFileSync('updates/.apex-v27.cjs',decoded);
 require('./.apex-v27.cjs');
}

// APEX 2.8: allow full scroll of the last card and a virtual scenario journal.
require('./apply-v28.cjs');

// APEX 2.9 Passport & Guardian applied after current 2.8 patch.
require('./apply-v29.cjs');

// APEX 3.0 Learning, global alert mute and screen awake, after Passport.
require('./apply-v30.cjs');

// APEX 3.1 prospective Research, after Learning 3.0.
require('./apply-v31.cjs');

// APEX 3.2 research archive/restore and local diagnostics.
require('./apply-v32.cjs');

// APEX 3.3: observe data quality without changing scenario rules.
require('./apply-v33.cjs');

// APEX 3.4: collapsed health panel and descriptive error analysis.
require('./apply-v34.cjs');

// APEX 3.5 Watchlist Market Pulse: no alteration of trade scenarios.
require('./apply-v35.cjs');

// APEX 3.6: snapshot watchlist pulse at scenario creation; no historical backfill.
require('./apply-v36.cjs');

// APEX 3.7: conservative evidence quality on prospective research outcomes.
require('./apply-v37.cjs');

// APEX 3.8: prospective UTC-week cohort stability (observational only).
require('./apply-v38.cjs');

// APEX 3.9: frozen observational Market Pulse hypothesis, prospective holdout.
require('./apply-v39.cjs');

// APEX 4.0: separate analytics from Signals into a fourth Statistics tab.
require('./apply-v40.cjs');

// APEX 4.1: independent fixed research universe with isolated forward cohorts.
require('./apply-v41.cjs');

// APEX 4.2: explicitly measure CORE observation coverage and gate incomplete snapshots.
require('./apply-v42.cjs');

// APEX 4.3: independent, opt-in native CORE observations via existing periodic WorkManager.
require('./apply-v43.cjs');

// APEX 4.4: durable, separated native CORE observational archive.
require('./apply-v44.cjs');

// APEX 4.5: prospective, fixed-horizon CORE H1 state transitions.
require('./apply-v45.cjs');

// APEX 4.6: freeze one H1 state transition hypothesis and test only on future transitions.
require('./apply-v46.cjs');

// APEX 4.7: strictly prospective H1 drift monitoring against immutable early baseline.
require('./apply-v47.cjs');

// APEX 4.8: compare prospective frozen H1 transitions across past H4 regimes only.
require('./apply-v48.cjs');

// APEX 4.9: read-only, provenance-aware CORE research quality passport.
require('./apply-v49.cjs');

// APEX 5.0: rule-based Director chooses next research question without modifying studies.
require('./apply-v50.cjs');

// APEX 5.1: prospective, evidence-gated research work queue.
require('./apply-v51.cjs');

// APEX 5.2: immutable Research Director review reports from forward-only task evidence.
require('./apply-v52.cjs');

// APEX 5.3: append-only research history with validated local backup and merge.
require('./apply-v53.cjs');

// APEX 5.4: independent prospective H1 replication on disjoint UTC-day cohorts.
require('./apply-v54.cjs');

// APEX 5.5: three-rule research council arbitration without new UI nesting.
require('./apply-v55.cjs');

// APEX 5.6: native WorkManager reliability diagnostic and missing-job repair.
require('./apply-v56.cjs');

// APEX 6.0: reorganized Research Center with four peer sections.
require('./apply-v60.cjs');

// APEX 6.1: separate Radar observations and staged virtual Signals without another pyramid.
require('./apply-v61.cjs');

// APEX 6.2: premium multicolor design, signal lifecycle and Settings on/off switches.
require('./apply-v62.cjs');

// APEX 6.2.1: stabilize Radar favorite cards during live price and data-quality updates.
require('./apply-v621.cjs');

// APEX 6.3: demo-only Assistant, journal, limited automatic virtual accompaniment.
require('./apply-v63.cjs');

// APEX 6.4: public futures-only DEMO, independent from Spot archive.
require('./apply-v64.cjs');

// APEX 6.5: two peer DEMO markets and separate decision evidence.
require('./apply-v65.cjs');

// APEX 6.6: explain virtual position nominal and freeze prospective DEMO cohorts.
require('./apply-v66.cjs');

// APEX 6.7: independent study control center, cause-level exclusions and immutable checkpoints.
require('./apply-v67.cjs');

// APEX 6.8: public futures health and hypothetical educational cost sensitivity.
require('./apply-v68.cjs');

// APEX 6.9: read-only, predecision research on virtual futures outcomes.
require('./apply-v69.cjs');

// APEX 7.0: research-only hypothesis discovery, freeze past evidence before future tests.
require('./apply-v70.cjs');

// APEX 7.1: post-freeze cohort evidence for unmodified DEMO hypotheses.
require('./apply-v71.cjs');

// APEX 7.2: strictly prospective paper-only experimental shadow variants.
require('./apply-v72.cjs');

// APEX 7.3: deterministic on-device explanation grounded only in DEMO reports.
require('./apply-v73.cjs');

// APEX 7.4: foreground multi-pair public futures DEMO and automatic immutable checkpoints.
require('./apply-v74.cjs');

// APEX 7.5: dynamic Radar favorite watch, append-only checkpoint continuation, educational DEMO P&L.
require('./apply-v75.cjs');

// APEX 7.6: selected favorites x one/both sources, safe rolling-64 migration.
require('./apply-v76.cjs');

// APEX 7.7: honest per-venue candle health journal, WebView pause/resume and data freshness gate.
require('./apply-v77.cjs');

// APEX 7.8: native CORE scheduler truth and Android opt-in demo data-interruption notices.
require('./apply-v78.cjs');
