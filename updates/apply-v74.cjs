/** APEX 7.4: bounded DEMO multi-pair monitoring and automatic checkpoints.
 * All existing archives and the frozen protocol remain unmodified.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.4 '+label+' matches='+n);return s.replace(a,b);}
function repMatch(s,re,b,label){const a=s.match(re);if(!a||a.length!==1)throw Error('APEX 7.4 '+label+' anchor not found');return rep(s,a[0],b,label);}
for(const f of ['v74-multi-demo.ts','v74-auto-checkpoints.ts'])fs.copyFileSync('updates/'+f,'src/radar/'+f);
fs.copyFileSync('updates/test-v74-reliability.cjs','scripts/test-v74-reliability.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {explainResearchQuestion,MENTOR_SUGGESTIONS,type MentorReply,type MentorContext} from './radar/v73-research-mentor';",
 "import {explainResearchQuestion,MENTOR_SUGGESTIONS,type MentorReply,type MentorContext} from './radar/v73-research-mentor';\nimport {restoreDemoSymbols,toggleDemoSymbol,multiDemoKeys,deriveMultiDemoPlans,enrollMultiDemoPlans,FUTURES_DEMO_SYMBOLS,MAX_MULTI_SYMBOLS,type FuturesScope} from './radar/v74-multi-demo';\nimport {autoCheckpointIfDue} from './radar/v74-auto-checkpoints';",
 'v74 imports');
app=rep(app,
 " const [futuresBars,setFuturesBars]=useState<Record<string,FutureBar[]>>({});",
 " const [futuresBars,setFuturesBars]=useState<Record<string,FutureBar[]>>({});\n const [futuresScope,setFuturesScope]=useState<FuturesScope>(()=>localStorage.getItem('apex_v74_futures_scope')==='multi'?'multi':'single');\n const [multiDemoSymbols,setMultiDemoSymbols]=useState<string[]>(()=>restoreDemoSymbols(localStorage.getItem('apex_v74_multi_symbols')));\n const [autoStudyCheckpoints,setAutoStudyCheckpoints]=useState(()=>localStorage.getItem('apex_v74_auto_checkpoints')!=='0');",
 'new persisted scope and snapshot preference');
const newWatch=[
 " const futuresObserveKeys=useMemo(()=>multiDemoKeys(futuresExchange,futuresFrame,futuresScope,",
 "  futuresSymbol,multiDemoSymbols,futuresMode==='auto',view==='assistant'&&!showLegacySpotArchive,futuresLedger),",
 "  [futuresExchange,futuresFrame,futuresScope,futuresSymbol,multiDemoSymbols,futuresMode,view,showLegacySpotArchive,futuresLedger]);"
].join('\n');
app=repMatch(app,/ const futuresObserveKeys=useMemo\(\(\)=>\{[\s\S]*?\},\[futuresSelectedKey,futuresLedger,view,showLegacySpotArchive\]\);/,newWatch,'multi-source public candle keys');
app=rep(app,
 " const futuresExisting=Boolean(futuresStudyPlan&&futuresLedger.tickets.some(o=>o.id===futuresStudyPlan.id));",
 " const futuresExisting=Boolean(futuresStudyPlan&&futuresLedger.tickets.some(o=>o.id===futuresStudyPlan.id));\n const futuresMultiPlans=useMemo(()=>deriveMultiDemoPlans(futuresExchange,futuresFrame,multiDemoSymbols,futuresBars,now),[futuresExchange,futuresFrame,multiDemoSymbols,futuresBars,now]);",
 'separate prospective plan per pair');
const newAuto=[
 " useEffect(()=>{",
 "  if(futuresMode!=='auto'||futuresScope!=='single'||!futuresStudyPlan||futuresStudyPlan.expiresAt<=Date.now())return;",
 "  setFuturesLedger(prev=>enrollFutureTicket(prev,futuresStudyPlan,futuresSetup,'auto',Date.now()));",
 " },[futuresMode,futuresScope,futuresStudyPlan,futuresSetup]);",
 " useEffect(()=>{",
 "  if(futuresMode!=='auto'||futuresScope!=='multi'||futuresMultiPlans.length===0)return;",
 "  setFuturesLedger(prev=>enrollMultiDemoPlans(prev,futuresMultiPlans,futuresSetup,Date.now()));",
 " },[futuresMode,futuresScope,futuresMultiPlans,futuresSetup]);",
 " useEffect(()=>{try{",
 "  localStorage.setItem('apex_v74_futures_scope',futuresScope);",
 "  localStorage.setItem('apex_v74_multi_symbols',JSON.stringify(multiDemoSymbols));",
 "  localStorage.setItem('apex_v74_auto_checkpoints',autoStudyCheckpoints?'1':'0');",
 " }catch{}},[futuresScope,multiDemoSymbols,autoStudyCheckpoints]);"
].join('\n');
app=repMatch(app,/ useEffect\(\(\)=>\{\n  if\(futuresMode!=='auto'\|\|!futuresStudyPlan\|\|futuresStudyPlan\.expiresAt<=Date\.now\(\)\)return;[\s\S]*?\},\[futuresMode,futuresStudyPlan,futuresSetup\]\);/,newAuto,'single vs multi auto DEMO effects');
const cpAnchor=" const studySnapshots=useMemo(()=>checkpointsForProtocol(studyCheckpointArchive,studyProtocol),[studyCheckpointArchive,studyProtocol]);";
const cpEffect=[
 " useEffect(()=>{",
 "  if(!autoStudyCheckpoints||!studyProtocol)return;",
 "  const next=autoCheckpointIfDue(studyCheckpointArchive,studyProtocol,forwardStudy,true,now);",
 "  if(next===studyCheckpointArchive)return;",
 "  try{",
 "   localStorage.setItem('apex_v67_study_checkpoints',JSON.stringify(next));",
 "   setStudyCheckpointArchive(next);",
 "  }catch{setFuturesMessage('Не удалось автоматически сохранить контрольную точку на устройстве.');}",
 " },[autoStudyCheckpoints,studyProtocol,studyCheckpointArchive,forwardStudy,now]);"
].join('\n');
app=rep(app,cpAnchor,cpAnchor+'\n'+cpEffect,'checkpoint automatic effect');
const heading='<h2 className="text-sm font-semibold text-white">Режимы виртуального ассистента</h2>';
app=rep(app,heading,heading+'\n'+read('updates/v74-multi-scope-ui.txt'),'multi select UI');
const cpText='<p className="text-[11px] leading-relaxed text-slate-400">Кнопка сохраняет снимок результатов на этот момент. Протокол не перезапускается, старые контрольные точки не изменяются. Можно отмечать этапы наблюдения вручную.</p>';
const cpChange=[
 '<p className="text-[11px] leading-relaxed text-slate-400">Контрольные точки не перезапускают проверку. При включённой автоматике APEX сохраняет снимок после первой оценки, каждых 5 новых оценённых сценариев или спустя 24 часа, если появился новый результат. Существующие и ручные снимки не изменяются.</p>',
 '   <button type="button" role="switch" aria-checked={autoStudyCheckpoints} onClick={()=>setAutoStudyCheckpoints(value=>!value)}',
 "    className={'min-h-[42px] w-full rounded-lg border px-3 text-xs font-semibold '+(autoStudyCheckpoints?'border-emerald-400/35 bg-emerald-400/10 text-emerald-100':'border-slate-600 text-slate-300')}>",
 "    Автосохранение контрольных точек: {autoStudyCheckpoints?'ВКЛ':'ВЫКЛ'}",
 '   </button>',
 '   <p className="text-[10px] text-slate-500">Автоматические снимки создаются только во время работы приложения с доступными наблюдениями, а не по обещанному круглосуточному расписанию.</p>'
].join('\n');
app=rep(app,cpText,cpChange,'auto/manual checkpoint toggle');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.3','РЫНОЧНЫЙ РАДАР • 7.4','visible version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.3','РЫНОЧНЫЙ РАДАР • 7.4'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v74-reliability.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.4 — automatic checkpoints and bounded multi-pair Futures DEMO\n- Optional checkpoint automation starts enabled. It stores an immutable local study snapshot after first reviewable outcome, each +5 subsequent results or >=24 hours with >=1 new result. The original one-time protocol and existing manual snapshots remain untouched (64 max). Foreground/Android-active processing only: no uninterrupted futures monitoring claim.\n- Futures DEMO adds single-viewed-contract and multi-select (1–4 predefined USDT futures symbols) modes. In AUTO DEMO, each selected symbol receives a distinct PUBLIC CLOSED futures-candle watch, separately from the currently viewed symbol. Existing active virtual tickets are prioritized; <=10 combined keys and <=6 simultaneous DEMO orders, preserving old one-signal-one-ticket and per-source rules.\n- No real order execution, account API integration, private credentials, performance guarantees, historical backfill or changes to Spot/Futures ledgers, 7.0 hypothesis archive or 7.1–7.3 research reports.\n');
console.log('APEX 7.4 multi-pair paper research and automatic checkpoints installed');
