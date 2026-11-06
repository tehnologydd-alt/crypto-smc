/** APEX 4.7: prospective study-drift guard within existing collapsed H1 panel. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 4.7 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/regime-drift.ts','src/radar/regime-drift.ts');
fs.copyFileSync('updates/test-regime-drift.cjs','scripts/test-regime-drift.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {openHourHoldout,advanceHourHoldout,hourHoldoutReport} from './radar/hour-holdout';",
"import {openHourHoldout,advanceHourHoldout,hourHoldoutReport} from './radar/hour-holdout';\nimport {openDriftLedger,advanceDriftLedger,driftReport} from './radar/regime-drift';",
'drift import');
app=rep(app,
" const [hourHoldout,setHourHoldout]=useState(()=>openHourHoldout(localStorage.getItem('apex_v46_holdout'),Date.now()));",
" const [hourHoldout,setHourHoldout]=useState(()=>openHourHoldout(localStorage.getItem('apex_v46_holdout'),Date.now()));\n const [driftLedger,setDriftLedger]=useState(()=>openDriftLedger(localStorage.getItem('apex_v47_drift'),Date.now()));",
'prospective drift registration');
const memo=" const hourHoldoutStats=useMemo(()=>hourHoldoutReport(hourHoldout,transitionStats.evidence,transitionSince,now),[hourHoldout,transitionStats,transitionSince,now]);";
app=rep(app,memo,memo+"\n const driftStats=useMemo(()=>driftReport(driftLedger,now),[driftLedger,now]);",
'drift report derived from only frozen prospective ledger');
const marker=" useEffect(()=>{try{localStorage.setItem('apex_v46_holdout',JSON.stringify(hourHoldout));}catch{}},[hourHoldout]);";
app=rep(app,marker,marker+"\n useEffect(()=>{setDriftLedger(prev=>advanceDriftLedger(prev,hourHoldout,Date.now()));},[hourHoldout]);\n useEffect(()=>{try{localStorage.setItem('apex_v47_drift',JSON.stringify(driftLedger));}catch{}},[driftLedger]);",
'persist independent drift study');
app=rep(app,
'<p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
read('updates/v47-drift-ui.txt')+'\n  <p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
'nested compact diagnostic');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.6','РЫНОЧНЫЙ РАДАР • 4.7','version string');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-regime-drift.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.7 prospective deterioration monitor\n- Compact study diagnostic inside Statistics → CORE → H1 → frozen holdout; no additional tabs or navigation.\n- On first opening 4.7, register a separate timestamp and ignore pre-registration observations. Wait for exactly the first >=20 conditional matches across >=3 UTC days after registration, then freeze their total and frequency into a durable, immutable initial baseline.\n- Evaluate only later, distinct H1 outcomes from the frozen 4.6 study. The comparison window is the most recent 7 days and requires >=20 matching starting-state transitions across >=3 UTC days; a missing observation is never invented.\n- Possible frequency deterioration is flagged only when the recent rate is at least 25 percentage points lower AND its 90% Wilson heuristic upper bound falls below the baseline lower bound. Serial dependence means these intervals are NOT calibrated confidence guarantees or predictive proof.\n- No recent qualifying observations for >72h triggers stale-observations rather than asserting continued reliability. No auto-retraining, trade placement, notifications or changes to personal forecasts, favorites, WorkManager or Learning.\n');
console.log('APEX 4.7 prospective regime deterioration monitor applied');
