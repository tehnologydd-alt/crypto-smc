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
