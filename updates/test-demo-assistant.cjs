const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,req=require){
 const src=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:req,Map,Set,Date,Math,Number,Array,JSON});
 return m.exports;
}
const A=load('src/radar/demo-assistant.ts'),B=load('src/radar/demo-market-readonly.ts');
const H=300000,T=Date.UTC(2026,10,6,12),day=86400000;
const s={id:'BTCUSDT:5m:LONG:abc',symbol:'BTCUSDT',direction:'LONG',status:'PENDING',frame:'5m',
 entry:100,stop:95,target:115,targets:[105,110,115],tpReached:0,
 createdAt:T-3600000,expiresAt:T+2*3600000,ttlMs:3*3600000,ttlExplanation:'example',
 originalSignalId:'sample',reason:'test',lastCandleTime:T-H};
const bars=(i,low,high,close=101,open=101)=>({time:T+i*H,low,high,close,open,closed:true});
let archive={version:1,orders:[]};
archive=A.addDemoOrder(archive,s,'binance','manual',[50,30,20],true,T);
assert.equal(archive.orders.length,1);
assert.equal(archive.orders[0].state,'WAITING');
assert.equal(A.addDemoOrder(archive,s,'binance','manual',[50,30,20],true,T),archive,'idempotent');
const first=A.advanceDemoOrder(archive.orders[0],[bars(1,99,101)],T+2*H);
assert.equal(first.state,'OPEN');assert.equal(first.tpReached,0);
const tp=A.advanceDemoOrder(first,[bars(2,100,106,103,102)],T+3*H);
assert.equal(tp.tpReached,1);
assert.equal(tp.remainingPct,50);
assert.equal(tp.protectiveStop,100,'breakeven after TP1');
assert(tp.events.some(e=>e.type==='BREAKEVEN'));
const stopped=A.advanceDemoOrder(tp,[bars(3,99,113,104,102)],T+4*H);
assert.equal(stopped.state,'CLOSED');
assert.equal(stopped.tpReached,1,'stop wins an ambiguous same-candle TP2 touch');
assert.equal(stopped.closedPrice,100);
const reversed=A.advanceDemoOrder(tp,[bars(3,101,109,107,103)],T+4*H,
 {direction:'SHORT',phase:'CONFIRMED',timestamp:T+3*H+30_000});
assert.equal(reversed.state,'CLOSED');
assert(reversed.events.some(e=>e.type==='REVERSAL'));
const before=A.advanceDemoOrder(tp,[bars(3,101,109,107,103)],T+4*H,
 {direction:'SHORT',phase:'WATCH',timestamp:T+3*H+30_000});
assert.equal(before.state,'OPEN','WATCH is not confirmed reversal');
const untouched=A.advanceDemoOrder(archive.orders[0],[bars(-4,99,101)],T+H);
assert.equal(untouched.state,'WAITING','no pre-registration bars');
const expire=A.advanceDemoOrder(archive.orders[0],[],s.expiresAt+H);
assert.equal(expire.state,'EXPIRED');
assert.equal(expire.activatedAt,undefined);
const cancel=A.closeVirtualOrder(archive,archive.orders[0].id,T+H);
assert.equal(cancel.orders[0].state,'CANCELLED');
const duplicate=A.autoEnrollDemoOrders(archive,[s],'binance',[50,30,20],true,T);
assert.equal(duplicate.orders.length,1);
const fromAuto=A.autoEnrollDemoOrders({version:1,orders:[]},[s],'bybit',[50,30,20],true,T);
assert.equal(fromAuto.orders[0].exchange,'bybit');
assert.equal(fromAuto.orders[0].mode,'auto');
assert.equal(A.openAssistantLedger(JSON.stringify(fromAuto),T).orders.length,1);
assert.equal(A.openAssistantLedger('{',T).orders.length,0);
assert.throws(()=>A.makeDemoOrder({...s,status:'ACTIVE'},'binance','manual',[50,30,20],true,T));
assert.throws(()=>A.makeDemoOrder(s,'binance','manual',[40,40,30],true,T));
const sourceBars=[[''+(T+H),'100','103','99','101','2'],[''+T,'100','102','98','99','2']];
const decoded=B.decodeBybitSpotKlines({retCode:0,result:{category:'spot',list:sourceBars}},'5m',T+2*H);
assert.equal(decoded.length,2);
assert(decoded[0].time<decoded[1].time);
assert.equal(B.decodeBybitSpotKlines({retCode:0,result:{category:'spot',list:sourceBars}},'5m',T+H).length,1,'unclosed bar excluded');
assert.throws(()=>B.decodeBybitSpotKlines({retCode:10001},'5m',T+2*H));
const app=fs.readFileSync('src/App.tsx','utf8');
for(const x of ["type View='radar'|'history'|'assistant'|'statistics'|'settings'",
 "view==='assistant'",'Демо-ордера и сопровождение','setAssistantMode(\'auto\')',
 "assistantExchange==='bybit'",'setAssistantLedger(prev=>updateAssistantLedger',
 'fetchBybitSpotClosedBars','Авто · демо','Безубыток после TP1','closeVirtualOrder',
 'grid-cols-5 gap-1'])
 assert(app.includes(x),'Assistant screen wiring missing '+x);
assert(app.includes('apex_v63_assistant_demo'),'local archive key missing');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
for(const path of ['src/radar/notify.ts','src/radar/engine.ts','src/radar/lifecycle.ts'])
 assert(!fs.readFileSync(path,'utf8').includes('demo-assistant'),'existing signal rules untouched');
const market=fs.readFileSync('src/radar/demo-market-readonly.ts','utf8');
assert(market.includes('/v5/market/kline'));
const executableMarket=market.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert(!/order\/create|\/api\/v3\/order|apiKey|apiSecret|placeOrder|wallet/i.test(executableMarket),'no actual exchange execution paths');
console.log('APEX 6.3 virtual assistant PASS: dual source DEMO, limit expiry, TP1/2/3, BE after TP1, conservative candle priority, reversal after TP, manual+auto, own persistence, no real trading');
