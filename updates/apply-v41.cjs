/** APEX 4.1: independent fixed-cohort PAPER analytics, preserving legacy archive. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 4.1 missing '+label);return s.replace(a,b);}
fs.copyFileSync('updates/research-core.ts','src/radar/research-core.ts');
fs.copyFileSync('updates/test-core-v41.cjs','scripts/test-core-v41.cjs');

let learning=read('src/radar/learning.ts');
learning=rep(learning,' marketContext?:MarketAtEntry;',
 " marketContext?:MarketAtEntry;\n cohort?: 'fixed-core-v1';",'forward core cohort tag');
learning=rep(learning,
'export type LearningLedger={version:1;startedAt:number;records:LearningRecord[];pulseHoldout?:PulseHoldout};',
'export type LearningLedger={version:1;startedAt:number;records:LearningRecord[];pulseHoldout?:PulseHoldout;corePulseHoldout?:PulseHoldout};',
'separate core holdout');
learning=rep(learning,
'...(validPulseHoldout(parsed.pulseHoldout)?{pulseHoldout:parsed.pulseHoldout}:{})};',
'...(validPulseHoldout(parsed.pulseHoldout)?{pulseHoldout:parsed.pulseHoldout}:{}),...(validPulseHoldout(parsed.corePulseHoldout)?{corePulseHoldout:parsed.corePulseHoldout}:{})};',
'load independent hypothesis');
learning=rep(learning,"const frames:Timeframe[]=['5m','1h','4h'];",
"const frames:Timeframe[]=['5m','1h','4h'];\nconst fixedCore=new Set(['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']);",
'fixed cohort symbol set');
learning=rep(learning,
'function createRecord(s:Scenario,market:Context|undefined,now:number,pulse?:MarketPulse):LearningRecord{',
'function createRecord(s:Scenario,market:Context|undefined,now:number,pulse?:MarketPulse,coreSince?:number):LearningRecord{',
'prospective migration cutoff');
learning=rep(learning,
'marketContext:captureMarketAtEntry(pulse,s.createdAt,now)};',
"marketContext:captureMarketAtEntry(pulse,s.createdAt,now),\n  ...(typeof coreSince==='number'&&Number.isFinite(coreSince)&&s.createdAt>=coreSince&&fixedCore.has(s.symbol)?{cohort:'fixed-core-v1' as const}:{})};",
'tag only newly created fixed-core scenarios');
learning=rep(learning,
'export function reconcileLearning(old:LearningLedger,scenarios:Scenario[],markets:Record<string,Context>,now=Date.now(),pulse?:MarketPulse):LearningLedger{',
'export function reconcileLearning(old:LearningLedger,scenarios:Scenario[],markets:Record<string,Context>,now=Date.now(),pulse?:MarketPulse,coreSince?:number):LearningLedger{',
'new optional migration argument');
learning=rep(learning,'createRecord(s,markets[s.symbol],now,pulse)',
 'createRecord(s,markets[s.symbol],now,pulse,coreSince)','pass cohort cutoff');
write('src/radar/learning.ts',learning);

let context=read('src/radar/context-study.ts');
context=rep(context,'export type MarketAtEntry={\n version:1;capturedAt:number;watched:number;eligible:number;',
"export type MarketAtEntry={\n version:1;capturedAt:number;watched:number;eligible:number;\n source?:'fixed-core-v1';",
'typed observation source');
context=rep(context,'return {version:1,capturedAt:now,watched:pulse.watched,eligible:pulse.eligible,',
"return {version:1,source:'fixed-core-v1',capturedAt:now,watched:pulse.watched,eligible:pulse.eligible,",
'source provenance at capture');
context=rep(context,'Группы основаны на снимке избранных монет','Группы основаны на снимке фиксированной исследовательской группы монет','cohort note');
write('src/radar/context-study.ts',context);

let app=read('src/App.tsx');
app=rep(app,"import {freezePulseHoldout,pulseHoldoutReport} from './radar/pulse-holdout';",
"import {freezePulseHoldout,pulseHoldoutReport} from './radar/pulse-holdout';\nimport {CORE_SYMBOLS,isCoreSymbol,researchUniverse,coreLearning} from './radar/research-core';",
'app core imports');
const favorites=" const [favorites,setFavorites]=useState<string[]>(()=>readList('apex_v2_favorites',DEFAULT));";
const added=[
" const [coreSince]=useState<number>(()=>{",
"  const saved=Number(localStorage.getItem('apex_v41_core_since'));",
"  if(Number.isFinite(saved)&&saved>0)return saved;",
"  const since=Date.now();try{localStorage.setItem('apex_v41_core_since',String(since));}catch{}",
"  return since;",
" });",
" const monitoredSymbols=useMemo(()=>researchUniverse(favorites),[favorites]);"
].join('\n');
app=rep(app,favorites,favorites+'\n'+added,'fixed core subscription and migration start');
const saved=" const savedDemoIds=useMemo(()=>new Set(demoTickets.map(t=>t.scenarioId)),[demoTickets]);";
app=rep(app,saved,saved+
"\n const presentedScenarios=useMemo(()=>scenarios.filter(x=>favorites.includes(x.symbol)||savedDemoIds.has(x.id)),[scenarios,favorites,savedDemoIds]);",
'personal scenario display separate from core research');

const oldRecon=" useEffect(()=>{setLearning(prev=>reconcileLearning(prev,scenarios,assets,Date.now(),marketPulse));},[scenarios]);";
const newRecon=[
" useEffect(()=>{",
"  const t=Date.now();",
"  const fixed=CORE_SYMBOLS.map(s=>cache.current[s]).filter((a):a is AssetState=>Boolean(a));",
"  const quality=Object.fromEntries(fixed.map(a=>[a.symbol,inspectDataHealth(a,t)]));",
"  const pulse=summarizePulse(fixed,quality,t);",
"  setLearning(prev=>reconcileLearning(prev,scenarios,cache.current,t,pulse,coreSince));",
" },[scenarios]);"
].join('\n');
app=rep(app,oldRecon,newRecon,'independent pulse on scenario creation');
const oldFreeze=" useEffect(()=>{setLearning(prev=>freezePulseHoldout(prev,Date.now()));},[learning]);";
const newFreeze=[
" useEffect(()=>{setLearning(prev=>{",
"  if(prev.corePulseHoldout)return prev;",
"  const frozen=freezePulseHoldout(coreLearning(prev),Date.now()).pulseHoldout;",
"  return frozen?{...prev,corePulseHoldout:frozen}:prev;",
" });},[learning]);"
].join('\n');
app=rep(app,oldFreeze,newFreeze,'holdout frozen only for independent cohort');
app=rep(app,'if(favorites.includes(asset.symbol)){',
'if(isCoreSymbol(asset.symbol)||favorites.includes(asset.symbol)){','automatic paper scenarios from all fixed research symbols');
app=rep(app,'if(emit){\n     for(const frame of FRAMES){',
'if(emit&&favorites.includes(asset.symbol)){\n     for(const frame of FRAMES){',
'raw confirmation history stays personal');
app=rep(app,'cache.current=Object.fromEntries(favorites.map(s=>[s,cache.current[s]||fresh(s)]));',
'cache.current=Object.fromEntries(monitoredSymbols.map(s=>[s,cache.current[s]||fresh(s)]));',
'retain fixed core cache');
app=rep(app,"if(!favorites.length){setConnection('Добавьте активы в избранное');return;}",
"if(!monitoredSymbols.length){setConnection('Нет доступных активов');return;}",
'start invisible core even when favorites empty');
app=rep(app,'   void reload(favorites);\n   feed.start(favorites);',
'   void reload(monitoredSymbols);\n   feed.start(monitoredSymbols);','core loads and websocket');
app=rep(app,'void reload(favorites,false);},5*60_000)',
'void reload(monitoredSymbols,false);},5*60_000)','core refresh interval');
app=rep(app,'const openGroups=groupedOpen(scenarios);','const openGroups=groupedOpen(presentedScenarios);',
'hide research-only scenarios in personal Signals');
app=rep(app,'{scenarios.length?<div className="space-y-3">','{presentedScenarios.length?<div className="space-y-3">',
'personal Signals empty state');
app=rep(app,"{scenarios.filter(s=>s.status!=='PENDING'&&s.status!=='ACTIVE').map(x=>",
"{presentedScenarios.filter(s=>s.status!=='PENDING'&&s.status!=='ACTIVE').map(x=>",
'personal archived forecast list');
const oldStats=" const stats=useMemo(()=>scenarioStats(scenarios),[scenarios]);";
const newStats=[
" const coreScenarios=useMemo(()=>scenarios.filter(s=>s.createdAt>=coreSince&&isCoreSymbol(s.symbol)),[scenarios,coreSince]);",
" const stats=useMemo(()=>scenarioStats(coreScenarios),[coreScenarios]);",
" const signalStats=useMemo(()=>scenarioStats(presentedScenarios),[presentedScenarios]);",
" const independentLedger=useMemo(()=>coreLearning(learning),[learning]);"
].join('\n');
app=rep(app,oldStats,newStats,'cohort statistics and private summary');
app=rep(app,"const learningReport=useMemo(()=>learningOverview(learning),[learning]);",
"const learningReport=useMemo(()=>learningOverview(independentLedger),[independentLedger]);",'independent Learning stats');
app=rep(app,"const contextStats=useMemo(()=>analyzeContext(learning),[learning]);",
"const contextStats=useMemo(()=>analyzeContext(independentLedger),[independentLedger]);",'independent market context');
app=rep(app,"const temporalStats=useMemo(()=>temporalReport(learning),[learning]);",
"const temporalStats=useMemo(()=>temporalReport(independentLedger),[independentLedger]);",'independent weekly validation');
app=rep(app,"const pulseHoldoutStats=useMemo(()=>pulseHoldoutReport(learning),[learning]);",
"const pulseHoldoutStats=useMemo(()=>pulseHoldoutReport(independentLedger),[independentLedger]);",'independent future validation');
app=rep(app,"const postmortemReport=useMemo(()=>analyzePostmortem(learning),[learning]);",
"const postmortemReport=useMemo(()=>analyzePostmortem(independentLedger),[independentLedger]);",'independent postmortem');
app=rep(app,'Ожидают: {stats.pending} · Активны: {stats.active}. Ниже',
'Ожидают: {signalStats.pending} · Активны: {signalStats.active}. Ниже',
'private forecast status counters');
app=rep(app,'<p className="text-xs text-slate-400">Демо-журнал ведётся отдельно и не выбирает прогнозы для статистики APEX. Текущий Market Pulse наблюдает за избранными активами, а не за всем крипторынком.</p>',
[
'<section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-2">',
'<strong className="text-sm text-emerald-200">Независимая выборка · CORE v1</strong>',
'<p className="text-xs text-slate-300">Постоянные активы: BTC, ETH, SOL, BNB, XRP (USDT). Создано {independentLedger.records.length} исследовательских сценариев. Изменения избранного и ручной демо-журнал не выбирают данные для этих исследований.</p>',
'<p className="text-[11px] text-slate-400">Сбор только с {new Date(coreSince).toLocaleString("ru-RU")}. Ранее накопленные записи не удалены, но не смешиваются с новой выборкой. Для непрерывного сбора при закрытом приложении нужен отдельный фоновой исследовательский сервис; сейчас CORE получает живые данные при работе приложения.</p>',
'</section>'
].join('\n'),'new fixed-cohort summary');
app=rep(app,"APEX Research · проверка закономерностей","APEX Research · историческое исследование",
'legacy research study transparency');
app=rep(app,'<strong className="text-sm text-cyan-200">Market Pulse × Learning</strong>',
'<strong className="text-sm text-cyan-200">Market Pulse × Learning · CORE</strong>',
'core context heading');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 4.0','РЫНОЧНЫЙ РАДАР • 4.1','version');
write('src/App.tsx',app);

let vault=read('src/radar/vault.ts');
vault=rep(vault,
" if(typeof r.reason!=='string'||r.reason.length>8000)return false;",
" if(typeof r.reason!=='string'||r.reason.length>8000)return false;\n if(r.cohort!==undefined&&r.cohort!=='fixed-core-v1')return false;\n if(r.marketContext!==undefined&&isObj(r.marketContext)&&r.marketContext.source!==undefined&&r.marketContext.source!=='fixed-core-v1')return false;",
'validate source provenance');
vault=rep(vault,'(x.pulseHoldout!==undefined&&!validPulseFreeze(x.pulseHoldout)))return false;',
'(x.pulseHoldout!==undefined&&!validPulseFreeze(x.pulseHoldout))||\n  (x.corePulseHoldout!==undefined&&!validPulseFreeze(x.corePulseHoldout)))return false;',
'validate separate frozen core holdout');
vault=rep(vault,
'volumeRatio:snapshot.volumeRatio,createdAt:a.createdAt,marketContext:a.marketContext||b.marketContext};',
'volumeRatio:snapshot.volumeRatio,createdAt:a.createdAt,marketContext:a.marketContext||b.marketContext,\n  cohort:a.cohort||b.cohort};',
'preserve source cohort on restore');
vault=rep(vault,'const incoming=backup.payload;',
[
'const incoming=backup.payload;',
' if(current.corePulseHoldout&&incoming.learning.corePulseHoldout&&',
'  JSON.stringify(current.corePulseHoldout)!==JSON.stringify(incoming.learning.corePulseHoldout))',
"  throw Error('Несовместимые независимые проверки нельзя объединить автоматически.');"
].join('\n'),'separate core freeze merge conflict guard');
vault=rep(vault,
'...(current.pulseHoldout||incoming.learning.pulseHoldout?{pulseHoldout:current.pulseHoldout||incoming.learning.pulseHoldout}:{})},study:',
'...(current.pulseHoldout||incoming.learning.pulseHoldout?{pulseHoldout:current.pulseHoldout||incoming.learning.pulseHoldout}:{}),...(current.corePulseHoldout||incoming.learning.corePulseHoldout?{corePulseHoldout:current.corePulseHoldout||incoming.learning.corePulseHoldout}:{})},study:',
'preserve independent frozen study in backup');
write('src/radar/vault.ts',vault);

const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-core-v41.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 4.1 Independent Research Core\n- Fixed universe BTCUSDT/ETHUSDT/SOLUSDT/BNBUSDT/XRPUSDT is monitored while app is active, regardless of personal favorites.\n- New research records use a stable migration timestamp and fixed-core-v1 cohort tag; old favorites-driven studies remain archived and are never relabeled/backfilled.\n- Personal Signals and notifications remain scoped to favorites/demos; new independent research is counted separately in Statistics.\n- Market Pulse snapshots for new cohort come from fixed tracked assets, never favorites; missing stays missing. Separate future holdout is persisted in the Learning ledger and vault backup.\n- Native background research for core symbols while app is fully closed is NOT guaranteed by this version.\n');
console.log('APEX 4.1 fixed cohort independent of favorites integrated');
