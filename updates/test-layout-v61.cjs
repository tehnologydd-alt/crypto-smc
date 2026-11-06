const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const app=fs.readFileSync('src/App.tsx','utf8');
const radar=app.slice(app.indexOf("{view==='radar'&&!selectedDetail&&"),app.indexOf("{view==='history'&&"));
const signals=app.slice(app.indexOf("{view==='history'&&"),app.indexOf("{view==='statistics'&&"));
assert(radar.length>1500&&signals.length>1500);
for(const a of ['Радар','Избранные пары','Наблюдения','Market Pulse · моё избранное','Сигналы наблюдения','SignalCard','setShowPicker(true)'])
 assert(radar.includes(a),'Radar missing '+a);
assert(!radar.includes('openGroups'),'active virtual scenarios must not duplicate in Radar');
assert(!radar.includes('Ситуации сейчас'),'old redundant panel must be removed');
assert(!radar.includes('Подробнее об активе ›'),'remove redundant action hint');
for(const a of ['Сценарии в работе','История прогнозов','Демо-журнал','signalArea===','signalStatusFilter===','GroupCard','ScenarioCard','compact={true}','demoTickets.map('])
 assert(signals.includes(a),'Signals missing '+a);
for(const a of ["signalArea==='current'","signalArea==='done'","signalArea==='demo'","signalStatusFilter==='all'"])
 assert(signals.includes(a),'stage control missing '+a);
assert(!signals.includes('APEX Learning Engine'),'learning stays in Center');
assert(app.includes("setSignalArea('current');setSignalStatusFilter('all');setHighlightScenario(id);"),'Android notification must reveal correct scenario section');
assert(app.includes('compact=false')&&app.includes('detailsOpen'),'completed history uses collapsible cards');
for(const a of ['apex_v2_favorites','apex_v28_demo_journal','apex_v30_learning','apex_v44_core_research','apex_v53_core_memory'])
 assert(app.includes(a),'all historic local store keys retained '+a);
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
console.log('APEX 6.1 Radar + Signals UX PASS: independent market vs virtual scenarios, stage filtering, compact completed details, demo kept, deep-links retained, TSX valid');
