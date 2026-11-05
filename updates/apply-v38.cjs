/** APEX 3.8: observational week-by-week stability; no changes to signal/scenario behavior. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,from,to,name){if(!s.includes(from))throw Error('APEX 3.8 missing '+name);return s.replace(from,to);}
fs.copyFileSync('updates/time-study.ts','src/radar/time-study.ts');
fs.copyFileSync('updates/test-time-study.cjs','scripts/test-time-study.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {evidenceReport} from './radar/reliability-study';",
"import {evidenceReport} from './radar/reliability-study';\nimport {temporalReport} from './radar/time-study';",'imports');
const state=" const [contextExpanded,setContextExpanded]=useState(()=>localStorage.getItem('apex_v36_context_expanded')==='true');";
app=rep(app,state,state+"\n const [temporalExpanded,setTemporalExpanded]=useState(false);",'collapsed control');
const memo=" const evidenceStats=useMemo(()=>evidenceReport(contextStats),[contextStats]);";
app=rep(app,memo,memo+"\n const temporalStats=useMemo(()=>temporalReport(learning),[learning]);",'memo');
const needle='<p className="text-[11px] text-amber-200/85">{contextStats.note}</p>';
app=rep(app,needle,read('updates/v38-temporal-ui.txt')+'\n       '+needle,'temporal UI');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 3.7','РЫНОЧНЫЙ РАДАР • 3.8','version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-time-study.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.8 Temporal Validation\n- Prospectively groups virtual predictions by ISO-compatible UTC Monday weeks of creation, never by settlement time.\n- Shows the latest eight weekly cohorts and pending/cancelled/expired records, with a 7-day maturity buffer before comparison.\n- Requires at least 20 TP3/SL outcomes and >=75% settlement per directional cohort, across 3 eligible weeks, before labeling repeated descriptive patterns.\n- Does not auto-optimize trade parameters, change signals, or claim a causal/predictive advantage.\n');
console.log('APEX 3.8 temporal validity study applied');
