/** APEX 4.0: Signals = lifecycle + demo; Statistics = research. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(src,a,b,label){if(!src.includes(a))throw Error('APEX 4.0 layout missing '+label);return src.replace(a,b);}
let app=read('src/App.tsx');
app=rep(app,"type View='radar'|'history'|'settings';","type View='radar'|'history'|'statistics'|'settings';",'view type');
const beginMark='<div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-yellow-950/20 border border-yellow-700/25 p-3">';
const demoMark='<section className="rounded-2xl border border-teal-500/20 bg-[#101a2a] p-3 space-y-2">';
const start=app.indexOf(beginMark,app.indexOf("{view==='history'&&"));
const end=app.indexOf(demoMark,start);
if(start<0||end<=start)throw Error('Statistics block boundary missing');
const analytics=app.slice(start,end);
for(const label of ['APEX Learning Engine','APEX Research','Market Pulse × Learning','Анализ завершённых прогнозов'])
 if(!analytics.includes(label))throw Error('Incomplete stats block '+label);
const headline='<p className="text-xs text-slate-400">Ожидают: {stats.pending} · Активны: {stats.active}. Ниже — сопровождение прогнозов и демо-журнал. Полная аналитика находится во вкладке «Статистика».</p>\n';
app=app.slice(0,start)+headline+app.slice(end);
const statsPage="{view==='statistics'&&<>\n"
 +'<div><h1 className="text-2xl font-bold">Статистика и исследования</h1><p className="text-sm mt-1 text-slate-400">Автоматические прогнозы APEX · Learning Engine · Проверка гипотез</p></div>\n'
 +'<p className="text-xs text-slate-400">Демо-журнал ведётся отдельно и не выбирает прогнозы для статистики APEX. Текущий Market Pulse наблюдает за избранными активами, а не за всем крипторынком.</p>\n'
 +analytics+'\n</>}\n';
app=rep(app,"{view==='settings'&&",statsPage+"{view==='settings'&&",'stats route');
const oldTabs="{([{id:'radar',label:'Радар',icon:Radar},{id:'history',label:'Сигналы',icon:ChartNoAxesCombined},{id:'settings',label:'Настройки',icon:Bell}] as const)";
const newTabs="{([{id:'radar',label:'Радар',icon:Radar},{id:'history',label:'Сигналы',icon:ChartNoAxesCombined},{id:'statistics',label:'Статистика',icon:Activity},{id:'settings',label:'Настройки',icon:Bell}] as const)";
app=rep(app,oldTabs,newTabs,'bottom tabs');
app=rep(app,'max-w-3xl mx-auto grid grid-cols-3">'+newTabs,'max-w-3xl mx-auto grid grid-cols-4">'+newTabs,'nav columns');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 3.9','РЫНОЧНЫЙ РАДАР • 4.0','version');
write('src/App.tsx',app);
fs.copyFileSync('updates/test-layout-v40.cjs','scripts/test-layout-v40.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-layout-v40.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.0 Statistics Tab\n- Signals shows live/pending/completed forecasts and the separate manual demo journal.\n- Statistics contains original total results, Learning, Research, Pulse context, evidence, weekly studies, holdout and postmortem.\n- No existing local records are erased and forecast generation remains unchanged by this layout patch.\n');
console.log('APEX 4.0 statistics navigation applied');
