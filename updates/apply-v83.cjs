/** APEX 8.3 — source-specific DEMO capital and margin; no live order actions. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('APEX 8.3 '+label+' matches='+n);
 return s.replace(a,b);
}
fs.copyFileSync('updates/v83-margin-capital.ts','src/radar/v83-margin-capital.ts');
fs.copyFileSync('updates/test-v83-margin.cjs','scripts/test-v83-margin.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {DEMO_ACCOUNT_KEY,openDemoWallets,restoreDemoWallets,reportDemoWallet,transferDemoCash,type DemoWalletBook,type DemoAccountKey,type DemoCashKind} from './radar/v82-demo-accounts';",
 "import {DEMO_ACCOUNT_KEY,openDemoWallets,restoreDemoWallets,reportDemoWallet,transferDemoCash,parseDemoCashAmount,type DemoWalletBook,type DemoAccountKey,type DemoCashKind} from './radar/v82-demo-accounts';\nimport {futuresCapitalRow,checkDemoMargin,checkDemoWithdrawal,enrollMarginAwareTicket,enrollMarginAwareMulti,maxDemoPositionsForSetup} from './radar/v83-margin-capital';",
 'imports');
app=rep(app,
 "  return keys.map(key=>({key,report:reportDemoWallet(demoWalletBook,key,futuresLedger)}));",
 "  return keys.map(key=>({key,report:reportDemoWallet(demoWalletBook,key,futuresLedger),\n   margin:key.startsWith('futures:')?futuresCapitalRow(demoWalletBook,key.split(':')[1] as AssistantExchange,futuresLedger,futuresBars,Date.now()):null}));",
 'capital rows');
app=rep(app,
 " },[demoWalletBook,showLegacySpotArchive,futuresLedger]);",
 " },[demoWalletBook,showLegacySpotArchive,futuresLedger,futuresBars,now]);",
 'capital row dependencies');
app=rep(app,
 "   const next=transferDemoCash(demoWalletBook,key,kind,demoCashDrafts[key],futuresLedger,Date.now());",
 [
 "   if(kind==='WITHDRAW'&&key.startsWith('futures:')){",
 "    const cents=parseDemoCashAmount(demoCashDrafts[key]);",
 "    const restriction=checkDemoWithdrawal(demoWalletBook,key.split(':')[1] as AssistantExchange,",
 "      futuresLedger,futuresBars,cents??0,Date.now());",
 "    if(!restriction.allowed)throw Error(restriction.reason);",
 "   }",
 "   const next=transferDemoCash(demoWalletBook,key,kind,demoCashDrafts[key],futuresLedger,Date.now());"
 ].join('\n'),
 'withdrawal margin protection');
app=rep(app,
 "setFuturesLedger(prev=>enrollFutureTicket(prev,futuresStudyPlan,futuresSetup,'auto',Date.now()));",
 "setFuturesLedger(prev=>enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'auto',demoWalletBook,futuresBars,Date.now()));",
 'single auto admission');
app=rep(app,
 "setFuturesLedger(prev=>enrollChosenDemoPlans(prev,eligible,futuresSetup,nowMs));",
 "setFuturesLedger(prev=>enrollMarginAwareMulti(prev,eligible,futuresSetup,demoWalletBook,futuresBars,nowMs));",
 'multi source specific admission');
app=rep(app,
 "setFuturesLedger(prev=>enrollFutureTicket(prev,futuresStudyPlan,futuresSetup,'manual',Date.now()));",
 "setFuturesLedger(prev=>enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'manual',demoWalletBook,futuresBars,Date.now()));",
 'manual admission');
app=rep(app,
 "  if(!futuresStudyPlan)return;\n  try{",
 [
 "  if(!futuresStudyPlan)return;",
 "  const funding=checkDemoMargin(demoWalletBook,futuresStudyPlan.source,futuresSetup,futuresLedger,futuresBars,Date.now());",
 "  if(!funding.allowed){setFuturesMessage('Futures DEMO: '+funding.reason);return;}",
 "  try{"
 ].join('\n'),
 'manual admission feedback');
app=rep(app,
 " },[futuresMode,futuresScope,futuresStudyPlan,futuresSetup,futuresSelectedKey,monitorJournal]);",
 " },[futuresMode,futuresScope,futuresStudyPlan,futuresSetup,futuresSelectedKey,monitorJournal,demoWalletBook,futuresBars]);",
 'single effect dependencies');
app=rep(app,
 " },[futuresMode,futuresScope,futuresMultiPlans,futuresSetup,monitorJournal]);",
 " },[futuresMode,futuresScope,futuresMultiPlans,futuresSetup,monitorJournal,demoWalletBook,futuresBars]);",
 'multi effect dependencies');
const previous=read('updates/v82-demo-wallet-ui.txt');
let upgraded=rep(previous,
 "  {demoWalletRows.map(({key,report})=>{",
 "  {demoWalletRows.map(({key,report,margin})=>{",
 'margin card mapping');
upgraded=rep(upgraded,
 '    <div className="grid grid-cols-3 gap-1 text-center">',
 '    {margin&&'+read('updates/v83-capital-wallet-ui.txt')+'}\n    <div className="grid grid-cols-3 gap-1 text-center">',
 'equity/free margin under each venue balance');
app=rep(app,previous,upgraded,'replace account component');
app=rep(app,
 "disabled={futuresExisting||futuresStudyPlan.expiresAt<Date.now()}",
 "disabled={futuresExisting||futuresStudyPlan.expiresAt<Date.now()||!checkDemoMargin(demoWalletBook,futuresStudyPlan.source,futuresSetup,futuresLedger,futuresBars,Date.now()).allowed}",
 'preflight manual scenario button');
const denied=[
 "    {futuresMode==='manual'&&!checkDemoMargin(demoWalletBook,futuresStudyPlan.source,futuresSetup,futuresLedger,futuresBars,Date.now()).allowed&&",
 "     <p className=\"rounded-lg border border-amber-400/20 bg-amber-400/5 p-2.5 text-[11px] text-amber-200\">",
 "      {checkDemoMargin(demoWalletBook,futuresStudyPlan.source,futuresSetup,futuresLedger,futuresBars,Date.now()).reason}",
 "      Пополни нужный виртуальный счёт или дождись освобождения маржи.",
 "     </p>}"
].join('\n');
app=rep(app,
 "    {futuresMode==='auto'&&<p className=\"text-[11px] text-violet-200\">Учебная модель регистрирует новые подходящие сценарии сама (до 6 одновременно). Это алгоритм, не ИИ с доказанной доходностью.</p>}",
 denied+"\n    {futuresMode==='auto'&&<p className=\"text-[11px] text-violet-200\">Учебная модель регистрирует подходящие сценарии только при наличии свободной виртуальной маржи (не более 6 одновременно). Это алгоритм, не ИИ с доказанной доходностью.</p>}",
 'user visible capital admission warning');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.2','РЫНОЧНЫЙ РАДАР • 8.3','release label');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.2','РЫНОЧНЫЙ РАДАР • 8.3'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v83-margin.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.3 — research-only virtual margin, equity and capital admission\n- For NEW Futures DEMO plans, source-specific Binance/Bybit virtual accounts independently reserve notional/leverage, even when a LIMIT is WAITING. Existing paper orders stay unchanged. Positive unrealized PnL is never eligible for additional reservations. Negative floating from fresh public CLOSED candles reduces free money. No fresh quote for OPEN ticket in a venue -> no new paper setup there.\n- After confirmed partial TP, margin reservation decreases in proportion to remainingPct. On CLOSED/EXPIRED/CANCELLED margin is released. Breakeven moves the virtual protectiveStop from the next candle, not a promise of actual profit. Margin uses simplified notional/leverage only: no funding, slippage, maintenance margin, liquidation tiers or real account execution.\n- Admission is checked for both auto and manual Futures plans; the existing global 6-active cap and per-venue conflicts remain. Each venue account shows balance, equity, pending/open/reserved/free margin, floating PnL from fresh CLOSED candles and maximum capacity at current user-provided virtual setup. Cash withdrawal cannot consume reserved money or ignore unpriced OPEN positions.\n- This is paper research, not an exchange account sync. No live trading, private keys, transfers or broker order APIs. Separate Spot balances remain unchanged and do not claim unverifiable Spot USDT profit.\n');
console.log('APEX 8.3 virtual funding guard applied');
