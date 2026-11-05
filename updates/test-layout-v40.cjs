const assert=require('node:assert/strict'),fs=require('node:fs');
const a=fs.readFileSync('src/App.tsx','utf8');
const hist=a.slice(a.indexOf("{view==='history'&&"),a.indexOf("{view==='statistics'&&"));
const stat=a.slice(a.indexOf("{view==='statistics'&&"),a.indexOf("{view==='settings'&&"));
assert(hist.includes('Демо-журнал')&&hist.includes('ScenarioCard'));
for(const x of ['APEX Learning Engine','APEX Research','Market Pulse × Learning','Достоверность наблюдений','Устойчивость по неделям','Проверка на будущих данных','Анализ завершённых прогнозов']){
 assert(!hist.includes(x),'Signal panel contains '+x);
 assert(stat.includes(x),'Stats missing '+x);
}
assert(a.includes("label:'Статистика',icon:Activity"));
assert(a.includes("grid grid-cols-4"));
assert(a.includes("type View='radar'|'history'|'statistics'|'settings';"));
console.log('APEX 4.0 layout PASS: Signals uncluttered, Statistics complete');
