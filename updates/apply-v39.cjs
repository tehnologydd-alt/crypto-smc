/** APEX 3.9: frozen future Market Pulse validation and durable research backup. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){if(!s.includes(a))throw Error('APEX 3.9 missing '+name);return s.replace(a,b);}
fs.copyFileSync('updates/pulse-holdout.ts','src/radar/pulse-holdout.ts');
fs.copyFileSync('updates/test-pulse-holdout.cjs','scripts/test-pulse-holdout.cjs');
let learning=read('src/radar/learning.ts');
const typeDeclaration=[
"export type PulseHoldout={version:1;frozenAt:number;trainingCutoff:number;expected:'with-pulse'|'against-pulse';trainingWeeks:number[]};",
"export type LearningLedger={version:1;startedAt:number;records:LearningRecord[];pulseHoldout?:PulseHoldout};",
"export function validPulseHoldout(x:unknown):x is PulseHoldout{",
" if(!x||typeof x!=='object'||Array.isArray(x))return false;",
" const s=x as Partial<PulseHoldout>;",
" return s.version===1&&typeof s.frozenAt==='number'&&Number.isFinite(s.frozenAt)&&",
"  typeof s.trainingCutoff==='number'&&Number.isFinite(s.trainingCutoff)&&s.trainingCutoff<=s.frozenAt&&",
"  (s.expected==='with-pulse'||s.expected==='against-pulse')&&Array.isArray(s.trainingWeeks)&&",
"  s.trainingWeeks.length>=3&&s.trainingWeeks.length<=8&&",
"  s.trainingWeeks.every(w=>Number.isInteger(w)&&w>=0&&w<s.frozenAt)&&",
"  new Set(s.trainingWeeks).size===s.trainingWeeks.length;",
"}"
].join('\n');
learning=rep(learning,"export type LearningLedger={version:1;startedAt:number;records:LearningRecord[]};",typeDeclaration,'Learning type');
learning=rep(learning,
"return {version:1,startedAt:parsed.startedAt,records:parsed.records.filter(x=>x&&typeof x.id==='string'&&statuses.has(x.status)).slice(0,2000)};",
"return {version:1,startedAt:parsed.startedAt,records:parsed.records.filter(x=>x&&typeof x.id==='string'&&statuses.has(x.status)).slice(0,2000),...(validPulseHoldout(parsed.pulseHoldout)?{pulseHoldout:parsed.pulseHoldout}:{})};",
'Learning restores hypothesis');
write('src/radar/learning.ts',learning);
let app=read('src/App.tsx');
app=rep(app,"import {temporalReport} from './radar/time-study';",
"import {temporalReport} from './radar/time-study';\nimport {freezePulseHoldout,pulseHoldoutReport} from './radar/pulse-holdout';",'App import');
app=rep(app," const [temporalExpanded,setTemporalExpanded]=useState(false);",
" const [temporalExpanded,setTemporalExpanded]=useState(false);\n const [pulseHoldoutExpanded,setPulseHoldoutExpanded]=useState(false);",'UI collapsed state');
app=rep(app," const temporalStats=useMemo(()=>temporalReport(learning),[learning]);",
" const temporalStats=useMemo(()=>temporalReport(learning),[learning]);\n const pulseHoldoutStats=useMemo(()=>pulseHoldoutReport(learning),[learning]);",'UI report');
const persist=" useEffect(()=>{try{localStorage.setItem('apex_v30_learning',JSON.stringify(learning));}catch{}},[learning]);";
app=rep(app,persist,persist+"\n useEffect(()=>{setLearning(prev=>freezePulseHoldout(prev,Date.now()));},[learning]);",'freeze once');
const marker='<p className="text-[11px] text-amber-200/85">{contextStats.note}</p>';
app=rep(app,marker,read('updates/v39-pulse-holdout-ui.txt')+'\n       '+marker,'new UI panel');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 3.8','РЫНОЧНЫЙ РАДАР • 3.9','version label');
write('src/App.tsx',app);
let vault=read('src/radar/vault.ts');
const validFn=[
"function validPulseFreeze(x:unknown):boolean{",
" if(!isObj(x)||x.version!==1||!finite(x.frozenAt)||!finite(x.trainingCutoff)||x.trainingCutoff>x.frozenAt||",
"  !['with-pulse','against-pulse'].includes(safeString(x.expected))||!Array.isArray(x.trainingWeeks)||",
"  x.trainingWeeks.length<3||x.trainingWeeks.length>8)return false;",
" return x.trainingWeeks.every(w=>finite(w)&&Number.isInteger(w)&&w>=0&&w<x.frozenAt)&&",
"  new Set(x.trainingWeeks).size===x.trainingWeeks.length;",
"}",
""
].join('\n');
vault=rep(vault,'function validLedger(x:unknown):x is LearningLedger{',validFn+'function validLedger(x:unknown):x is LearningLedger{','Vault guard');
vault=rep(vault,
'if(!isObj(x)||x.version!==1||!finite(x.startedAt)||!Array.isArray(x.records)||x.records.length>MAX_RECORDS)return false;',
'if(!isObj(x)||x.version!==1||!finite(x.startedAt)||!Array.isArray(x.records)||x.records.length>MAX_RECORDS||\n  (x.pulseHoldout!==undefined&&!validPulseFreeze(x.pulseHoldout)))return false;',
'optional frozen cohort validation');
vault=rep(vault,
'return {...more,initialVotes:snapshot.initialVotes,contextCaptured:snapshot.contextCaptured,volumeRatio:snapshot.volumeRatio,createdAt:a.createdAt};',
[
" if(a.marketContext&&b.marketContext&&JSON.stringify(a.marketContext)!==JSON.stringify(b.marketContext))",
"  throw Error('Несовместимые исходные снимки Market Pulse одного прогноза.');",
" return {...more,initialVotes:snapshot.initialVotes,contextCaptured:snapshot.contextCaptured,",
"  volumeRatio:snapshot.volumeRatio,createdAt:a.createdAt,marketContext:a.marketContext||b.marketContext};"
].join('\n'),'preserve original market context on Vault merge');
vault=rep(vault,'const incoming=backup.payload;\n if(currentStudy',
[
"const incoming=backup.payload;",
" if(current.pulseHoldout&&incoming.learning.pulseHoldout&&",
"  JSON.stringify(current.pulseHoldout)!==JSON.stringify(incoming.learning.pulseHoldout))",
"   throw Error('Разные зафиксированные проверки Market Pulse нельзя объединять автоматически.');",
" if(currentStudy"
].join('\n'),'reject incompatible frozen cohorts');
vault=rep(vault,
'return {learning:{version:1,startedAt:Math.min(current.startedAt,incoming.learning.startedAt),records:[...records.values()].sort((a,b)=>b.createdAt-a.createdAt)},study:currentStudy||incoming.study,added,updated};',
'return {learning:{version:1,startedAt:Math.min(current.startedAt,incoming.learning.startedAt),records:[...records.values()].sort((a,b)=>b.createdAt-a.createdAt),...(current.pulseHoldout||incoming.learning.pulseHoldout?{pulseHoldout:current.pulseHoldout||incoming.learning.pulseHoldout}:{})},study:currentStudy||incoming.study,added,updated};',
'preserve frozen study through Vault');
write('src/radar/vault.ts',vault);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-pulse-holdout.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.9 Frozen Market Pulse Holdout\n- Freezes an observational Market Pulse hypothesis after 3 completed, mature weekly cohorts.\n- Stores the frozen direction and timestamp inside the Learning ledger and Vault backup; incompatible freezes are rejected during import.\n- Tests only new virtual predictions from full UTC weeks after freeze, requiring 7-day maturity buffer.\n- The first 3 qualified prospective weeks form a fixed validation comparison, not a rolling tuned target.\n- No modifications to signals, Android notifications, Guardian, order lifecycle or real trading.\n');
console.log('APEX 3.9 prospective Pulse holdout installed');
