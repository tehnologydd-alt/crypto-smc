/** APEX 5.4: independent forward-only cohort replication; no extra menu nesting. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){if(!s.includes(a))throw Error('APEX 5.4 missing '+name);return s.replace(a,b);}
fs.copyFileSync('updates/study-replication.ts','src/radar/study-replication.ts');
fs.copyFileSync('updates/test-study-replication.cjs','scripts/test-study-replication.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {openCoreMemory,appendCoreMemory,coreMemoryStats,exportCoreMemory,importCoreMemory,mergeCoreMemory,validateCoreMemory} from './radar/core-memory';",
"import {openCoreMemory,appendCoreMemory,coreMemoryStats,exportCoreMemory,importCoreMemory,mergeCoreMemory,validateCoreMemory} from './radar/core-memory';\nimport {openReplicationStudy,advanceReplicationStudy,replicationOverview,validReplicationStudy} from './radar/study-replication';",
'replication imports');
app=rep(app,
" const [directorExpanded,setDirectorExpanded]=useState(false);",
" const [directorExpanded,setDirectorExpanded]=useState(false);\n const [replicationStudy,setReplicationStudy]=useState(()=>openReplicationStudy(localStorage.getItem('apex_v54_replication'),Date.now()));\n const [replicationBroken]=useState(()=>{const raw=localStorage.getItem('apex_v54_replication');if(raw===null)return false;try{return !validReplicationStudy(JSON.parse(raw),Date.now());}catch{return true;}});",
'prospective study registration and corrupt-store quarantine');
const marker=" const directorPlan=useMemo(()=>researchDirector({passport:researchQualityStats,core:coreResearchStats,transitions:transitionStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats}),[researchQualityStats,coreResearchStats,transitionStats,hourHoldoutStats,driftStats,h4AuditStats]);";
app=rep(app,marker,marker+'\n'+[
" const replicationStats=useMemo(()=>replicationOverview(replicationStudy,now,hourHoldout.frozen),[replicationStudy,now,hourHoldout.frozen]);",
" useEffect(()=>{if(!replicationBroken)setReplicationStudy(prev=>advanceReplicationStudy(prev,hourHoldout,Date.now()));},[hourHoldout,replicationBroken]);",
" useEffect(()=>{if(replicationBroken)return;try{localStorage.setItem('apex_v54_replication',JSON.stringify(replicationStudy));}catch{}},[replicationStudy,replicationBroken]);"
].join('\n'),'read-only research status and append-only local study');
app=rep(app,
'<p className="text-xs font-semibold text-fuchsia-200">История решений</p>',
read('updates/v54-replication-ui.txt')+'\n  <p className="text-xs font-semibold text-fuchsia-200">История решений</p>',
'sibling card in Research Director, not inside nested queue');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.3','РЫНОЧНЫЙ РАДАР • 5.4','app version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-study-replication.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.4 Independent H1 research replication\n- No additional nested expanders or menus: one compact card next to existing Director queue within the existing Research Director panel.\n- From the first opening of v5.4, pre-register one study timestamp and attach the already frozen v4.6 H1 regime-transition hypothesis without retraining. Only subsequently observed original v4.6 future H1 outcomes are eligible; no historical backfilling from imported data.\n- Complete fixed consecutive cohorts each after ≥20 original transitions of the fixed source regime over ≥3 UTC days. Successive cohorts must start on a new UTC day after the preceding cohort, so no hours or calendar days can occur in multiple groups. First cohort remains the immutable reference.\n- Compare the latest completed cohort with the first. A difference larger than 20 percentage points is a descriptive research discrepancy, not significance/proof; adjacent H1 observations remain dependent. Missing observations never get fabricated.\n- The on-device journal stores ≤24 permanent cohort summaries with immutable identities, rejects replay/future data, and refuses silent resets when the frozen hypothesis changes. Invalid stored history is quarantined instead of overwritten.\n- No changes to CORE data intake, signals, favorites, notifications, Learning, financial actions or paper trades.\n');
console.log('APEX 5.4 prospective non-overlapping cohort replication installed');
