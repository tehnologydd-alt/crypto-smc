const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,JSON,Map,Set,Array});
 return m.exports;
}
const A=load('src/radar/v82-demo-accounts.ts'),T=Date.UTC(2026,10,7,13);
const keyB='futures:binance',keyY='futures:bybit',keyS='spot:binance';
function ticket(source,id,createdAt,opts={}){
 const entry=100,targets=[105,110,115];
 return {
  id:'futures:'+source+':BTCUSDT:5m:'+id,
  plan:{id:'futures:'+source+':BTCUSDT:5m:'+id,source,symbol:'BTCUSDT',
   frame:'5m',direction:'LONG',entry,stop:90,targets,createdAt,expiresAt:T+200000,
   observedBarAt:createdAt-300000,reason:'fixture',model:'futures-study-v1'},
  setup:{exchange:source,leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',
   notionalUSDT:100,portions:[50,30,20],breakeven:true},
  mode:'auto',state:'OPEN',quality:'OK',createdAt,lastBarAt:createdAt,
  protectiveStop:100,tpReached:1,remainingPct:50,grossUSDT:2.5,
  events:[{at:createdAt,type:'PLAN',detail:'start'},
   {at:createdAt+1000,type:'TP1',detail:'half'}],...opts
 };
}
const older=ticket('binance','old',T-20000);
const oldFinished=ticket('binance','historical',T-30000,{
 state:'CLOSED',tpReached:3,remainingPct:0,grossUSDT:8.5,closedAt:T-2000,
 events:[{at:T-30000,type:'TP1',detail:''},{at:T-25000,type:'COMPLETED',detail:''}]
});
const olderY=ticket('bybit','old',T-20000,{grossUSDT:0,tpReached:0,remainingPct:100,events:[]});
const before={version:1,tickets:[older,oldFinished,olderY]};
let book=A.openDemoWallets(before,T);
assert.equal(book.version,1);assert.equal(Object.keys(book.wallets).length,4);
assert.equal(book.wallets[keyB].basis.length,1,'only older ACTIVE ticket should be baselined');
assert.equal(book.wallets[keyB].basis[0].valueUSDT,2.5);
assert.equal(book.wallets[keyS].basis.length,0,'Spot has no fictional cash profit');
assert.equal(A.reportDemoWallet(book,keyB,before).realizedGrossUSDT,0,
 'no retroactive gains from TP reached before account was created');
assert.equal(A.reportDemoWallet(book,keyY,before).realizedGrossUSDT,0);
assert.equal(A.reportDemoWallet(book,keyS,before).hasProfitModel,false);
assert.equal(A.parseDemoCashAmount('100,25'),10025);
assert.equal(A.parseDemoCashAmount('100.25'),10025);
assert.equal(A.parseDemoCashAmount('0.01'),1);
for(const x of ['0','-10','1.000','1,999','100000.01','Infinity','NaN',' ','1e4','4.','0.00']){
 assert.equal(A.parseDemoCashAmount(x),null,'invalid wallet amount '+x);
}
book=A.transferDemoCash(book,keyB,'DEPOSIT','100',before,T+1);
assert.equal(A.reportDemoWallet(book,keyB,before).balanceUSDT,100);
assert.equal(A.reportDemoWallet(book,keyB,before).realizedGrossUSDT,0);
assert.equal(A.reportDemoWallet(book,keyB,before).depositsUSDT,100);
assert.equal(A.reportDemoWallet(book,keyY,before).balanceUSDT,0,'separate exchange cash');
book=A.transferDemoCash(book,keyY,'DEPOSIT','25,50',before,T+2);
book=A.transferDemoCash(book,keyS,'DEPOSIT','1000.00',before,T+3);
assert.equal(A.reportDemoWallet(book,keyS,before).balanceUSDT,1000);
assert.equal(A.reportDemoWallet(book,keyS,before).realizedGrossUSDT,0);
assert.equal(A.reportDemoWallet(book,keyY,before).balanceUSDT,25.5);
assert.throws(()=>A.transferDemoCash(book,keyY,'WITHDRAW','25.51',before,T+4));
book=A.transferDemoCash(book,keyY,'WITHDRAW','5.25',before,T+4);
assert.equal(A.reportDemoWallet(book,keyY,before).balanceUSDT,20.25);
assert.equal(A.reportDemoWallet(book,keyY,before).withdrawalsUSDT,5.25);
assert.equal(A.reportDemoWallet(book,keyY,before).netAddedUSDT,20.25);
// Previously OPEN position closes after wallet creation; only the CHANGE from
// frozen baseline (2.5 TP already reached) is booked. STOP closes remaining 50%.
const stopped={...older,state:'CLOSED',tpReached:1,remainingPct:0,grossUSDT:-2.5,
 closedAt:T+60000,events:[...older.events,{at:T+60000,type:'STOP',detail:'remaining stop'}]};
const newTicket=ticket('binance','new',T+5,{
 state:'CLOSED',quality:'OK',tpReached:3,remainingPct:0,grossUSDT:8.5,
 events:[{at:T+5,type:'TP1',detail:''},{at:T+6000,type:'TP2',detail:''},
 {at:T+9000,type:'TP3',detail:''},{at:T+10000,type:'COMPLETED',detail:''}]
});
const manual=ticket('binance','manual',T+8,{state:'CLOSED',tpReached:1,remainingPct:0,
 grossUSDT:500,events:[{at:T+8,type:'TP1',detail:''},{at:T+9000,type:'MANUAL',detail:''}]});
