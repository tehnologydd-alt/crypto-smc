const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const label of [
 'РЫНОЧНЫЙ РАДАР • 8.1','Разделы ассистента','Позиции · DEMO','Исследования',
 'apex_v81_assistant_subtab',"assistantSubtab==='positions'","assistantSubtab==='research'",
 'Позиции Futures · DEMO','Позиции Spot · DEMO',
 'Binance Futures','Bybit Futures','Binance Spot','Bybit Spot',
 'История завершённых','active.map(o=>','closed.map(o=>',
 'Центр независимой проверки','Паспорт стабильности',
 'Независимый протокол и 64 контрольные точки','Качество рыночных данных и перерывы',
 'Результаты, комиссии и разбор ошибок',
 'Гипотезы, будущая проверка, SHADOW и наставник',
 'Фоновая работа Android и паспорт стабильности',
 'apex_v64_futures_demo','apex_v66_forward_protocol',
 'apex_v76_rolling_checkpoints','apex_v76_selected_favorites',
 'apex_v76_demo_venues','apex_v70_hypothesis_archive',
 'APEX 7.9 · Фоновое исследование выбранных Futures-пар'
])assert(app.includes(label),'APEX 8.1 integration missing '+label);
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
 ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
assert.equal((app.match(/aria-label="Разделы ассистента"/g)||[]).length,1);
assert.equal((app.match(/role="tab" aria-selected=/g)||[]).length,2);
assert.equal((app.match(/open className="rounded-xl border border-slate-600\/35/g)||[]).length,1,
 'only independent study opens initially; remaining research groups stay folded');
// Ensure all the old research widgets still exist exactly once, but only in research.
for(const text of ['Дневник проверки решений','Центр независимой проверки',
 'Положительные и отрицательные результаты DEMO',
 'Разбор ошибок и условий · Futures DEMO','Как условные комиссии меняют результат',
 'APEX 7.3 · Интеллектуальный наставник','APEX 7.7 · Качество наблюдения и перерывы',
 'APEX 7.8 · Android фон и уведомления о перерывах','APEX 8.0 · Паспорт стабильности']){
 assert.equal(app.split(text).length-1,1,'research section must not be duplicated: '+text);
}
// Side-effect controls kept: manual paper enrollment, close-by-last-candle,
// saved forward study / rolling checkpoints, auto/manual trade mode.
for(const text of ['setFuturesMode(','addFuturesPlan','stopFutureDemo(',
 'setAssistantMode(','setAssistantLedger(','commitRolling(','setAutoStudyCheckpoints(',
 'toggleNativeFuturesBackground','requestAlerts()']){
 assert(app.includes(text),'original assistant action lost: '+text);
}
for(const venue of ['binance','bybit']){
 assert(app.includes("futuresLedger.tickets.filter(o=>o.plan.source===exchange)"));
 assert(app.includes("assistantLedger.orders.filter(o=>o.exchange===exchange)"));
}
// Normal checkout leaves all original modules intact, not a fake page only.
for(const file of ['src/radar/v64-futures-assistant.ts',
 'src/radar/v66-forward-study.ts','src/radar/v76-scope-demo.ts',
 'src/radar/v76-rolling-checkpoints.ts','src/radar/v79-native-futures.ts',
 'src/radar/v80-release-passport.ts'])
 assert(fs.existsSync(file));
assert(!/\/fapi\/v1\/order\b|\/v5\/order\/create\b|sendOrderToExchange|createLiveOrder/.test(app));
console.log('APEX 8.1 PASS: Assistant subtab navigation, 2 venue-filtered DEMO ledgers, collapsed histories and all intact research controls');
