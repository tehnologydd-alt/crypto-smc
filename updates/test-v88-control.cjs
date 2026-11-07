const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const app=fs.readFileSync('src/App.tsx','utf8');
const ui=fs.readFileSync('updates/v88-assistant-control-ui.txt','utf8');
const overlay=fs.readFileSync('updates/apply-v88.cjs','utf8');
for(const text of [
 'РЫНОЧНЫЙ РАДАР • 8.8',
 'APEX · Центр управления',
 'assistantEnabled','assistantEnabledRef','toggleAssistantEnabled',
 'apex_v88_assistant_enabled','setAssistantSwitchNote',
 'role="switch" aria-label="Включить или выключить DEMO-ассистента"',
 'aria-checked={assistantEnabled}',
 "assistantSubtab==='overview'","assistantSubtab==='positions'","assistantSubtab==='research'",
 'apex_v88_assistant_subtab','Главное','Позиции','Проверки',
 'Ожидают','Открыты','Завершены','Счета, позиции и настройки',
 'Виртуальные счета','Быстрые действия','Радар рынка',
 'Прогнозы и сигналы','Качество и исследования',
 'Состояние данных и что делает ассистент',
 'Радар, рыночные данные и исследования продолжают работу',
 'Режимы виртуального ассистента','Режим работы',
 'DEMO-счета','История операций','Подробности счёта',
 'Позиции Futures · DEMO','Позиции Spot · DEMO',
 'Независимый протокол и 64 контрольные точки',
 'APEX 8.7 · Биржевой Testnet · проверка протокола',
 'DEMO_ACCOUNT_KEY','restoreDemoWallets','futuresCapitalRow',
 'apex_v64_futures_demo','apex_v63_assistant_demo',
 'apex_v76_rolling_checkpoints',
 'enrollMarginAwareTicket','enrollMarginAwareMulti',
 'autoEnrollDemoOrders','addDemoOrder',
 'stepFuturesLedger(prev,futuresBars,Date.now())',
 'updateAssistantLedger(prev,scenarios,closedBars,reversals,Date.now())',
])assert(app.includes(text),'APEX 8.8 invariant missing: '+text);
// Exactly three tabs; no confusing duplicate navigation blocks.
assert.equal((app.match(/role="tab" aria-selected=\{assistantSubtab===/g)||[]).length,3);
assert.equal((app.match(/aria-label="Разделы ассистента"/g)||[]).length,1);
assert.equal((app.match(/aria-label="Включить или выключить DEMO-ассистента"/g)||[]).length,1);
assert(ui.includes("setView('radar')")&&ui.includes("setView('history')"),
 'Home actions navigate directly to existing Radar and Signals screens');
// Both existing auto routes must check the global switch BEFORE enrollment:
assert(app.includes("if(!assistantEnabled||assistantMode!=='auto'||!showLegacySpotArchive)return;"),
 'paused Spot must not auto-enroll');
assert(app.includes("if(!assistantEnabled||futuresMode!=='auto'||futuresScope!=='single'"),
 'paused single Futures must not auto-enroll');
assert(app.includes("if(!assistantEnabled||futuresMode!=='auto'||futuresScope!=='multi'"),
 'paused multi Futures must not auto-enroll');
const additions=[
 "assistantEnabledRef.current?autoEnrollDemoOrders(",
 "assistantEnabledRef.current?enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'auto'",
 "assistantEnabledRef.current?enrollMarginAwareMulti(",
 "assistantEnabledRef.current?enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'manual'",
 "if(!assistantEnabledRef.current){setAssistantMessage(",
 "if(!assistantEnabledRef.current){setFuturesMessage(",
 "disabled={!assistantEnabled||futuresExisting",
 "disabled={!assistantEnabled} className="
];
for(const text of additions)assert(app.includes(text),'APEX 8.8 missing admission guard '+text);
assert.equal((app.match(/assistantEnabledRef.current\?enrollMarginAwareTicket/g)||[]).length,2,
 'both manually and automatically created Futures plans must check the pause');
assert(app.includes("assistantEnabled&&futuresMode==='auto'&&futuresScope==='multi'"),
 'disabled assistant should not collect new multi-favorite DEMO data');

// ON must write and verify before allowing any new plan.
// OFF must block synchronously, prior to localStorage and React async state.
const toggle=app.slice(app.indexOf(' const toggleAssistantEnabled=()=>{'),app.indexOf(' const [assistantLedger,setAssistantLedger]',app.indexOf(' const toggleAssistantEnabled=()=>{')));
assert(toggle.includes("localStorage.setItem('apex_v88_assistant_enabled','on')"));
assert(toggle.includes("localStorage.getItem('apex_v88_assistant_enabled')!=='on'"));
assert(toggle.indexOf("localStorage.setItem('apex_v88_assistant_enabled','on')")<
 toggle.indexOf("assistantEnabledRef.current=true"));
assert(toggle.indexOf('assistantEnabledRef.current=false')<
 toggle.indexOf("localStorage.setItem('apex_v88_assistant_enabled','off')"));
assert(toggle.includes('Выключено только до перезапуска'), 'clearly warn if OFF cannot persist');
assert(toggle.includes('Нов')||toggle.includes('нов'), 'tell the user that new plans are paused');
for(const name of ['autoEnrollDemoOrders','enrollMarginAwareTicket','enrollMarginAwareMulti']){
 assert(!ui.includes(name),'UI overview must not itself change DEMO ledgers: '+name);
}
assert(!/\/fapi\/v1\/order\b|\/v5\/order\/create\b|sendOrderToExchange|createLiveOrder/.test(ui+overlay));
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
 ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
console.log('APEX 8.8 PASS: new mobile home; persisted fail-closed assistant switch; Spot/Futures auto/manual admission gates; existing paper lifecycle remains');
