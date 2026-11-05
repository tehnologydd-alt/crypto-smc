/** APEX 3.7: evidence quality study; observational only, no trade rules changed. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(src,from,to,name){if(!src.includes(from))throw Error('APEX 3.7 missing '+name);return src.replace(from,to);}
fs.copyFileSync('updates/reliability-study.ts','src/radar/reliability-study.ts');
fs.copyFileSync('updates/test-reliability-study.cjs','scripts/test-reliability-study.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {contextReport as analyzeContext} from './radar/context-study';",
"import {contextReport as analyzeContext} from './radar/context-study';\nimport {evidenceReport} from './radar/reliability-study';",'imports');
app=rep(app," const contextStats=useMemo(()=>analyzeContext(learning),[learning]);",
" const contextStats=useMemo(()=>analyzeContext(learning),[learning]);\n const evidenceStats=useMemo(()=>evidenceReport(contextStats),[contextStats]);",'memo');
const needle='<p className="text-[11px] text-amber-200/85">{contextStats.note}</p>';
const panel=`<div className="rounded-xl border border-sky-500/20 bg-sky-950/20 p-3 space-y-2">
 <strong className="text-xs text-sky-200">Достоверность наблюдений · 3.7</strong>
 {evidenceStats.rows.filter(r=>r.kind==='with-pulse'||r.kind==='against-pulse').map(r=><div key={r.kind} className="text-[11px] text-slate-300 space-y-1">
  <div className="flex justify-between gap-2"><span>{r.title}</span><span>{r.completed} TP3/SL</span></div>
  <div>{r.rate===null?'Недостаточно наблюдений (минимум 20)':('TP3: '+r.rate.toFixed(1)+'% · интервал 95%: '+r.lower!.toFixed(1)+'–'+r.upper!.toFixed(1)+'%')}</div>
  <div className="text-slate-500">{r.level==='observed'?'Наблюдений достаточно для сравнения':r.level==='exploratory'?'Предварительная выборка':'Малая выборка'}</div>
 </div>)}
 <p className="text-[11px] text-slate-400">{evidenceStats.comparison==='insufficient'?'Сравнение направлений пока недоступно (нужно по 50 TP3/SL).':evidenceStats.comparison==='overlap'?'Интервалы пересекаются: явного различия не выявлено.':'Интервалы не пересекаются: наблюдаемое различие требует независимой проверки.'}</p>
 <p className="text-[10px] text-slate-500">{evidenceStats.note}</p>
</div>`;
app=rep(app,needle,panel+'\n       '+needle,'evidence panel');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 3.6','РЫНОЧНЫЙ РАДАР • 3.7','version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-reliability-study.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('APEX 3.7 evidence study applied');
