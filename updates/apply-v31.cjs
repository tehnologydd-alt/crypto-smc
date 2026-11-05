/** APEX 3.1 Research: prospective, frozen hypotheses without signal changes. */
const fs=require('node:fs');
const src='src/App.tsx';let s=fs.readFileSync(src,'utf8');
function rep(from,to,label){if(!s.includes(from))throw Error('APEX 3.1 missing '+label);s=s.replace(from,to)}
rep("import {openLearning,reconcileLearning,learningOverview,type LearningLedger} from './radar/learning';",
 "import {openLearning,reconcileLearning,learningOverview,type LearningLedger} from './radar/learning';\nimport {studyFromStorage,freezeResearch,researchReport as summarizeResearch,researchPercent,type ResearchStudy} from './radar/research';",'research imports');
const state=" const [learning,setLearning]=useState<LearningLedger>(()=>openLearning(localStorage.getItem('apex_v30_learning'),Date.now()));";
rep(state,state+"\n const [researchStudy,setResearchStudy]=useState<ResearchStudy|null>(()=>studyFromStorage(localStorage.getItem('apex_v31_research')));",'frozen research state');
const persist=" useEffect(()=>{try{localStorage.setItem('apex_v30_learning',JSON.stringify(learning));}catch{}},[learning]);";
rep(persist,persist+"\n useEffect(()=>{setResearchStudy(prev=>freezeResearch(prev,learning,Date.now()));},[learning]);\n useEffect(()=>{if(researchStudy)try{localStorage.setItem('apex_v31_research',JSON.stringify(researchStudy));}catch{}},[researchStudy]);",'research persistence');
const memo=" const learningReport=useMemo(()=>learningOverview(learning),[learning]);";
rep(memo,memo+"\n const researchReport=useMemo(()=>summarizeResearch(learning,researchStudy,Date.now()),[learning,researchStudy]);",'research reporting');
const journal='   <section className="rounded-2xl border border-teal-500/20 bg-[#101a2a] p-3 space-y-2">';
rep(journal,fs.readFileSync('updates/v31-research-ui.txt','utf8')+'\n'+journal,'research panel');
rep('РЫНОЧНЫЙ РАДАР • 3.0','РЫНОЧНЫЙ РАДАР • 3.1','version header');
fs.writeFileSync(src,s);
fs.copyFileSync('updates/research.ts','src/radar/research.ts');
fs.copyFileSync('updates/test-research.cjs','scripts/test-research.cjs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts.test+=' && node scripts/test-research.cjs';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.1 Research (frozen prospective validation)\n- Analyzes only paper TP3/SL outcomes in 3.0 Learning ledger, not real trades.\n- Uses the oldest completed record per symbol per UTC day to reduce correlated samples.\n- After 60 qualifying observations, selects at most 3 predefined candidate contrasts; freezes the research rules and cutoff forever for that cohort.\n- Only virtual scenarios created after the frozen cutoff enter validation; thresholds are never tuned on held-out results.\n- Reports insufficient data honestly. No automated trade rule changes and no guaranteed predictive edge.\n');
console.log('APEX 3.1 frozen hypothesis validation installed');
