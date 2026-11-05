/** APEX 3.6: immutable Market Pulse snapshots on new Learning entries. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(src,from,to,label){if(!src.includes(from))throw Error('APEX 3.6 missing '+label);return src.replace(from,to);}
let learning=read('src/radar/learning.ts');
const firstImport="import type {RadarSignal,Timeframe} from './engine';";
learning=rep(learning,firstImport,firstImport+"\nimport type {MarketPulse} from './market-pulse';\nimport {captureMarketAtEntry,type MarketAtEntry} from './context-study';",'Learning imports');
learning=rep(learning,
' status:ScenarioStatus;tpReached:number;lastCandleTime:number;closedAt?:number;reason:string;',
' status:ScenarioStatus;tpReached:number;lastCandleTime:number;closedAt?:number;reason:string;\n marketContext?:MarketAtEntry;','immutable Market Pulse field');
learning=rep(learning,
'function createRecord(s:Scenario,market:Context|undefined,now:number):LearningRecord{',
'function createRecord(s:Scenario,market:Context|undefined,now:number,pulse?:MarketPulse):LearningRecord{','record capture arg');
learning=rep(learning,
'  status:s.status,tpReached:s.tpReached||0,lastCandleTime:s.lastCandleTime,closedAt:s.closedAt,reason:s.reason};',
'  status:s.status,tpReached:s.tpReached||0,lastCandleTime:s.lastCandleTime,closedAt:s.closedAt,reason:s.reason,\n  marketContext:captureMarketAtEntry(pulse,s.createdAt,now)};','entry snapshot');
learning=rep(learning,
'export function reconcileLearning(old:LearningLedger,scenarios:Scenario[],markets:Record<string,Context>,now=Date.now()):LearningLedger{',
'export function reconcileLearning(old:LearningLedger,scenarios:Scenario[],markets:Record<string,Context>,now=Date.now(),pulse?:MarketPulse):LearningLedger{','reconciler');
learning=rep(learning,
'if(!prev){items.set(s.id,createRecord(s,markets[s.symbol],now));changed=true;continue;}',
'if(!prev){items.set(s.id,createRecord(s,markets[s.symbol],now,pulse));changed=true;continue;}','only initial record snapshot');
write('src/radar/learning.ts',learning);
let app=read('src/App.tsx');
const importMark="import {summarizePulse} from './radar/market-pulse';";
app=rep(app,importMark,importMark+"\nimport {contextReport as analyzeContext} from './radar/context-study';",'App imports');
const state=" const [pulseExpanded,setPulseExpanded]=useState(()=>localStorage.getItem('apex_v35_pulse_expanded')==='true');";
app=rep(app,state,state+"\n const [contextExpanded,setContextExpanded]=useState(()=>localStorage.getItem('apex_v36_context_expanded')==='true');",'context panel state');
const memo=" const learningReport=useMemo(()=>learningOverview(learning),[learning]);";
app=rep(app,memo,memo+"\n const contextStats=useMemo(()=>analyzeContext(learning),[learning]);",'context stats');
const persist=" useEffect(()=>{try{localStorage.setItem('apex_v35_pulse_expanded',String(pulseExpanded));}catch{}},[pulseExpanded]);";
app=rep(app,persist,persist+"\n useEffect(()=>{try{localStorage.setItem('apex_v36_context_expanded',String(contextExpanded));}catch{}},[contextExpanded]);",'context collapse persistence');
const oldEffect=" useEffect(()=>{setLearning(prev=>reconcileLearning(prev,scenarios,assets,Date.now()));},[scenarios]);";
app=rep(app,oldEffect," useEffect(()=>{setLearning(prev=>reconcileLearning(prev,scenarios,assets,Date.now(),marketPulse));},[scenarios]);",'capture pulse on first lifecycle reconciliation');
const signalMarker='   <section className="rounded-2xl border border-violet-500/25 bg-[#121a2b] p-4 space-y-3">';
app=rep(app,signalMarker,read('updates/v36-context-ui.txt')+'\n'+signalMarker,'context panel in signals');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 3.5','РЫНОЧНЫЙ РАДАР • 3.6','version');
write('src/App.tsx',app);
let vault=read('src/radar/vault.ts');
const mark=" if(typeof r.reason!=='string'||r.reason.length>8000)return false;";
const validation=[
" if(r.marketContext!==undefined){",
"  const m=r.marketContext;",
"  if(!isObj(m)||m.version!==1||!finite(m.capturedAt)||",
"   !finite(m.watched)||!Number.isInteger(m.watched)||!finite(m.eligible)||!Number.isInteger(m.eligible)||",
"   !finite(m.bullish)||!Number.isInteger(m.bullish)||!finite(m.bearish)||!Number.isInteger(m.bearish)||",
"   !finite(m.conflict)||!Number.isInteger(m.conflict)||",
"   m.watched<3||m.eligible<3||m.eligible>m.watched||m.bullish<0||m.bearish<0||m.conflict<0||",
"   m.bullish+m.bearish+m.conflict>m.eligible||",
"   m.capturedAt<r.createdAt||m.capturedAt>r.createdAt+10000||",
"   !['up','down','mixed','quiet'].includes(safeString(m.regime)))return false;",
" }"
].join('\n');
vault=rep(vault,mark,mark+'\n'+validation,'Vault optional context validation');
write('src/radar/vault.ts',vault);
fs.copyFileSync('updates/context-study.ts','src/radar/context-study.ts');
fs.copyFileSync('updates/test-context-study.cjs','scripts/test-context-study.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-context-study.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.6 Market Pulse x Learning\n- Stores compact pulse context only for NEW paper scenarios reconciled within 10 seconds of creation; missing snapshots remain missing.\n- Historic records are never backfilled using current markets. Backup validation permits optional snapshots and preserves older JSON archives.\n- Shows descriptive TP3/SL outcomes grouped by alignment with the favorite-watchlist Pulse, not by the whole crypto market.\n- Does not modify signal rules, real trading, Guardian, notifications or release signing.\n');
console.log('APEX 3.6 Market Pulse x Learning context linked');
