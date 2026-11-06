const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const s=fs.readFileSync('src/App.tsx','utf8');
const i=s.indexOf("{view==='statistics'&&<>"),j=s.indexOf("{view==='settings'&&",i),x=s.slice(i,j);
assert(i>0&&j>i);
assert(s.includes("type View='radar'|'history'|'statistics'|'settings';"));
assert(s.includes("label:'Центр',icon:Activity")&&s.includes('grid grid-cols-4'));
assert(x.includes('Центр APEX'));
for(const n of ['overview','director','data','checks'])assert(x.includes("researchSection==='"+n+"'"));
assert(x.includes("setResearchSection('director')")&&x.includes("setResearchSection('checks')")&&x.includes("setResearchSection('data')"));
for(const [mark,count] of [['CORE · фоновый сбор',1],['Research Director · 5.0',1],['Долговременная память · 5.3',1],['Коллектив исследований · 5.5',1]])
 assert.equal((x.match(new RegExp(mark,'g'))||[]).length,count,'no duplicate '+mark);
for(const old of ['APEX Learning Engine','APEX Research','Market Pulse × Learning','Достоверность наблюдений','Устойчивость по неделям','Проверка на будущих данных','Анализ завершённых прогнозов','Переходы H1 · 4.5','Контекст H4 · 4.8','Автономность · 5.6'])
 assert(x.includes(old),'preserve detailed source '+old);
for(const name of ['setDirectorExpanded','setQueueExpanded','setReviewReportsExpanded','setCoreMemoryExpanded'])
 assert(!s.includes(name),'no obsolete accordion '+name);
for(const key of ['apex_v30_learning','apex_v44_core_research','apex_v46_holdout','apex_v50_director_log','apex_v51_research_queue','apex_v53_core_memory','apex_v54_replication'])
 assert(s.includes(key),'preserved evidence key '+key);
const parsed=ts.createSourceFile('App.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
console.log('APEX 6.0 UX migration PASS: compact four-section Center, accessible Director & CORE, no duplicate controls, no lost ledgers, valid TSX');
