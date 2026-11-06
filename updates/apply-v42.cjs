/** APEX 4.2: truthful CORE data coverage without background or historical backfilling. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){if(!s.includes(a))throw Error('APEX 4.2 missing '+name);return s.replace(a,b);}
fs.copyFileSync('updates/core-coverage.ts','src/radar/core-coverage.ts');
fs.copyFileSync('updates/test-core-coverage.cjs','scripts/test-core-coverage.cjs');
let learning=read('src/radar/learning.ts');
learning=rep(learning,
'marketContext:captureMarketAtEntry(pulse,s.createdAt,now),',
"marketContext:captureMarketAtEntry(typeof coreSince==='number'&&s.createdAt>=coreSince&&fixedCore.has(s.symbol)?pulse:undefined,s.createdAt,now),",
'prevent noncore/favorites from inheriting CORE snapshot');
write('src/radar/learning.ts',learning);
let context=read('src/radar/context-study.ts');
context=rep(context,
" source?:'fixed-core-v1';",
" source?:'fixed-core-v1';quality?:'full-core-3tf-v1';",
'quality provenance field');
context=rep(context,
'return {version:1,source:\'fixed-core-v1\',capturedAt:now,watched:pulse.watched,eligible:pulse.eligible,',
"return {version:1,source:'fixed-core-v1',...(pulse.watched===5&&pulse.eligible===5&&pulse.assets?.length===5&&pulse.assets.every(a=>a.verifiedFrames===3)?{quality:'full-core-3tf-v1' as const}:{}),capturedAt:now,watched:pulse.watched,eligible:pulse.eligible,",
'tag fully sourced snapshot at creation');
context=rep(context,
" if(!m||m.version!==1||!m.regime)return 'missing';",
" if(!m||m.version!==1||!m.regime)return 'missing';\n if(record.cohort==='fixed-core-v1'&&(m.source!=='fixed-core-v1'||m.quality!=='full-core-3tf-v1'||m.watched!==5||m.eligible!==5))return 'missing';",
'do not mix incomplete core snapshots into pattern classification');
write('src/radar/context-study.ts',context);
let vault=read('src/radar/vault.ts');
vault=rep(vault,
" if(r.marketContext!==undefined&&isObj(r.marketContext)&&r.marketContext.source!==undefined&&r.marketContext.source!=='fixed-core-v1')return false;",
" if(r.marketContext!==undefined&&isObj(r.marketContext)&&r.marketContext.source!==undefined&&r.marketContext.source!=='fixed-core-v1')return false;\n if(r.marketContext!==undefined&&isObj(r.marketContext)&&r.marketContext.quality!==undefined&&r.marketContext.quality!=='full-core-3tf-v1')return false;",
'validate original data-quality evidence');
write('src/radar/vault.ts',vault);
let app=read('src/App.tsx');
app=rep(app,
"import {CORE_SYMBOLS,isCoreSymbol,researchUniverse,coreLearning} from './radar/research-core';",
"import {CORE_SYMBOLS,isCoreSymbol,researchUniverse,coreLearning} from './radar/research-core';\nimport {openCoreCoverage,recordCoreCoverage,coreCoverageReport,strictCorePulse} from './radar/core-coverage';",
'imports');
const state=" const [coreSince]=useState<number>(()=>{";
app=rep(app,state,
" const [coreCoverage,setCoreCoverage]=useState(()=>openCoreCoverage(localStorage.getItem('apex_v42_core_coverage'),Date.now()));\n const [coverageExpanded,setCoverageExpanded]=useState(false);\n"+state,
'coverage state');
app=rep(app,
"  const pulse=summarizePulse(fixed,quality,t);",
"  const pulse=strictCorePulse(summarizePulse(fixed,quality,t));",
'strict fixed research market snapshot');
const effect=" useEffect(()=>{try{localStorage.setItem('apex_v30_learning',JSON.stringify(learning));}catch{}},[learning]);";
const samples=[
" useEffect(()=>{",
"  const sample=()=>{",
"   if(document.hidden)return;",
"   const t=Date.now();",
"   const checks=CORE_SYMBOLS.map(symbol=>{",
"    const a=cache.current[symbol];",
"    const q=a?inspectDataHealth(a,t):undefined;",
"    return {symbol,lastTick:a?.lastTick||0,framesReady:!!q&&q.level==='ok'&&",
"     q.frames['5m'].status==='ok'&&q.frames['1h'].status==='ok'&&q.frames['4h'].status==='ok'};",
"   });",
"   setCoreCoverage(prev=>recordCoreCoverage(prev,checks,t));",
"  };",
"  sample();const timer=setInterval(sample,60_000);",
"  const resume=()=>{if(!document.hidden)sample();};",
"  document.addEventListener('visibilitychange',resume);",
"  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};",
" },[]);",
" useEffect(()=>{try{localStorage.setItem('apex_v42_core_coverage',JSON.stringify(coreCoverage));}catch{}},[coreCoverage]);",
""
].join('\n');
app=rep(app,effect,effect+'\n'+samples,'active-app sampling and local persistence');
const memo=" const independentLedger=useMemo(()=>coreLearning(learning),[learning]);";
app=rep(app,memo,memo+"\n const coverageStats=useMemo(()=>coreCoverageReport(coreCoverage,now),[coreCoverage,now]);",
'diagnostic report');
const panel='<section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-2">';
app=rep(app,panel,read('updates/v42-coverage-ui.txt')+'\n'+panel,
'CORE diagnostic panel on Statistics');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.1','РЫНОЧНЫЙ РАДАР • 4.2','version label');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-core-coverage.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.2 CORE Data Guardian\n- The fixed CORE universe remains 5 unchanged assets. Visible-app 60-second check-ins monitor data freshness and all 3 candle intervals, without claiming continuous 24/7 collection.\n- Missed minute slots while backgrounded/offline are explicitly counted missing. No retroactive or fabricated samples; 48h bounded device storage with 24h diagnostics.\n- Future Pulse-context research snapshots require all five active symbols with all three verified frames. Earlier partial CORE contexts remain archived but are classified as missing under stricter methodology.\n- Demo selection, scenario rules, Guardian, and notifications remain unchanged. This does not implement always-on background research.\n');
console.log('APEX 4.2 CORE Data Guardian installed');
