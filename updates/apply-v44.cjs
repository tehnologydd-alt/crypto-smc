/** APEX 4.4: independent, on-device native CORE research archive (no scored predictions). */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 4.4 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/core-research.ts','src/radar/core-research.ts');
fs.copyFileSync('updates/test-core-research.cjs','scripts/test-core-research.cjs');
let app=read('src/App.tsx');
app=rep(app,
"import {getCoreNativeStatus,configureCoreNative,requestCoreCheck,type CoreNativeState} from './radar/core-background';",
"import {getCoreNativeStatus,configureCoreNative,requestCoreCheck,type CoreNativeState} from './radar/core-background';\nimport {openCoreResearch,appendCoreResearch,coreResearchReport} from './radar/core-research';",
'archive imports');
app=rep(app,
" const [coreNativeBusy,setCoreNativeBusy]=useState(false);",
" const [coreNativeBusy,setCoreNativeBusy]=useState(false);\n const [coreResearch,setCoreResearch]=useState(()=>openCoreResearch(localStorage.getItem('apex_v44_core_research'),Date.now()));\n const [coreResearchExpanded,setCoreResearchExpanded]=useState(false);",
'archive local state');
const marker=" const [coreNativeMessage,setCoreNativeMessage]=useState('');";
app=rep(app,marker,marker+'\n'+[
" useEffect(()=>{setCoreResearch(prev=>appendCoreResearch(prev,coreNative.samples,Date.now()));},[coreNative.samples]);",
" useEffect(()=>{try{localStorage.setItem('apex_v44_core_research',JSON.stringify(coreResearch));}catch{}},[coreResearch]);",
""
].join('\n'),'archive ingest and persistence');
app=rep(app,
" const coverageStats=useMemo(()=>coreCoverageReport(coreCoverage,now),[coreCoverage,now]);",
" const coverageStats=useMemo(()=>coreCoverageReport(coreCoverage,now),[coreCoverage,now]);\n const coreResearchStats=useMemo(()=>coreResearchReport(coreResearch,now),[coreResearch,now]);",
'archive report');
app=rep(app,
'<section className="rounded-2xl border border-sky-500/20 bg-[#101d2e] p-3 space-y-2">',
read('updates/v44-research-ui.txt')+'\n<section className="rounded-2xl border border-sky-500/20 bg-[#101d2e] p-3 space-y-2">',
'foldable research archive UI');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.3','РЫНОЧНЫЙ РАДАР • 4.4','app version');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-core-research.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.4 independent CORE observation archive\n- Resumes saved public-market native research observations on app foreground, deduplicated by original worker run timestamp. Never generates a minute-by-minute history for missing periods.\n- Stores a compact, source-tagged local summary of up to 1,200 unique runs during the last 14 days; native worker keeps only its latest 96 runs until the app opens. Opening the app at least once before the native buffer rolls over prevents avoidable archival gaps.\n- Rejects future timestamps, unknown sources, duplicate symbols/frames and candles closing after a snapshot was taken; all five assets × all three intervals required for complete classification.\n- Shows real checks, full/partial quality, UTC daily availability and longest gap. Same candle can appear in multiple runs: descriptive directions are correlated observations, not independent price predictions.\n- Archive is local app data, so clearing the app data or uninstalling may erase it; separate Learning/Vault outcomes remain unchanged.\n');
console.log('APEX 4.4 native research archive applied');
