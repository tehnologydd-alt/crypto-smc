const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const known={
 './v64-futures-assistant':'src/radar/v64-futures-assistant.ts',
 './v82-demo-accounts':'src/radar/v82-demo-accounts.ts',
 './v74-multi-demo':'src/radar/v74-multi-demo.ts',
 './v76-scope-demo':'src/radar/v76-scope-demo.ts'
};
const cache=new Map();
function load(path){
 if(cache.has(path))return cache.get(path).exports;
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};cache.set(path,m);
 vm.runInNewContext(js,{module:m,exports:m.exports,require:name=>known[name]?load(known[name]):require(name),
  Date,Math,Number,JSON,Set,Map,Array},{filename:path});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 A=load('src/radar/v82-demo-accounts.ts'),
 M=load('src/radar/v83-margin-capital.ts');
const T=Date.UTC(2026,10,7,13),MS=300000;
const empty=F.EMPTY_FUTURES_LEDGER;
const setup=(exchange,notional=100,leverage=5)=>({exchange,leverage,marginMode:'ISOLATED',
 positionMode:'ONE_WAY',notionalUSDT:notional,portions:[50,30,20],breakeven:true});
const plan=(exchange,symbol='BTCUSDT',n=0)=>({id:'futures:'+exchange+':'+symbol+':5m:'+(T-MS-n*MS)+':LONG',
 source:exchange,symbol,frame:'5m',direction:'LONG',entry:100,stop:95,
 targets:[102,104,108],createdAt:T+2,expiresAt:T+86400000,
 observedBarAt:T-MS-n*MS,reason:'study',model:'futures-study-v1'});
