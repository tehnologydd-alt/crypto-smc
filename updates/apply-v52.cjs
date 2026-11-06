/** APEX 5.2: immutable review summaries of completed research sampling tasks. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){if(!s.includes(a))throw Error('APEX 5.2 missing '+name);return s.replace(a,b);}
fs.copyFileSync('updates/research-reports.ts','src/radar/research-reports.ts');
fs.copyFileSync('updates/test-research-reports.cjs','scripts/test-research-reports.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {openResearchQueue,advanceResearchQueue,researchQueueSummary} from './radar/research-queue';",
"import {openResearchQueue,advanceResearchQueue,researchQueueSummary} from './radar/research-queue';\nimport {openResearchReviews,advanceResearchReviews,researchReviewOverview} from './radar/research-reports';",
'imports');
app=rep(app,
" const [queueExpanded,setQueueExpanded]=useState(false);",
" const [queueExpanded,setQueueExpanded]=useState(false);\n const [reviewReportsExpanded,setReviewReportsExpanded]=useState(false);\n const [selectedResearchReview,setSelectedResearchReview]=useState<string|null>(null);\n const [researchReviews,setResearchReviews]=useState(()=>openResearchReviews(localStorage.getItem('apex_v52_review_reports'),Date.now()));",
'persistent report state');
const marker=" const queueSummary=useMemo(()=>researchQueueSummary(researchQueue,directorPlan.focus.id),[researchQueue,directorPlan.focus.id]);";
const additional=[
" const reviewReportStats=useMemo(()=>researchReviewOverview(researchReviews,researchQueue),[researchReviews,researchQueue]);",
" useEffect(()=>{setResearchReviews(prev=>advanceResearchReviews(prev,{queue:researchQueue,quality:researchQualityStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats},Date.now()));},[researchQueue,researchQualityStats,hourHoldoutStats,driftStats,h4AuditStats]);",
" useEffect(()=>{try{localStorage.setItem('apex_v52_review_reports',JSON.stringify(researchReviews));}catch{}},[researchReviews]);"
].join('\n');
app=rep(app,marker,marker+'\n'+additional,'automatic immutable review reports');
const uiMarker='<p className="text-xs font-semibold text-violet-200">Журнал изменений задач</p>';
app=rep(app,uiMarker,read('updates/v52-reports-ui.txt')+'\n  '+uiMarker,
'nested reports within queue UI');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.1','РЫНОЧНЫЙ РАДАР • 5.2','version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-research-reports.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.2 Research Director evidence review reports\n- When an APEX 5.1 research task enters review (sample thresholds reached after registration), capture one immutable local review report keyed by task ID and registration timestamp. It is never rewritten as the market changes.\n- The report snapshots source task, assigned/ready/recorded times, observed counts, distinct periods, quality passport status, unresolved flags, frozen hypothesis identity when available, limitations and a predefined next question.\n- Only valid post-registration evidence can trigger report creation. Manual provenance-integrity tasks are NEVER auto-completed or auto-reported. Refuse to merge frozen H1 result reports across mismatched hypotheses.\n- Reports always remain "review required"; reaching a threshold is not a statistically validated conclusion or verified financial outcome. Saved reports have bounded retention, strict validation and deduplication across restarts. Long-term backup/archive is deferred to APEX 5.3.\n- Collapsed UI inside the existing Research Director → Queue block. No extra screens, no changes to signals, notifications, paper trades, Learning or background data collection.\n');
console.log('APEX 5.2 immutable review-report module installed');
