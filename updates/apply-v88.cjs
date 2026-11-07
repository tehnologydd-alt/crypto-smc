/** APEX 8.8 — global DEMO assistant on/off and mobile-first home.
 * No exchange accounts/keys/orders. A paused assistant admits no NEW DEMO
 * ticket by either Spot/Futures automatic or manual route. Existing ticket
 * life cycles are still observed to keep the journal consistent.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('APEX 8.8 '+label+' matches='+n);
 return s.replace(a,b);
}
let app=read('src/App.tsx');
// Keep preference separate from ledger; a failed write never silently enables.
app=rep(app,
 " const [assistantLedger,setAssistantLedger]=useState<AssistantLedger>(()=>openAssistantLedger(localStorage.getItem('apex_v63_assistant_demo'),Date.now()));",
 [
 " // APEX 8.8 global DEMO admission kill switch (both Spot and Futures).",
 " const [assistantEnabled,setAssistantEnabled]=useState<boolean>(()=>{",
 "  try{const flag=localStorage.getItem('apex_v88_assistant_enabled');return flag===null||flag==='on';}",
 "  catch{return false;}",
 " });",
 " const assistantEnabledRef=useRef(assistantEnabled);",
 " const [assistantSwitchNote,setAssistantSwitchNote]=useState('');",
 " const toggleAssistantEnabled=()=>{",
 "  const next=!assistantEnabledRef.current;",
 "  if(next){",
 "   // Enabling requires a durable write first, otherwise fail closed.",
 "   try{",
 "    localStorage.setItem('apex_v88_assistant_enabled','on');",
 "    if(localStorage.getItem('apex_v88_assistant_enabled')!=='on')throw Error('confirmation failed');",
 "   }catch{",
 "    setAssistantSwitchNote('Не удалось сохранить включение. Новые DEMO-планы остаются заблокированы.');",
 "    return;",
 "   }",
 "   assistantEnabledRef.current=true;setAssistantEnabled(true);",
 "   setAssistantSwitchNote('Ассистент включён. В автоматическом режиме могут создаваться новые виртуальные планы при свежих данных.');",
 "  }else{",
 "   // Flip the ref immediately so queued setState updaters cannot enroll.",
 "   assistantEnabledRef.current=false;setAssistantEnabled(false);",
 "   try{",
 "    localStorage.setItem('apex_v88_assistant_enabled','off');",
 "    if(localStorage.getItem('apex_v88_assistant_enabled')!=='off')throw Error('confirmation failed');",
 "    setAssistantSwitchNote('Ассистент выключен; новые виртуальные планы остановлены.');",
 "   }catch{",
 "    setAssistantSwitchNote('Выключено только до перезапуска: сохранение на устройстве недоступно. Проверь память приложения.');",
 "   }",
 "  }",
 " };",
 " const [assistantLedger,setAssistantLedger]=useState<AssistantLedger>(()=>openAssistantLedger(localStorage.getItem('apex_v63_assistant_demo'),Date.now()));"
 ].join('\n'),
 'global fail-closed persisted DEMO on/off');
app=rep(app,
 " const [assistantSubtab,setAssistantSubtab]=useState<'positions'|'research'>(()=>localStorage.getItem('apex_v81_assistant_subtab')==='research'?'research':'positions');",
 [
 " const [assistantSubtab,setAssistantSubtab]=useState<'overview'|'positions'|'research'>(()=>{",
 "  try{const x=localStorage.getItem('apex_v88_assistant_subtab');",
 "   return x==='research'||x==='positions'?x:'overview';}",
 "  catch{return 'overview';}",
 " });"
 ].join('\n'),
 'new home as default Assistant section');
app=rep(app,
 "localStorage.setItem('apex_v81_assistant_subtab',assistantSubtab)",
 "localStorage.setItem('apex_v88_assistant_subtab',assistantSubtab)",
 'tab preference v88 distinct key migration');

// Require global enablement and current ref at every admission point.
app=rep(app,
 "if(assistantMode!=='auto'||!showLegacySpotArchive)return;",
 "if(!assistantEnabled||assistantMode!=='auto'||!showLegacySpotArchive)return;",
 'Spot auto conditional');
app=rep(app,
 "setAssistantLedger(prev=>autoEnrollDemoOrders(prev,presentedScenarios,assistantExchange,assistantPortionValues,assistantBreakeven,Date.now()));",
 "setAssistantLedger(prev=>assistantEnabledRef.current?autoEnrollDemoOrders(prev,presentedScenarios,assistantExchange,assistantPortionValues,assistantBreakeven,Date.now()):prev);",
 'Spot auto queued updater re-check');
app=rep(app,
 "},[assistantMode,assistantExchange,assistantPortions,assistantBreakeven,presentedScenarios]);",
 "},[assistantMode,assistantExchange,assistantPortions,assistantBreakeven,presentedScenarios,assistantEnabled]);",
 'Spot auto effect dependencies');
app=rep(app,
 " const addAssistantScenario=(s:Scenario)=>{\n  try{",
 " const addAssistantScenario=(s:Scenario)=>{\n  if(!assistantEnabledRef.current){setAssistantMessage('Ассистент выключен. Включи его для новых виртуальных планов.');return;}\n  try{",
 'Spot manual double-check');
// Spot manual CTA is blocked visually as well.
app=rep(app,
 "onClick={()=>addAssistantScenario(s)} className=",
 "onClick={()=>addAssistantScenario(s)} disabled={!assistantEnabled} className=",
 'Spot manual button disabled when off');

app=rep(app,
 "if(futuresMode!=='auto'||futuresScope!=='single'||",
 "if(!assistantEnabled||futuresMode!=='auto'||futuresScope!=='single'||",
 'Futures single auto condition');
app=rep(app,
 "if(futuresMode!=='auto'||futuresScope!=='multi'||",
 "if(!assistantEnabled||futuresMode!=='auto'||futuresScope!=='multi'||",
 'Futures multi auto condition');
app=rep(app,
 "setFuturesLedger(prev=>enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'auto',demoWalletBook,futuresBars,Date.now()));",
 "setFuturesLedger(prev=>assistantEnabledRef.current?enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'auto',demoWalletBook,futuresBars,Date.now()):prev);",
 'Futures single queued updater re-check');
app=rep(app,
 "setFuturesLedger(prev=>enrollMarginAwareMulti(prev,eligible,futuresSetup,demoWalletBook,futuresBars,nowMs));",
 "setFuturesLedger(prev=>assistantEnabledRef.current?enrollMarginAwareMulti(prev,eligible,futuresSetup,demoWalletBook,futuresBars,nowMs):prev);",
 'Futures multi queued updater re-check');
app=rep(app,
 "},[futuresMode,futuresScope,futuresStudyPlan,futuresSetup,futuresSelectedKey,monitorJournal,demoWalletBook,futuresBars]);",
 "},[futuresMode,futuresScope,futuresStudyPlan,futuresSetup,futuresSelectedKey,monitorJournal,demoWalletBook,futuresBars,assistantEnabled]);",
 'Futures single auto dependencies');
app=rep(app,
 "},[futuresMode,futuresScope,futuresMultiPlans,futuresSetup,monitorJournal,demoWalletBook,futuresBars]);",
 "},[futuresMode,futuresScope,futuresMultiPlans,futuresSetup,monitorJournal,demoWalletBook,futuresBars,assistantEnabled]);",
 'Futures multi auto dependencies');
app=rep(app,
 " const addFuturesPlan=()=>{\n  if(!futuresStudyPlan)return;",
 " const addFuturesPlan=()=>{\n  if(!assistantEnabledRef.current){setFuturesMessage('Ассистент выключен. Новые Futures DEMO-планы заблокированы.');return;}\n  if(!futuresStudyPlan)return;",
 'Futures manual double-check');
app=rep(app,
 "setFuturesLedger(prev=>enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'manual',demoWalletBook,futuresBars,Date.now()));",
 "setFuturesLedger(prev=>assistantEnabledRef.current?enrollMarginAwareTicket(prev,futuresStudyPlan,futuresSetup,'manual',demoWalletBook,futuresBars,Date.now()):prev);",
 'Futures manual queued updater re-check');
app=rep(app,
 "disabled={futuresExisting||futuresStudyPlan.expiresAt<Date.now()||!checkDemoMargin(demoWalletBook,futuresStudyPlan.source,futuresSetup,futuresLedger,futuresBars,Date.now()).allowed}",
 "disabled={!assistantEnabled||futuresExisting||futuresStudyPlan.expiresAt<Date.now()||!checkDemoMargin(demoWalletBook,futuresStudyPlan.source,futuresSetup,futuresLedger,futuresBars,Date.now()).allowed}",
 'Futures manual button disabled when off');
// Avoid multi-favorite background observation from a disabled auto assistant.
// Existing open-ticket and ordinary public radar polling remain untouched.
app=rep(app,
 "futuresMode==='auto'&&futuresScope==='multi',view==='assistant'&&!showLegacySpotArchive,futuresLedger),",
 "assistantEnabled&&futuresMode==='auto'&&futuresScope==='multi',view==='assistant'&&!showLegacySpotArchive,futuresLedger),",
 'multi-favorite DEMO observations suspended while disabled');
app=rep(app,
 "[demoVenueMode,futuresFrame,futuresExchange,futuresSymbol,selectedDemoFavorites,favoriteRound,futuresMode,futuresScope,view,showLegacySpotArchive,futuresLedger]);",
 "[demoVenueMode,futuresFrame,futuresExchange,futuresSymbol,selectedDemoFavorites,favoriteRound,futuresMode,futuresScope,view,showLegacySpotArchive,futuresLedger,assistantEnabled]);",
 'observation key dependencies');

// Keep existing market selector, wallet carousel, all research widgets,
// and all existing position cards. Add a new 3-part navigation and overview.
app=rep(app,read('updates/v81-assistant-nav.txt'),
 read('updates/v88-assistant-control-ui.txt'),
 'mobile-first assistant overview, quick navigation, global switch');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.7','РЫНОЧНЫЙ РАДАР • 8.8','version label');
write('src/App.tsx',app);
fs.copyFileSync('updates/test-v88-control.cjs','scripts/test-v88-control.cjs');
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.7','РЫНОЧНЫЙ РАДАР • 8.8'));
}
// The previous Assistant navigation assertion was intentionally two tabs;
// the redesigned home adds a third while retaining all prior view content.
let legacy=read('scripts/test-v81-assistant-layout.cjs');
legacy=rep(legacy,"'Позиции · DEMO','Исследования',","'Позиции','Проверки',",'v81 regression: clearer mobile navigation labels');
legacy=rep(legacy,"'apex_v81_assistant_subtab'","'apex_v88_assistant_subtab'",'v81 regression: new navigation preference key');
legacy=rep(legacy,
 "assert.equal((app.match(/role=\"tab\" aria-selected=\\{assistantSubtab===/g)||[]).length,2,'two Assistant subtabs, independent of other application tabs');",
 "assert.equal((app.match(/role=\"tab\" aria-selected=\\{assistantSubtab===/g)||[]).length,3,'three Assistant subtabs, independent of other application tabs');",
 'v81 regression: three-tab navigation only');
write('scripts/test-v81-assistant-layout.cjs',legacy);
let walletTest=read('scripts/test-v82-accounts.cjs');
walletTest=rep(walletTest,"'Позиции · DEMO','Исследования',","'Позиции','Проверки',",'v82 wallet regression: renamed navigation labels');
write('scripts/test-v82-accounts.cjs',walletTest);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v88-control.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.8 — Assistant home, global pause and mobile UX simplification\n- A third Assistant subtab **Главное** (default after upgrade) replaces crowded initial landing with a quick glance: Spot/Futures active/waiting/closed, separate Binance/Bybit DEMO balances and conservative free money, four navigation actions and one foldable data-quality explanation. **Позиции** keeps complete prior per-venue swipe accounts and all manual/automatic virtual configuration and open-ticket management. **Проверки** retains all previous prospective studies and public Testnet diagnostics. Previous saved research/positions tab preference is not destructively overwritten; new preference key only for new navigation.\n- Global **Ассистент включён / выключен** switch has a single authoritative persisted key apex_v88_assistant_enabled and an immediate synchronous ref to prevent queued React state updaters registering new DEMO positions after a pause. OFF blocks BOTH Spot and Futures automatic creation and manually initiated additions (including both Futures multi-venue and single-venue). Failure to persist an ON choice fails closed; failure to persist OFF explicitly warns that pause is session-only. Existing WAITING/OPEN tickets continue observed forward-only lifecycle updates from actual closed public candles and are never deleted or repriced. Radar, research and user-enabled unrelated data monitoring remain operational.\n- No new private API, account key, exchange action, money transfer or alteration of existing simulation/research correctness. This is the first screen-wide UX simplification stage, not a new forecasting model.\n');
console.log('APEX 8.8 global DEMO assistant pause and mobile-first home applied');
