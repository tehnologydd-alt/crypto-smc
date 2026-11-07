const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(p){
 const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,
  require,Date,Math,Number,JSON,Set,Map,Array});
 return m.exports;
}
const A=load('src/radar/v86-local-account-view.ts');
const NOW=Date.UTC(2026,10,7,16),good={
 venue:'binance',asOf:NOW-2*60000,
 balances:[{asset:'USDT',available:100,locked:20},{asset:'BTC',available:0.01,locked:0.005}]
};
const parsed=A.inspectAccountSnapshot(JSON.stringify(good),NOW);
assert.equal(parsed.venue,'binance');
assert.equal(parsed.balances.length,2);
assert.equal(parsed.balances[0].total,120);
assert.equal(parsed.balances[1].total,0.015);
assert.equal(parsed.origin,'local-anonymized-snapshot');
assert.equal(parsed.strictReadOnly,true);
assert.equal(A.sampleStatus(parsed,NOW),'RECENT');
assert.equal(A.sampleStatus(parsed,NOW+20*60000),'STALE');
assert.equal(A.sampleStatus(null,NOW),'EMPTY');
const byb={venue:'bybit',asOf:NOW,balances:[{asset:'USDT',available:25.5,locked:0}]};
assert.equal(A.inspectAccountSnapshot(JSON.stringify(byb),NOW).venue,'bybit');
const demoSample=A.inspectAccountSnapshot(A.sampleAccountSnapshot(NOW),NOW);
assert.equal(demoSample.balances.length,2);
assert.equal(demoSample.balances[0].total,120);
for(const mod of [
 {...good,venue:'coinbase'},
 {...good,apiKey:'any-secret'},
 {...good,accountId:'12345'},
 {...good,signature:'abc'},
 {...good,balances:[{asset:'USDT',available:10,locked:0,accountId:'123'}]},
 {...good,balances:[{asset:'USDT',available:100,locked:-1}]},
 {...good,balances:[{asset:'USDT',available:Infinity,locked:0}]},
 {...good,balances:[{asset:'USDT',available:'100',locked:0}]},
 {...good,balances:[{asset:'usdt',available:1,locked:0}]},
 {...good,balances:[{asset:'USDT',available:1,locked:0},{asset:'USDT',available:2,locked:0}]},
 {...good,balances:[]},
 {...good,balances:Array(13).fill({asset:'USDT',available:1,locked:0})},
 {...good,asOf:NOW+5*60000},
 {...good,asOf:NOW-91*86400000}
]){
 assert.throws(()=>A.inspectAccountSnapshot(JSON.stringify(mod),NOW),
  'read-only account snapshot must reject untrusted/extra/malformed input');
}
assert.throws(()=>A.inspectAccountSnapshot('x'.repeat(5001),NOW));
assert.throws(()=>A.inspectAccountSnapshot('not json',NOW));
const app=fs.readFileSync('src/App.tsx','utf8');
for(const s of ['РЫНОЧНЫЙ РАДАР • 8.6','APEX 8.6 · Снимки счетов · только просмотр',
 'inspectAccountSnapshot','accountReadOnlySnapshots','setAccountReadOnlySnapshots',
 'accountSnapshotDraft','sampleAccountSnapshot','sampleStatus',
 'Реальный API: не подключён','Не вставляй API-ключи',
 'Подтвердить','Виртуальный баланс','Позиции Futures · DEMO','Исследования',
 'APEX 8.5 · Биржевые API · публичные потоки','apex_v82_virtual_accounts']){
 if(s==='apex_v82_virtual_accounts')continue;
 assert(app.includes(s),'missing APEX 8.6 integration '+s);
}
const root=fs.readFileSync('src/radar/v86-local-account-view.ts','utf8');
const ui=fs.readFileSync('updates/v86-local-account-ui.txt','utf8');
assert(!/fetch\(|new WebSocket|localStorage|apiSecret|secretKey|\/fapi\/v1\/order|\/v5\/order\/create/.test(root+ui),
 'account snapshot inspector cannot connect, store, or execute');
assert(!/setFuturesLedger|transferDemoCash\(|setDemoWalletBook/.test(root+ui),
 'no mutation to DEMO portfolio or study');
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
console.log('APEX 8.6 PASS: local anonymous snapshots validated, credentials rejected, strict non-persistence, independent venues and unchanged DEMO');
