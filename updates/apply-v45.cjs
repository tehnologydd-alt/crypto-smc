/** APEX 4.5: prospective H1 transition study within local CORE archive. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){if(!s.includes(a))throw Error('APEX 4.5 missing '+name);return s.replace(a,b);}
fs.copyFileSync('updates/hour-transitions.ts','src/radar/hour-transitions.ts');
fs.copyFileSync('updates/test-hour-transitions.cjs','scripts/test-hour-transitions.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {openCoreResearch,appendCoreResearch,coreResearchReport} from './radar/core-research';",
"import {openCoreResearch,appendCoreResearch,coreResearchReport} from './radar/core-research';\nimport {hourTransitions} from './radar/hour-transitions';",
'study imports');
app=rep(app,
" const [coreResearchExpanded,setCoreResearchExpanded]=useState(false);",
[
" const [coreResearchExpanded,setCoreResearchExpanded]=useState(false);",
" const [transitionExpanded,setTransitionExpanded]=useState(false);",
" const [transitionSince]=useState<number>(()=>{",
"  const raw=Number(localStorage.getItem('apex_v45_hour_since'));",
"  if(Number.isFinite(raw)&&raw>0)return raw;",
"  const t=Date.now();",
"  try{localStorage.setItem('apex_v45_hour_since',String(t));}catch{}",
"  return t;",
" });"
].join('\n'),'prospective registration state');
app=rep(app,
" const coreResearchStats=useMemo(()=>coreResearchReport(coreResearch,now),[coreResearch,now]);",
" const coreResearchStats=useMemo(()=>coreResearchReport(coreResearch,now),[coreResearch,now]);\n const transitionStats=useMemo(()=>hourTransitions(coreResearch,transitionSince,now),[coreResearch,transitionSince,now]);",
'study memo');
const target='<p className="text-[10px] text-slate-500">Только проверенные закрытые свечи из фоновой Android-службы.';
app=rep(app,target,read('updates/v45-transitions-ui.txt')+'\n  '+target,'nested transitions panel');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.4','РЫНОЧНЫЙ РАДАР • 4.5','version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-hour-transitions.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.5 Prospective H1 CORE Transition Study\n- On first launch of 4.5, persist a registration timestamp. Earlier archived observations cannot enter this study, even if they are present in the 4.4 archive.\n- A closed H1 event is eligible only after the registration instant and with COMPLETE five-symbol observations; H1 timestamps must match across all five assets, and only the earliest snapshot per closed H1 timestamp counts.\n- Compare an H1 state with the very next H1 state only when both were actually observed in order, and the next hourly candle closed after the baseline observation. Any missing hours or incomplete H1 snapshots cannot be backfilled.\n- Predefined states: 4/5 positive H1 candles = up; 4/5 negative = down; otherwise mixed. Show transition matrix, observed persistence and missing-hour count. Even 20+ consecutive hours are correlated and descriptive, not statistically independent proof.\n- No change to user Signals, personal demo, Learning Ledger, notifications, Native WorkManager scheduling or market data sources.\n');
console.log('APEX 4.5 independent hourly transition study applied');
