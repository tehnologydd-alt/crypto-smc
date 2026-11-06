/** APEX 6.4: independent read-only perpetual futures DEMO on top of stable 6.3. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 6.4 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v64-futures-market.ts','src/radar/v64-futures-market.ts');
fs.copyFileSync('updates/v64-futures-assistant.ts','src/radar/v64-futures-assistant.ts');
fs.copyFileSync('updates/test-v64-futures.cjs','scripts/test-v64-futures.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {fetchBybitSpotClosedBars} from './radar/demo-market-readonly';",
 "import {fetchBybitSpotClosedBars} from './radar/demo-market-readonly';\nimport type {AssistantFrame} from './radar/demo-assistant';\nimport {fetchFuturesClosedBars,type FutureBar} from './radar/v64-futures-market';\nimport {deriveFuturesStudyPlan,enrollFutureTicket,stepFuturesLedger,stopFutureDemo,restoreFuturesLedger,futureSummary,virtualMarginUSDT,type FutureLedger,type FutureSetup,type FutureMarginMode,type FuturePositionMode} from './radar/v64-futures-assistant';",
 'imports');
const stateAnchor=" const [bybitAssistantBars,setBybitAssistantBars]=useState<Record<string,DemoBar[]>>({});";
const states=[
" const [showLegacySpotArchive,setShowLegacySpotArchive]=useState(false);",
" const [futuresLedger,setFuturesLedger]=useState<FutureLedger>(()=>restoreFuturesLedger(localStorage.getItem('apex_v64_futures_demo'),Date.now()));",
" const [futuresMode,setFuturesMode]=useState<AssistantMode>(()=>localStorage.getItem('apex_v64_futures_mode')==='auto'?'auto':'manual');",
" const [futuresExchange,setFuturesExchange]=useState<AssistantExchange>(()=>localStorage.getItem('apex_v64_futures_source')==='bybit'?'bybit':'binance');",
" const [futuresSymbol,setFuturesSymbol]=useState(()=>localStorage.getItem('apex_v64_futures_symbol')||'BTCUSDT');",
" const [futuresFrame,setFuturesFrame]=useState<AssistantFrame>(()=>{const v=localStorage.getItem('apex_v64_futures_frame');return v==='1h'||v==='4h'?v:'5m'});",
" const [futuresLeverage,setFuturesLeverage]=useState<1|2|3|5>(()=>{const n=Number(localStorage.getItem('apex_v64_futures_leverage'));return n===2||n===3||n===5?n:1});",
" const [futuresMarginMode,setFuturesMarginMode]=useState<FutureMarginMode>(()=>localStorage.getItem('apex_v64_futures_margin')==='CROSS'?'CROSS':'ISOLATED');",
" const [futuresPositionMode,setFuturesPositionMode]=useState<FuturePositionMode>(()=>localStorage.getItem('apex_v64_futures_position')==='HEDGE'?'HEDGE':'ONE_WAY');",
" const [futuresNotional,setFuturesNotional]=useState(()=>{const n=Number(localStorage.getItem('apex_v64_futures_notional'));return [50,100,250,500].includes(n)?n:100});",
" const [futuresBars,setFuturesBars]=useState<Record<string,FutureBar[]>>({});",
" const [futuresError,setFuturesError]=useState('');",
" const [futuresMessage,setFuturesMessage]=useState('');"
].join('\n');
app=rep(app,stateAnchor,stateAnchor+'\n'+states,'state');
const logicAnchor=" const assistantStats=useMemo(()=>assistantSummary(assistantLedger),[assistantLedger]);";
app=rep(app,logicAnchor,logicAnchor+'\n'+read('updates/v64-futures-hooks.txt'),'hooks');
app=rep(app,"if(assistantMode!=='auto')return;","if(assistantMode!=='auto'||!showLegacySpotArchive)return;",'suspend old Spot auto enrollment when archive hidden');
app=rep(app,"{view==='assistant'&&",read('updates/v64-futures-ui.txt')+"\n  {showLegacySpotArchive&&view==='assistant'&&",'Futures tab and optional Spot archive');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.3','РЫНОЧНЫЙ РАДАР • 6.4','version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+f;let value=read(path);
 if(f==='test-layout-v621.cjs'||f==='test-layout-v62.cjs')
  value=value.replaceAll('РЫНОЧНЫЙ РАДАР • 6.3','РЫНОЧНЫЙ РАДАР • 6.4');
 write(path,value);
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v64-futures.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.4: Futures DEMO (read-only)\n- New fifth-tab default is a separate USDT perpetual study ledger. Binance USD-M /fapi/v1/klines and Bybit V5 category=linear provide only CLOSED futures candles. Spot 6.3 remains an opt-in, separate archived view with its storage preserved.\n- Each forward-only educational scenario is computed from continuous selected-exchange futures observations, never from APEX Spot signals. No synthetic historical fills, and gaps suspend execution inference.\n- Independent virtual margin (Isolated/Cross), hedge/one-way, leverage up to 5x, fixed nominal position, TP1/2/3 partial exits, optional BE on remaining fraction after TP1, protective exits, gross PnL ledger and decision history. The model does not calculate actual liquidation, funding, fees, slippage, order step filters or exchange account settings. No key/token/trade endpoints.\n- Polling in the foreground only; Android suspension may result in unresolvable data gaps. Real use is explicitly unsupported.\n');
console.log('APEX 6.4 futures read-only DEMO installed');
