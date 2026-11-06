/** APEX 5.1: prospective bounded queue of Director research tasks. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 5.1 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/research-queue.ts','src/radar/research-queue.ts');
fs.copyFileSync('updates/test-research-queue.cjs','scripts/test-research-queue.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {researchDirector,openDirectorHistory,recordDirectorDecision} from './radar/research-director';",
"import {researchDirector,openDirectorHistory,recordDirectorDecision} from './radar/research-director';\nimport {openResearchQueue,advanceResearchQueue,researchQueueSummary} from './radar/research-queue';",
'queue imports');
app=rep(app,
" const [directorExpanded,setDirectorExpanded]=useState(false);",
" const [directorExpanded,setDirectorExpanded]=useState(false);\n const [queueExpanded,setQueueExpanded]=useState(false);\n const [researchQueue,setResearchQueue]=useState(()=>openResearchQueue(localStorage.getItem('apex_v51_research_queue'),Date.now()));",
'local queue state');
const memo=" const directorPlan=useMemo(()=>researchDirector({passport:researchQualityStats,core:coreResearchStats,transitions:transitionStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats}),[researchQualityStats,coreResearchStats,transitionStats,hourHoldoutStats,driftStats,h4AuditStats]);";
const more=[
" const queueSummary=useMemo(()=>researchQueueSummary(researchQueue,directorPlan.focus.id),[researchQueue,directorPlan.focus.id]);",
" useEffect(()=>{setResearchQueue(prev=>advanceResearchQueue(prev,directorPlan,{archive:coreResearch,transitions:transitionStats,holdout:hourHoldout,drift:driftLedger,context:contextLedger},Date.now()));},[directorPlan,coreResearch,transitionStats,hourHoldout,driftLedger,contextLedger]);",
" useEffect(()=>{try{localStorage.setItem('apex_v51_research_queue',JSON.stringify(researchQueue));}catch{}},[researchQueue]);"
].join('\n');
app=rep(app,memo,memo+'\n'+more,'queue logic after Director memo');
const m="<p className=\"text-xs font-semibold text-fuchsia-200\">История решений</p>";
app=rep(app,m,read('updates/v51-queue-ui.txt')+'\n  '+m,'nested queue UI inside director');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.0','РЫНОЧНЫЙ РАДАР • 5.1','version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-research-queue.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.1 Prospective Research Director queue\n- Keeps up to 11 distinct research tasks and 48 task status changes locally, inside the existing collapsed 5.0 Director panel; no new screens.\n- The current primary mission and up to two alternatives are registered at first observation with a fixed timestamp, question, acceptance criterion and bounded status journal. Changes in director priority do not erase a queued task.\n- Evaluate actual closed H1 edges, original eligible holdout observations, drift cohorts, H4-context cohorts and provenance-tagged complete CORE snapshots only AFTER the task was registered. Distinct timestamp/day minimums and consecutiveness are enforced where appropriate, with no invented missing bars.\n- Tasks progress from queued/observing to "sample ready for human review" only. This never means a scientific hypothesis was validated, a prediction succeeded or trading quality improved. Journal-integrity checks cannot pass automatically and stay in manual-review mode.\n- Data is local device state. Existing signals, personal forecasts, paper orders, Learning, notifications, and CORE WorkManager schedule remain untouched.\n');
console.log('APEX 5.1 prospective research queue installed');