const badGap=ticket('binance','badgap',T+9,{state:'CLOSED',tpReached:0,remainingPct:0,
 grossUSDT:800,quality:'GAP',events:[{at:T+9,type:'STOP',detail:''}]});
const newY=ticket('bybit','new',T+11,{state:'CLOSED',tpReached:0,remainingPct:0,grossUSDT:-7,
 events:[{at:T+11,type:'STOP',detail:''}]});
const after={version:1,tickets:[stopped,newTicket,manual,badGap,newY,oldFinished,olderY]};
assert.equal(A.recognizedFutureGross(stopped),-2.5);
assert.equal(A.recognizedFutureGross(newTicket),8.5);
assert.equal(A.recognizedFutureGross(manual),2.5,'do not invent remaining manual exit gain');
assert.equal(A.recognizedFutureGross(badGap),0,'gapped closure not booked');
assert.equal(A.reportDemoWallet(book,keyB,after).realizedGrossUSDT,6,
 'only +8.5 new, -5 delta older, +2.5 confirmed manual TP (not +500 manual estimate)');
assert.equal(A.reportDemoWallet(book,keyB,after).balanceUSDT,106);
assert.equal(A.reportDemoWallet(book,keyY,after).realizedGrossUSDT,-7);
assert.equal(A.reportDemoWallet(book,keyY,after).balanceUSDT,13.25);
assert.equal(A.reportDemoWallet(book,keyS,after).realizedGrossUSDT,0);
assert.equal(A.reportDemoWallet(book,keyB,after).excludedCount,2);
book=A.transferDemoCash(book,keyB,'WITHDRAW','50.00',after,T+100000);
assert.equal(A.reportDemoWallet(book,keyB,after).balanceUSDT,56);
assert.equal(A.reportDemoWallet(book,keyB,after).depositsUSDT,100);
assert.equal(A.reportDemoWallet(book,keyB,after).withdrawalsUSDT,50);
assert.equal(A.reportDemoWallet(book,keyB,after).realizedGrossUSDT,6,
 'withdrawal has no effect on strategy return');
assert.equal(A.restoreDemoWallets(JSON.stringify(book),T+101000).wallets[keyB].transfers.length,2);
assert.equal(A.restoreDemoWallets('not-json',T+101000),null);
assert.equal(A.restoreDemoWallets(JSON.stringify({...book,version:3}),T+101000),null);
const cloned=JSON.parse(JSON.stringify(book));cloned.wallets[keyB].transfers.push({...cloned.wallets[keyB].transfers[0]});
assert.equal(A.restoreDemoWallets(JSON.stringify(cloned),T+101000),null,'duplicate receipt id invalid');
const tampered=JSON.parse(JSON.stringify(book));tampered.wallets[keyB].basis[0].valueUSDT=Infinity;
assert.equal(A.restoreDemoWallets(JSON.stringify(tampered),T+101000),null,'nonfinite restored basis invalid');
const spChange=JSON.parse(JSON.stringify(book));spChange.wallets[keyS].basis=[book.wallets[keyB].basis[0]];
assert.equal(A.restoreDemoWallets(JSON.stringify(spChange),T+101000),null,'Spot cannot invent a baseline');
assert.throws(()=>A.transferDemoCash(book,keyB,'DEPOSIT','0',after,T+100002));
assert.throws(()=>A.transferDemoCash(book,keyB,'WITHDRAW','1000',after,T+100002));
assert.equal(book.wallets[keyB].transfers.length,2,'invalid transactions cannot mutate saved ledger');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const x of ['РЫНОЧНЫЙ РАДАР • 8.2','DEMO-счета','Позиции · DEMO','Исследования',
 'Режимы виртуального ассистента','Режим работы','Настроить ▾',
 'DEMO_ACCOUNT_KEY','restoreDemoWallets','openDemoWallets','reportDemoWallet',
 'transferDemoCash','setDemoWalletBook','demoWalletRows','applyDemoCashTransfer',
 '+ Пополнить','− Списать','История операций','Результат DEMO до издержек',
 'apex_v64_futures_demo','apex_v63_assistant_demo','apex_v76_selected_favorites',
 'apex_v66_forward_protocol','apex_v76_rolling_checkpoints','РЫНОЧНЫЙ РАДАР • 8.2'
])assert(app.includes(x),'APEX 8.2 missing UI/invariant '+x);
assert.equal((app.match(/<summary className="cursor-pointer list-none rounded-lg px-1 py-1\.5 text-sm font-semibold text-white"/g)||[]).length,2,
 'both Futures and Spot virtual modes are collapsible');
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
const src=fs.readFileSync('src/radar/v82-demo-accounts.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|apiKey|apiSecret|sendOrder|executeTrade|transferFunds/.test(src));
console.log('APEX 8.2 PASS: independent Spot/Futures Binance/Bybit wallets, +/− cash ledger, no deposits as profit, no old PnL backfill, manual/gap exclusions and foldable mode settings');
