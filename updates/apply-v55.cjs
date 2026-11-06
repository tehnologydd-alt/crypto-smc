/** APEX 5.5: three independent audit rules composed by Research Director, no new expander. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 5.5 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/research-council.ts','src/radar/research-council.ts');
fs.copyFileSync('updates/test-research-council.cjs','scripts/test-research-council.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {openReplicationStudy,advanceReplicationStudy,replicationOverview,validReplicationStudy} from './radar/study-replication';",
"import {openReplicationStudy,advanceReplicationStudy,replicationOverview,validReplicationStudy} from './radar/study-replication';\nimport {researchCouncil} from './radar/research-council';",
'council import');
const marker=" const replicationStats=useMemo(()=>replicationOverview(replicationStudy,now,hourHoldout.frozen),[replicationStudy,now,hourHoldout.frozen]);";
app=rep(app,marker,marker+"\n const councilStats=useMemo(()=>researchCouncil({passport:researchQualityStats,core:coreResearchStats,transitions:transitionStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats,replication:replicationStats,directorFocus:directorPlan.focus.id},now),[researchQualityStats,coreResearchStats,transitionStats,hourHoldoutStats,driftStats,h4AuditStats,replicationStats,directorPlan.focus.id,now]);",
'derived council study');
const uiMarker='<p className="text-xs font-semibold text-fuchsia-200">История решений</p>';
app=rep(app,uiMarker,read('updates/v55-council-ui.txt')+'\n  '+uiMarker,
'one sibling council card without new navigation');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.4','РЫНОЧНЫЙ РАДАР • 5.5','app version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-research-council.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 5.5 Independent Research Audit Council\n- A compact static card inside existing Research Director (not another nested accordion) summarizes three separate deterministic read-only auditors: source data coverage, prospective frozen-pattern replication, and contradictory studies. They reason on distinct checks of the same CORE evidence, not external AI agents or statistically independent experiments.\n- Director applies a provenance veto when frozen studies mismatch; otherwise it records cautions, missing samples or descriptive agreement, with a reason and next question. No voting/majority that could override damaged evidence. Differences from current Director priority are shown, but never auto-edit tasks or frozen study protocols.\n- Aggregation is pure and temporary: no new persistent journal, signals, notifications, market forecasts, paper trades, Learning, native observer or research baseline modifications.\n');
console.log('APEX 5.5 three-rule research council applied');