const barsFor=(exchange,symbol='BTCUSDT',close=98,at=T+6000)=>({
 [exchange+':'+symbol+':5m]:[{time:at-MS,open:100,high:101,low:97,close,volume:10,closed:true}]
});
let book=A.openDemoWallets(empty,T);
const B='futures:binance',Y='futures:bybit';
assert.equal(M.futuresCapitalRow(book,'binance',empty,{},T).balanceUSDT,0);
assert.equal(M.checkDemoMargin(book,'binance',setup('binance'),empty,{},T).allowed,false,
 'no free balance means no new paper orders');
book=A.transferDemoCash(book,B,'DEPOSIT','100',empty,T+1);
book=A.transferDemoCash(book,Y,'DEPOSIT','60',empty,T+2);
let admission=M.checkDemoMargin(book,'binance',setup('binance'),empty,{},T+3);
assert.equal(admission.neededUSDT,20);
assert.equal(admission.availableUSDT,100);
assert.equal(admission.allowed,true);
assert.equal(admission.maxAdditional,5,'100 virtual USDT funds five 100-notional 5x orders but global cap six');
let l=M.enrollMarginAwareTicket(empty,plan('binance'),setup('binance'),'manual',book,{},T+4);
assert.equal(l.tickets.length,1);
assert.equal(l.tickets[0].state,'WAITING');
let bin=M.futuresCapitalRow(book,'binance',l,{},T+4);
assert.equal(bin.pendingMarginUSDT,20);
assert.equal(bin.openMarginUSDT,0);
assert.equal(bin.admissionFreeUSDT,80);
assert.equal(bin.activeCount,1);
assert.equal(M.futuresCapitalRow(book,'bybit',l,{},T+4).reservedUSDT,0,
 'pending reservations do not consume the opposite exchange balance');
l=M.enrollMarginAwareTicket(l,plan('bybit'),setup('bybit'),'auto',book,{},T+4);
assert.equal(l.tickets.length,2);
assert.equal(M.futuresCapitalRow(book,'bybit',l,{},T+4).admissionFreeUSDT,40);
// Repeated signal must not reserve another 20.
assert.equal(M.enrollMarginAwareTicket(l,plan('bybit'),setup('bybit'),'auto',book,{},T+4),l);
assert.equal(M.futuresCapitalRow(book,'bybit',l,{},T+4).reservedUSDT,20);
const capBad={...setup('bybit'),exchange:'binance'};
assert.equal(M.checkDemoMargin(book,'bybit',capBad,l,{},T+4).allowed,false);
const bTicket=l.tickets.find(t=>t.plan.source==='binance');
const yTicket=l.tickets.find(t=>t.plan.source==='bybit');
const open={...bTicket,state:'OPEN',activatedAt:T+5};
const marked={version:1,tickets:[open,yTicket]};
const price=barsFor('binance','BTCUSDT',98,T+6000);
assert.equal(M.confirmedFutureMark(open,price,T+6000).mark,98);
let risk=M.futuresCapitalRow(book,'binance',marked,price,T+6000);
assert.equal(risk.floatingUSDT,-2);
assert.equal(risk.openMarginUSDT,20);
assert.equal(risk.equityUSDT,98);
assert.equal(risk.freeEquityUSDT,78);
assert.equal(risk.admissionFreeUSDT,78);
assert.equal(M.confirmedFutureMark(open,{},T+6000).status,'MISSING');
assert.equal(M.futuresCapitalRow(book,'binance',marked,{},T+6000).unknownMarks,1);
assert.equal(M.checkDemoMargin(book,'binance',setup('binance'),marked,{},T+6000).allowed,false,
 'missing source mark blocks new paper registration');
assert.equal(M.confirmedFutureMark(open,price,T+16*MS).status,'STALE');
assert.equal(M.checkDemoMargin(book,'binance',setup('binance'),marked,price,T+16*MS).allowed,false);
assert.equal(M.futuresCapitalRow(book,'bybit',marked,price,T+6000).unknownMarks,0,
 'data error on Binance does not block Bybit paper capacity');
const partial={...open,tpReached:1,remainingPct:50,grossUSDT:1,
 events:[...open.events,{at:T+6000,type:'TP1',detail:'half'}]};
const partialLedger={version:1,tickets:[partial,yTicket]};
risk=M.futuresCapitalRow(book,'binance',partialLedger,price,T+6000);
assert.equal(risk.balanceUSDT,101,'first TP profit counts in paper cash, separate from deposit');
assert.equal(risk.reservedUSDT,10,'TP 50% frees half virtual margin');
assert.equal(risk.floatingUSDT,-1,'unrealized mark only on remaining half');
assert.equal(risk.equityUSDT,100);
assert.equal(risk.admissionFreeUSDT,90);
assert.equal(risk.openCount,1);
// BE merely moves stop; no extra realized gain.
const breakeven={...partial,protectiveStop:100,
 events:[...partial.events,{at:T+6200,type:'BE',detail:'from next bar'}]};
assert.equal(M.futuresCapitalRow(book,'binance',{version:1,tickets:[breakeven,yTicket]},price,T+6500).balanceUSDT,101);
const positive=barsFor('binance','BTCUSDT',107,T+6000);
risk=M.futuresCapitalRow(book,'binance',partialLedger,positive,T+6000);
assert.equal(risk.floatingUSDT,3.5);
assert.equal(risk.admissionFreeUSDT,91,
 'positive unrealized PnL cannot fund an additional new virtual order');
const end={...breakeven,state:'CLOSED',remainingPct:0,grossUSDT:1,
 closedAt:T+6500,closeReason:'BE',events:[...breakeven.events,{at:T+6500,type:'STOP',detail:'BE remainder'}]};
const ended={version:1,tickets:[end,yTicket]};
risk=M.futuresCapitalRow(book,'binance',ended,price,T+6600);
assert.equal(risk.reservedUSDT,0);
assert.equal(risk.floatingUSDT,0);
assert.equal(risk.balanceUSDT,101);
assert.equal(risk.admissionFreeUSDT,101,'fully closed position releases margin');
const expired={...bTicket,state:'EXPIRED',closedAt:T+6600};
assert.equal(M.futuresCapitalRow(book,'binance',{version:1,tickets:[expired]},price,T+6600).reservedUSDT,0);
const cancelled={...bTicket,state:'CANCELLED',closedAt:T+6600};
assert.equal(M.futuresCapitalRow(book,'binance',{version:1,tickets:[cancelled]},price,T+6600).reservedUSDT,0);
// Withdraw cannot consume existing pending margin even though wallet balance=100.
let wd=M.checkDemoWithdrawal(book,'binance',l,{},8500,T+7000);
assert.equal(wd.allowed,false);
wd=M.checkDemoWithdrawal(book,'binance',l,{},8000,T+7000);
assert.equal(wd.allowed,true);
wd=M.checkDemoWithdrawal(book,'binance',marked,{},100,T+7000);
assert.equal(wd.allowed,false,'unknown OPEN mark prevents withdrawal');
assert.equal(M.checkDemoWithdrawal(null,'binance',empty,{},100,T+7000).allowed,false);
// Source-specific, sequential multi scan cannot double-reserve funds.
const chosen=['BTCUSDT','DOGEUSDT','SOLUSDT','GRAMUSDT'];
const plans=chosen.flatMap((symbol,i)=>[plan('binance',symbol,i),plan('bybit',symbol,i)]);
const smallLedger=M.enrollMarginAwareMulti(empty,plans,setup('binance'),book,{},T+100);
const bCount=smallLedger.tickets.filter(t=>t.plan.source==='binance').length;
const yCount=smallLedger.tickets.filter(t=>t.plan.source==='bybit').length;
assert.equal(bCount,3,'global six-active cap fairly splits virtual proposals between exchanges');
assert.equal(yCount,3,'global six-active cap after fair interleave');
assert.equal(smallLedger.tickets.length,6);
assert.equal(M.enrollMarginAwareMulti(smallLedger,plans,setup('binance'),book,{},T+100),smallLedger);
const cheap=A.openDemoWallets(empty,T);
let capped=A.transferDemoCash(cheap,B,'DEPOSIT','25',empty,T+1);
capped=A.transferDemoCash(capped,Y,'DEPOSIT','45',empty,T+2);
const fewer=M.enrollMarginAwareMulti(empty,plans,setup('binance'),capped,{},T+100);
assert.equal(fewer.tickets.filter(t=>t.plan.source==='binance').length,1);
assert.equal(fewer.tickets.filter(t=>t.plan.source==='bybit').length,2);
assert.equal(fewer.tickets.length,3,'capital guard in multi accounts');
assert.equal(A.reportDemoWallet(book,'futures:binance',empty).depositsUSDT,100);
assert.equal(A.reportDemoWallet(book,'futures:binance',empty).realizedGrossUSDT,0);
const app=fs.readFileSync('src/App.tsx','utf8');
for(const word of ['РЫНОЧНЫЙ РАДАР • 8.3','futuresCapitalRow','checkDemoMargin',
 'enrollMarginAwareTicket','enrollMarginAwareMulti','checkDemoWithdrawal',
 'maxDemoPositionsForSetup','Средства (баланс + плавающий результат)',
 'Зарезервировано','Свободно для новых DEMO-планов','Плавающий результат',
 'Демо-счета','Режимы виртуального ассистента',
 'apex_v64_futures_demo','apex_v82_virtual_accounts','apex_v76_rolling_checkpoints']){
 // account key exists in module; not literal in App, where the constant is used
 if(word==='apex_v82_virtual_accounts'||word==='Демо-счета')continue;
 assert(app.includes(word),'APEX 8.3 expected UI/guard '+word);
}
assert(!/\/fapi\/v1\/order\b|\/v5\/order\/create\b|sendOrder|apiSecret|apiKey/.test(
 fs.readFileSync('src/radar/v83-margin-capital.ts','utf8')));
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
console.log('APEX 8.3 PASS: x5 notional margin, real separate DEMO balances, pending and TP release, free equity, no stale marks, multi/withdrawal safety');
