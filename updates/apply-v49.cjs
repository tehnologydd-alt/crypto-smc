/** APEX 4.9: compact, derived-only quality passport inside existing CORE study. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 4.9 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/core-quality-passport.ts','src/radar/core-quality-passport.ts');
fs.copyFileSync('updates/test-core-quality-passport.cjs','scripts/test-core-quality-passport.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {openContextAudit,advanceContextAudit,contextAuditReport} from './radar/context-audit';",
"import {openContextAudit,advanceContextAudit,contextAuditReport} from './radar/context-audit';\nimport {coreQualityPassport} from './radar/core-quality-passport';",
'passport imports');
app=rep(app,
" const [h4AuditExpanded,setH4AuditExpanded]=useState(false);",
" const [h4AuditExpanded,setH4AuditExpanded]=useState(false);\n const [researchQualityExpanded,setResearchQualityExpanded]=useState(false);",
'new collapse state');
app=rep(app,
" const h4AuditStats=useMemo(()=>contextAuditReport(contextLedger),[contextLedger]);",
" const h4AuditStats=useMemo(()=>contextAuditReport(contextLedger),[contextLedger]);\n const researchQualityStats=useMemo(()=>coreQualityPassport({core:coreResearchStats,transitions:transitionStats,holdout:hourHoldoutStats,drift:driftStats,context:h4AuditStats,contextSubject:contextLedger.subject},now),[coreResearchStats,transitionStats,hourHoldoutStats,driftStats,h4AuditStats,contextLedger.subject,now]);",
'read-only passport memo');
app=rep(app,
'<p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
read('updates/v49-quality-ui.txt')+'\n  <p className="text-[10px] text-slate-500">Сравнение описательное: соседние часы зависимы, а сама гипотеза выбрана по обучающей выборке.',
'one nested quality passport');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.8','РЫНОЧНЫЙ РАДАР • 4.9','display version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-core-quality-passport.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.9 CORE research quality passport\n- No new screen or navigation. An optional collapsed card within existing Statistics/CORE/H1 study summarizes 5 explicitly named quality checks: raw background data, H1 hourly evidence, frozen prospective sample, drift across periods and H4 context comparison.\n- It is a pure derived summary; never mutates the input ledgers, feedback, learning outcomes, paper trading, notification cadence or background scheduling.\n- No fabricated quality percentage. Each check can be pending, descriptive or caution. Whole-study states include waiting for evidence, stale observations, contradictory findings, limited input quality and descriptive agreement.\n- Before consolidating reports, ensure v4.6 frozen hypothesis identity matches any subjects stored in the v4.7 and v4.8 ledgers. Disagreement blocks assessment rather than mixing results from unrelated hypotheses.\n- Deliberately prioritize insufficient observations, significant deviations from the earlier sample, context dependency, stale timestamps or gaps. Agreement is never labeled proof, verified profit, guaranteed signal performance or forecast accuracy.\n');
console.log('APEX 4.9 CORE quality passport (read-only) applied');
