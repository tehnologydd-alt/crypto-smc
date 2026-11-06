/** APEX 4.8: non-intrusive prospective CORE H4 regime audit, nested in H1 research UI. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 4.8 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/context-audit.ts','src/radar/context-audit.ts');
fs.copyFileSync('updates/test-context-audit.cjs','scripts/test-context-audit.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {openDriftLedger,advanceDriftLedger,driftReport} from './radar/regime-drift';",
"import {openDriftLedger,advanceDriftLedger,driftReport} from './radar/regime-drift';\nimport {openContextAudit,advanceContextAudit,contextAuditReport} from './radar/context-audit';",
'audit import');
app=rep(app,
" const [driftLedger,setDriftLedger]=useState(()=>openDriftLedger(localStorage.getItem('apex_v47_drift'),Date.now()));",
" const [driftLedger,setDriftLedger]=useState(()=>openDriftLedger(localStorage.getItem('apex_v47_drift'),Date.now()));\n const [h4AuditExpanded,setH4AuditExpanded]=useState(false);\n const [contextLedger,setContextLedger]=useState(()=>openContextAudit(localStorage.getItem('apex_v48_h4_context'),Date.now()));",
'new prospective registration and state');
app=rep(app,
" const driftStats=useMemo(()=>driftReport(driftLedger,now),[driftLedger,now]);",
" const driftStats=useMemo(()=>driftReport(driftLedger,now),[driftLedger,now]);\n const h4AuditStats=useMemo(()=>contextAuditReport(contextLedger),[contextLedger]);",
'compact H4 report');
const marker=" useEffect(()=>{try{localStorage.setItem('apex_v47_drift',JSON.stringify(driftLedger));}catch{}},[driftLedger]);";
app=rep(app,marker,marker+"\n useEffect(()=>{setContextLedger(prev=>advanceContextAudit(prev,hourHoldout,coreResearch,transitionSince,Date.now()));},[hourHoldout,coreResearch,transitionSince]);\n useEffect(()=>{try{localStorage.setItem('apex_v48_h4_context',JSON.stringify(contextLedger));}catch{}},[contextLedger]);",
'persist context separate from Learning and prior studies');
app=rep(app,
'<p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
read('updates/v48-context-ui.txt')+'\n  <p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
'nested collapsed UI');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.7','РЫНОЧНЫЙ РАДАР • 4.8','app version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-context-audit.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.8 forward-only H4 context quality audit\n- One small collapsible subpanel inside existing Statistics → CORE → H1 frozen-hypothesis view. No new tabs/screens. No modifications to alerts, demo, forecasts or execution.\n- On first opening v4.8, independently register an immutable start timestamp. Include only later H1 outcomes of the frozen v4.6 hypothesis that also have their original earliest full five-asset H1 snapshot available in the v4.4 CORE archive.\n- The H4 context is taken strictly from the baseline H1 snapshot before the following hour has closed, from five matching closed H4 candles. Group into H4 up/down/mixed using 4/5 matching candle signs. Never calculate a past context using future data.\n- The analysis is provenance-limited by the existing 14-day CORE archive and local Android observations. Missing H4 context increments the missing counter and is never silently backfilled.\n- Each H1 outcome is counted once, by unique next-hour timestamp with a persisted watermark. Distinct H4 groups need >=12 eligible observations across >=3 UTC days for an approximate descriptive comparison. Differences >=25 percentage points are marked as possible context dependence, not causal/statistical proof.\n- The original frozen hypothesis remains unchanged. Results are observational, serially dependent, and must not be treated as trading performance, advice, or signal accuracy.\n');
console.log('APEX 4.8 forward-only H4 market context audit installed');
