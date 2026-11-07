/** APEX 8.5: public exchange data API/WebSocket wiring ONLY. No account
 * login, keys, live orders, credentials, or changes to DEMO trading engines.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 8.5 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v85-public-stream.ts','src/radar/v85-public-stream.ts');
fs.copyFileSync('updates/test-v85-public-api.cjs','scripts/test-v85-public-api.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {futuresCapitalRow,checkDemoMargin,checkDemoWithdrawal,enrollMarginAwareTicket,enrollMarginAwareMulti,maxDemoPositionsForSetup} from './radar/v83-margin-capital';",
 "import {futuresCapitalRow,checkDemoMargin,checkDemoWithdrawal,enrollMarginAwareTicket,enrollMarginAwareMulti,maxDemoPositionsForSetup} from './radar/v83-margin-capital';\nimport {venueSocketKeys,publicSocketEndpoint,bybitSubscriptionArgs,decodePublicClosedSocketMessage,addSocketObservation,socketAgeState,streamKeyValid,type PublicVenueStatus,type PublicStreamObservation} from './radar/v85-public-stream';",
 'credential-free public API imports');
app=rep(app,
 " const [monitorJournal,setMonitorJournal]=useState<MonitorJournal>(()=>restoreMonitorJournal(localStorage.getItem('apex_v77_observation_health'),Date.now()));",
 [
 " const [monitorJournal,setMonitorJournal]=useState<MonitorJournal>(()=>restoreMonitorJournal(localStorage.getItem('apex_v77_observation_health'),Date.now()));",
 " // Session-only: public WebSocket readings are NOT virtual trade evidence.",
 " const [publicSocketEnabled,setPublicSocketEnabled]=useState(false);",
 " const [publicSocketStates,setPublicSocketStates]=useState<Record<AssistantExchange,PublicVenueStatus>>({",
 "  binance:{venue:'binance',status:'OFF',connectedAt:null,lastMessageAt:null,attempts:0,error:null,subscriptions:0},",
 "  bybit:{venue:'bybit',status:'OFF',connectedAt:null,lastMessageAt:null,attempts:0,error:null,subscriptions:0}",
 " });",
 " const [publicSocketObservations,setPublicSocketObservations]=useState<Record<string,PublicStreamObservation>>({});"
 ].join('\n'),
 'ephemeral public WebSocket observation state');
const socketEffect=[
 " const publicSocketKeyList=futuresObserveKeys.filter(streamKeyValid).slice(0,10);",
 " const publicSocketKey=publicSocketKeyList.join('|');",
 " useEffect(()=>{",
 "  const keys=publicSocketKey?publicSocketKey.split('|'):[];",
 "  const venues=['binance','bybit'] as AssistantExchange[];",
 "  let disposed=false,hidden=document.hidden;",
 "  const sockets:Partial<Record<AssistantExchange,WebSocket>>={};",
 "  const retries:Partial<Record<AssistantExchange,ReturnType<typeof setTimeout>>>={};",
 "  const keepalives:Partial<Record<AssistantExchange,ReturnType<typeof setInterval>>>={};",
 "  const failures:Record<AssistantExchange,number>={binance:0,bybit:0};",
 "  const setVenue=(venue:AssistantExchange,patch:Partial<PublicVenueStatus>)=>{",
 "   if(disposed)return;",
 "   setPublicSocketStates(prev=>({...prev,[venue]:{...prev[venue],...patch}}));",
 "  };",
 "  const closeVenue=(venue:AssistantExchange,status:PublicVenueStatus['status'])=>{",
 "   if(retries[venue]!==undefined){clearTimeout(retries[venue]);delete retries[venue];}",
 "   if(keepalives[venue]!==undefined){clearInterval(keepalives[venue]);delete keepalives[venue];}",
 "   const ws=sockets[venue];if(ws){delete sockets[venue];ws.onopen=null;ws.onmessage=null;ws.onerror=null;ws.onclose=null;",
 "    try{ws.close();}catch{}}",
 "   setVenue(venue,{status,connectedAt:null});",
 "  };",
 "  const connect=(venue:AssistantExchange)=>{",
 "   if(disposed||hidden||!publicSocketEnabled||!monitorJournal.online||sockets[venue])return;",
 "   const chosen=venueSocketKeys(keys,venue),url=publicSocketEndpoint(venue,chosen);",
 "   if(!url){setVenue(venue,{status:'OFF',subscriptions:0,error:null});return;}",
 "   const attempt=++failures[venue];",
 "   setVenue(venue,{status:attempt===1?'CONNECTING':'RETRYING',",
 "    subscriptions:chosen.length,attempts:attempt,error:null,connectedAt:null});",
 "   let ws:WebSocket;",
 "   try{ws=new WebSocket(url);}catch{setVenue(venue,{status:'ERROR',error:'WebSocket недоступен на устройстве'});return;}",
 "   sockets[venue]=ws;",
 "   ws.onopen=()=>{",
 "    if(disposed||hidden||sockets[venue]!==ws)return;",
 "    failures[venue]=0;",
 "    setVenue(venue,{status:'OPEN',connectedAt:Date.now(),error:null,attempts:attempt});",
 "    if(venue==='bybit'){",
 "     try{ws.send(JSON.stringify({op:'subscribe',args:bybitSubscriptionArgs(chosen)}));}",
 "     catch{try{ws.close();}catch{}return;}",
 "     keepalives[venue]=setInterval(()=>{",
 "      if(ws.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({op:'ping'}));}catch{}}",
 "     },20000);",
 "    }",
 "   };",
 "   ws.onmessage=(event:MessageEvent)=>{",
 "    if(disposed||hidden||sockets[venue]!==ws||typeof event.data!=='string'||event.data.length>100000)return;",
 "    let payload:unknown;try{payload=JSON.parse(event.data);}catch{return;}",
 "    const at=Date.now();",
 "    setVenue(venue,{lastMessageAt:at});",
 "    const closed=decodePublicClosedSocketMessage(payload,venue,chosen,at);",
 "    if(closed.length)setPublicSocketObservations(prev=>{let next=prev;",
 "     for(const item of closed)next=addSocketObservation(next,item,at);return next;});",
 "   };",
 "   ws.onerror=()=>{if(!disposed&&!hidden&&sockets[venue]===ws)",
 "    setVenue(venue,{status:'ERROR',error:'Не удалось установить публичный канал'})};",
 "   ws.onclose=()=>{",
 "    if(keepalives[venue]!==undefined){clearInterval(keepalives[venue]);delete keepalives[venue];}",
 "    if(sockets[venue]!==ws)return;",
 "    delete sockets[venue];",
 "    if(disposed||hidden)return;",
 "    const delay=Math.min(30000,2500*Math.pow(2,Math.min(attempt-1,4)));",
 "    setVenue(venue,{status:'RETRYING',connectedAt:null,error:'Канал прерван; повторная попытка'});",
 "    retries[venue]=setTimeout(()=>{delete retries[venue];connect(venue);},delay);",
 "   };",
 "  };",
 "  const onVisibility=()=>{",
 "   hidden=document.hidden;",
 "   if(hidden){venues.forEach(v=>closeVenue(v,'PAUSED'));}",
 "   else if(publicSocketEnabled&&monitorJournal.online){venues.forEach(connect);}",
 "  };",
 "  document.addEventListener('visibilitychange',onVisibility);",
 "  if(!publicSocketEnabled||!monitorJournal.online||hidden){",
 "   const status=publicSocketEnabled?'PAUSED':'OFF';",
 "   venues.forEach(venue=>setVenue(venue,{status,subscriptions:venueSocketKeys(keys,venue).length,",
 "    connectedAt:null,error:publicSocketEnabled&&!monitorJournal.online?'Нет сети':null}));",
 "  }else venues.forEach(connect);",
 "  return ()=>{",
 "   document.removeEventListener('visibilitychange',onVisibility);",
 "   venues.forEach(v=>closeVenue(v,'OFF'));disposed=true;",
 "  };",
 " },[publicSocketEnabled,publicSocketKey,monitorJournal.online]);"
].join('\n');
app=rep(app," const futuresObserveKey=futuresObserveKeys.join('|');",
 " const futuresObserveKey=futuresObserveKeys.join('|');\n"+socketEffect,
 'opt-in per-exchange public WebSocket connect, pause, retry and cleanup');
// Show public channels only in the existing Research -> data quality group.
// The existing 75s REST poll and all DEMO ledger/wallet behavior are unchanged.
app=rep(app,read('updates/v77-monitor-ui.txt'),
 read('updates/v77-monitor-ui.txt')+'\n'+read('updates/v85-public-stream-ui.txt'),
 'new public API status panel within Research diagnostics');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.4','РЫНОЧНЫЙ РАДАР • 8.5','visible version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.4','РЫНОЧНЫЙ РАДАР • 8.5'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v85-public-api.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.5 — public exchange market API connectivity, read-only\n- **Existing** REST public closed-candle polling remains the authoritative source for all Futures DEMO scenarios, margin, PnL and the independent study. NEW: opt-in, session-only per-source Binance USD-M / Bybit linear public WebSocket kline subscriptions are displayed under Assistant > Research > Market Data Quality. Subscriptions mirror selected favorites/current observational keys; at most 10, with dedicated venue state, observed confirmed closed candles, last receipt, gap tally and retries. No API credentials, exchange-account link, auth headers, private WebSocket URLs, balance reads, real orders or trade endpoints.\n- Public stream URL for Binance combined USD-M: wss://fstream.binance.com/stream?streams=..., kline x=true; Bybit public linear: wss://stream.bybit.com/v5/public/linear, kline confirm=true. Raw exchange packets are strictly validated for source, symbol, timeframe, positive OHLC, closed candle timestamp, and whitelisted subscription. Non-closed candle messages never become confirmed bars. A socket connection itself is not proof that a bar was received. Socket observations never update the trusted REST observations/virtual paper ledger.\n- Opt-in default OFF. Socket subscriptions pause while hidden/offline, unsubscribe and close on cleanup, attempt limited delayed reconnects when available, and use Bybit public ping for liveness. Android may suspend WebView; no always-on streaming promise. Existing WorkManager continues its independent bounded public-Futures health checks, not a live trading assistant.\n');
console.log('APEX 8.5 public credential-free Binance & Bybit WebSocket diagnostic connections integrated');
