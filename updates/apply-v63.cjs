/** APEX 6.3: one virtual Assistant engine, Binance/Bybit public data, no real execution. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const count=s.split(a).length-1;if(count!==1)throw Error('APEX 6.3 '+label+' matches='+count);return s.replace(a,b);}
fs.copyFileSync('updates/demo-assistant.ts','src/radar/demo-assistant.ts');
fs.copyFileSync('updates/demo-market-readonly.ts','src/radar/demo-market-readonly.ts');
fs.copyFileSync('updates/test-demo-assistant.cjs','scripts/test-demo-assistant.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {advanceScenario,proposeScenario,scenarioStats,targetsOf,type Scenario,type ScenarioStatus} from './radar/lifecycle';",
"import {advanceScenario,proposeScenario,scenarioStats,targetsOf,type Scenario,type ScenarioStatus} from './radar/lifecycle';\nimport {openAssistantLedger,addDemoOrder,autoEnrollDemoOrders,updateAssistantLedger,closeVirtualOrder,assistantSummary,type AssistantLedger,type AssistantMode,type AssistantExchange,type DemoBar,type ObservedReversal} from './radar/demo-assistant';\nimport {fetchBybitSpotClosedBars} from './radar/demo-market-readonly';",
'imports');
app=rep(app,"type View='radar'|'history'|'statistics'|'settings';",
"type View='radar'|'history'|'assistant'|'statistics'|'settings';",'View type');
app=rep(app,
" const [demoTickets,setDemoTickets]=useState<DemoTicket[]>(loadDemoTickets);",
" const [demoTickets,setDemoTickets]=useState<DemoTicket[]>(loadDemoTickets);\n const [assistantLedger,setAssistantLedger]=useState<AssistantLedger>(()=>openAssistantLedger(localStorage.getItem('apex_v63_assistant_demo'),Date.now()));\n const [assistantMode,setAssistantMode]=useState<AssistantMode>(()=>localStorage.getItem('apex_v63_assistant_mode')==='auto'?'auto':'manual');\n const [assistantExchange,setAssistantExchange]=useState<AssistantExchange>(()=>localStorage.getItem('apex_v63_assistant_exchange')==='bybit'?'bybit':'binance');\n const [assistantPortions,setAssistantPortions]=useState<'50/30/20'|'40/30/30'|'33/33/34'>(()=>{const x=localStorage.getItem('apex_v63_assistant_portions');return x==='40/30/30'||x==='33/33/34'?x:'50/30/20'});\n const [assistantBreakeven,setAssistantBreakeven]=useState(()=>localStorage.getItem('apex_v63_assistant_be')!=='false');\n const [assistantMessage,setAssistantMessage]=useState('');\n const [bybitAssistantError,setBybitAssistantError]=useState('');\n const [bybitAssistantBars,setBybitAssistantBars]=useState<Record<string,DemoBar[]>>({});",
'Assistant state');
const anchor=" const candidates=useMemo(()=>favorites.map(s=>assets[s]).filter((a):a is AssetState=>Boolean(a)),[favorites,assets]);";
app=rep(app,anchor,anchor+'\n'+read('updates/v63-assistant-hooks.txt'),'Assistant logic hooks');
app=rep(app,"{view==='statistics'&&",read('updates/v63-assistant-ui.txt')+"\n  {view==='statistics'&&",'Assistant UI');
const navAt=app.indexOf('<nav className="relative z-30 shrink-0 bg-[#0d1422]/95');
if(navAt<0)throw Error('APEX 6.3 nav missing');
let nav=app.slice(navAt);
nav=rep(nav,'grid grid-cols-4 gap-1','grid grid-cols-5 gap-1','nav layout');
nav=rep(nav,
"{id:'history',label:'Сигналы',icon:ChartNoAxesCombined},{id:'statistics',label:'Центр',icon:Activity}",
"{id:'history',label:'Сигналы',icon:ChartNoAxesCombined},{id:'assistant',label:'Ассистент',icon:ShieldCheck},{id:'statistics',label:'Центр',icon:Activity}",
'nav Assistant button');
app=app.slice(0,navAt)+nav;
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.2.1','РЫНОЧНЫЙ РАДАР • 6.3','version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(f=>f.startsWith('test-')&&f.endsWith('.cjs'))){
 const p='scripts/'+f;let contents=read(p);
 contents=contents.replaceAll("type View='radar'|'history'|'statistics'|'settings';",
  "type View='radar'|'history'|'assistant'|'statistics'|'settings';");
 if(f==='test-layout-v40.cjs'||f==='test-layout-v60.cjs')contents=contents.replaceAll('grid grid-cols-4','grid grid-cols-5');
 if(f==='test-layout-v621.cjs')contents=contents.replaceAll('РЫНОЧНЫЙ РАДАР • 6.2.1','РЫНОЧНЫЙ РАДАР • 6.3');
 if(f==='test-layout-v62.cjs')contents=contents.replaceAll('РЫНОЧНЫЙ РАДАР • 6.2','РЫНОЧНЫЙ РАДАР • 6.3');
 if(f==='test-layout-v62.cjs')contents=contents.replace("assert.equal((s.match(/<APEXSwitch /g)||[]).length,3,'three general settings switches');","assert.equal((s.match(/<APEXSwitch /g)||[]).length,4,'three Settings switches plus Assistant BE switch');");
 write(p,contents);
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-demo-assistant.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.3 — demo-only Binance/Bybit Assistant\n- Fifth tab with manual selection and rule-based auto registration of pending APEX virtual scenarios. Each is a separate versioned local DEMO order, never an exchange order.\n- A valid LIMIT, expiry before activation, three configured partial TP allocations, optional protective stop moved to entry after TP1, conservative same-candle stop priority, confirmed reversal after TP1 and an auditable event log. Existing signals, Learning and previously stored demo records remain unchanged.\n- Public market observations only: Binance from existing APEX closed candles and Bybit from unauthenticated spot /v5/market/kline. Exchange sources are never mixed for virtual fills. Original APEX forecasts are derived from Binance, and may not behave identically on Bybit.\n- Missing/stale market data cannot imply a real fill. This demo does not execute continuously while Android is suspended and includes no API keys, real orders, balances, wallets or trade endpoints.\n');
console.log('APEX 6.3 read-only dual-exchange DEMO Assistant installed');
