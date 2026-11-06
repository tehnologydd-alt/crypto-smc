/** APEX 5.0: local explainable research director, only a plan derived from CORE quality data. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 5.0 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/research-director.ts','src/radar/research-director.ts');
fs.copyFileSync('updates/test-research-director.cjs','scripts/test-research-director.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {coreQualityPassport} from './radar/core-quality-passport';",
"import {coreQualityPassport} from './radar/core-quality-passport';\nimport {researchDirector,openDirectorHistory,recordDirectorDecision} from './radar/research-director';",
'new director imports');
app=rep(app,
" const [researchQualityExpanded,setResearchQualityExpanded]=useState(false);",
" const [researchQualityExpanded,setResearchQualityExpanded]=useState(false);\n const [directorExpanded,setDirectorExpanded]=useState(false);\n const [directorHistory,setDirectorHistory]=useState(()=>openDirectorHistory(localStorage.getItem('apex_v50_director_log'),Date.now()));",
'director state');
const mark=" const researchQualityStats=useMemo(()=>coreQualityPassport({core:coreResearchStats,transitions:transitionStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats,contextSubject:contextLedger.subject},now),[coreResearchStats,transitionStats,hourHoldoutStats,driftStats,h4AuditStats,contextLedger.subject,now]);";
app=rep(app,mark,mark+'\n'+[
" const directorPlan=useMemo(()=>researchDirector({passport:researchQualityStats,core:coreResearchStats,transitions:transitionStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats}),[researchQualityStats,coreResearchStats,transitionStats,hourHoldoutStats,driftStats,h4AuditStats]);",
" useEffect(()=>{setDirectorHistory(prev=>recordDirectorDecision(prev,directorPlan,Date.now()));},[directorPlan]);",
" useEffect(()=>{try{localStorage.setItem('apex_v50_director_log',JSON.stringify(directorHistory));}catch{}},[directorHistory]);"
].join('\n'),'director pure plan plus change-only history');
app=rep(app,
'<p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
read('updates/v50-director-ui.txt')+'\n  <p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
'nested compact director');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.9','РЫНОЧНЫЙ РАДАР • 5.0','app version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-research-director.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.0 Research Director\n- An explainable, deterministic research planner within the existing collapsed CORE H1 study. No additional tabs/screens. It reads the v4.9 passport, native data-coverage, frozen H1, drift and H4 research reports without changing them.\n- Predeclared priorities: provenance mismatch, stale observations, incomplete data, H1 gaps, unformed hypothesis, incomplete prospective holdout, possible deterioration, context variation, missing research cohorts, next-period replication. Only one main focus is selected at a time, with up to two alternatives and a question / next step / acceptance criteria.\n- Keeps a bounded local history (32 changes) only when the selected research task/stage changes; never fills historical observations and never interprets this planner as a new self-learning model.\n- This is a rule-based on-device planner (not a separate connected LLM). No changes to trade strategies, user signals, notifications, WorkManager, frozen hypotheses, or simulated trading statistics.\n');
console.log('APEX 5.0 read-only Research Director with change-only local decision journal applied');
