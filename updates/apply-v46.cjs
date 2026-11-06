/** APEX 4.6: freeze one fixed-core H1 hypothesis and evaluate only later transitions. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 4.6 missing '+label);return s.replace(a,b);}
let tr=read('src/radar/hour-transitions.ts');
tr=rep(tr,' newestAt:number|null;recent:HourTransition[];rows:HourTransitionRow[];note:string;',
' newestAt:number|null;recent:HourTransition[];evidence:HourTransition[];rows:HourTransitionRow[];note:string;','add explicit eligible transition evidence');
tr=rep(tr,'newestAt:null,recent:[],rows:emptyRows(),note};',
'newestAt:null,recent:[],evidence:[],rows:emptyRows(),note};','empty evidence array');
tr=rep(tr,'newestAt:hours.at(-1)?.closedAt??null,recent:edges.slice(-5).reverse(),rows,note};',
'newestAt:hours.at(-1)?.closedAt??null,recent:edges.slice(-5).reverse(),evidence:edges,rows,note};',
'eligible evidence in 4.5 report');
write('src/radar/hour-transitions.ts',tr);
fs.copyFileSync('updates/hour-holdout.ts','src/radar/hour-holdout.ts');
fs.copyFileSync('updates/test-hour-holdout.cjs','scripts/test-hour-holdout.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {hourTransitions} from './radar/hour-transitions';",
"import {hourTransitions} from './radar/hour-transitions';\nimport {openHourHoldout,advanceHourHoldout,hourHoldoutReport} from './radar/hour-holdout';",
'import frozen transition comparison');
app=rep(app," const [transitionExpanded,setTransitionExpanded]=useState(false);",
" const [transitionExpanded,setTransitionExpanded]=useState(false);\n const [holdoutExpanded,setHoldoutExpanded]=useState(false);\n const [hourHoldout,setHourHoldout]=useState(()=>openHourHoldout(localStorage.getItem('apex_v46_holdout'),Date.now()));",
'holdout persistent state');
app=rep(app,
" const transitionStats=useMemo(()=>hourTransitions(coreResearch,transitionSince,now),[coreResearch,transitionSince,now]);",
" const transitionStats=useMemo(()=>hourTransitions(coreResearch,transitionSince,now),[coreResearch,transitionSince,now]);\n const hourHoldoutStats=useMemo(()=>hourHoldoutReport(hourHoldout,transitionStats.evidence,transitionSince,now),[hourHoldout,transitionStats,transitionSince,now]);",
'holdout summary memo');
const effectMarker=" const [hourHoldout,setHourHoldout]=useState(()=>openHourHoldout(localStorage.getItem('apex_v46_holdout'),Date.now()));";
const effects=[
" useEffect(()=>{setHourHoldout(prev=>advanceHourHoldout(prev,transitionStats.evidence,transitionSince,Date.now()));},[transitionStats,transitionSince]);",
" useEffect(()=>{try{localStorage.setItem('apex_v46_holdout',JSON.stringify(hourHoldout));}catch{}},[hourHoldout]);"
].join('\n');
/* Effects after the state declaration but before other useEffects from 4.4 are valid inside App. */
app=rep(app,effectMarker,effectMarker+'\n'+effects,'automatic freeze and subsequent validation');
app=rep(app,
'<p className="text-[10px] text-slate-500">{transitionStats.note}</p>',
read('updates/v46-holdout-ui.txt')+'\n  <p className="text-[10px] text-slate-500">{transitionStats.note}</p>',
'collapsible nested 4.6 results');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.5','РЫНОЧНЫЙ РАДАР • 4.6','version label');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-hour-holdout.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.6 Prospective frozen H1 hypothesis\n- After >=20 eligible H1 transitions of one starting market regime spanning >=3 UTC days, freeze exactly one most frequent next-state candidate (deterministic tie-breaking). This is selected on training observations and should be interpreted as exploratory.\n- The new fixed freeze timestamp, selected regime and its training sample are persisted separately from the 14-day CORE archive. Neither favorites nor user demo selection can change the frozen study.\n- Only transitions with starting CLOSED H1 time strictly AFTER freeze can enter holdout, in arrival order. Unique next-H1 timestamps, forward watermark, source-provenanced complete 5-asset snapshots and the already frozen 4.5 study rules protect against replay/backfilling.\n- Preserve the latest 1,500 future hourly transition observations on-device; compare matches conditional on the selected prior regime against the unconditional frequency of that next-state across all future hourly observations.\n- Display comparisons only descriptively after >=20 relevant future transitions spanning >=3 UTC days; adjacent H1 transitions are serially correlated and cannot establish predictive accuracy from percentage values alone.\n- No changes to alerts, paper scenarios, Learning, favorites, native WorkManager, or navigation. The panel is nested inside existing collapsed H1 transitions panel.\n');
console.log('APEX 4.6 fixed-hypothesis prospective H1 holdout applied');
