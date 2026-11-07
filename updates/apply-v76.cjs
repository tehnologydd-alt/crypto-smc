/** APEX 7.6 — selected 1–4 favorites + one/both venues, rolling latest-64 checkpoints.
 * Only the generated source is patched. All existing DEMO ledgers and one-time
 * forward protocols persist without restart or backfill.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.6 '+label+' matches='+n);return s.replace(a,b);}
function re(s,pattern,out,label){
 const m=[...s.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:'g'+pattern.flags))];
 if(m.length!==1)throw Error('APEX 7.6 '+label+' matches='+m.length);
 return s.replace(m[0][0],out);
}
for(const f of ['v76-scope-demo.ts','v76-rolling-checkpoints.ts'])fs.copyFileSync('updates/'+f,'src/radar/'+f);
fs.copyFileSync('updates/test-v76-selected.cjs','scripts/test-v76-selected.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {demoProfitBreakdown} from './radar/v75-demo-profit';",
 "import {demoProfitBreakdown} from './radar/v75-demo-profit';\nimport {restoreSelectedFavorites,chosenFavorites,toggleFavoriteChoice,restoreDemoVenue,chosenVenues,chosenMonitorKeys,plansForChosenVenues,enrollChosenDemoPlans,chosenFeedRows,type DemoVenueChoice} from './radar/v76-scope-demo';\nimport {restoreRollingArchive,rollingSnapshots,addRollingCheckpoint,autoRollingCheckpoint,type ROLLING_MAX} from './radar/v76-rolling-checkpoints';",
 'imports');
app=rep(app,
 " const [favoriteRound,setFavoriteRound]=useState(0);",
 " const [favoriteRound,setFavoriteRound]=useState(0);\n const [favoriteChoice,setFavoriteChoice]=useState<string[]|null>(()=>restoreSelectedFavorites(localStorage.getItem('apex_v76_selected_favorites')));\n const [demoVenueMode,setDemoVenueMode]=useState<DemoVenueChoice>(()=>restoreDemoVenue(localStorage.getItem('apex_v76_demo_venues'),localStorage.getItem('apex_v64_futures_source')==='bybit'?'bybit':'binance'));",
 'state for favorites and venues');
app=rep(app,
 " const [checkpointContinuation,setCheckpointContinuation]=useState<ContinuationArchive>(()=>restoreContinuation(localStorage.getItem('apex_v75_checkpoint_continuation'),restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now()),Date.now()));",
 " const [checkpointContinuation,setCheckpointContinuation]=useState<ContinuationArchive>(()=>restoreContinuation(localStorage.getItem('apex_v75_checkpoint_continuation'),restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now()),Date.now()));\n const [rollingArchive,setRollingArchive]=useState<CheckpointArchive>(()=>{\n  const legacy=restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now());\n  const continuation=restoreContinuation(localStorage.getItem('apex_v75_checkpoint_continuation'),legacy,Date.now());\n  return restoreRollingArchive(localStorage.getItem('apex_v76_rolling_checkpoints'),legacy,continuation,Date.now());\n });",
 'rolling snapshots initialize from previous archives');
app=rep(app,
 " const futuresFavorites=useMemo(()=>futuresFavoriteUniverse(favorites),[favorites]);",
 " const futuresFavorites=useMemo(()=>futuresFavoriteUniverse(favorites),[favorites]);\n const selectedDemoFavorites=useMemo(()=>chosenFavorites(futuresFavorites,favoriteChoice),[futuresFavorites,favoriteChoice]);",
 'intersection with current favorites');
app=re(app,/ const futuresObserveKeys=useMemo\(\(\)=>favoritesObserveKeys\([\s\S]*?\);\n const futuresObserveKey=/,
 [
 " const futuresObserveKeys=useMemo(()=>chosenMonitorKeys(demoVenueMode,futuresFrame,",
 "  futuresExchange,futuresSymbol,selectedDemoFavorites,favoriteRound,",
 "  futuresMode==='auto'&&futuresScope==='multi',view==='assistant'&&!showLegacySpotArchive,futuresLedger),",
 "  [demoVenueMode,futuresFrame,futuresExchange,futuresSymbol,selectedDemoFavorites,favoriteRound,futuresMode,futuresScope,view,showLegacySpotArchive,futuresLedger]);",
 " const futuresObserveKey="
 ].join('\n'),'dual venue source-specific observation keys');
app=rep(app,
 " const futuresMultiPlans=useMemo(()=>deriveFavoritePlans(futuresExchange,futuresFrame,futuresFavorites,favoriteRound,futuresBars,now),[futuresExchange,futuresFrame,futuresFavorites,favoriteRound,futuresBars,now]);\n const favoriteFeed=useMemo(()=>favoriteFeedOverview(futuresExchange,futuresFrame,futuresFavorites,futuresBars,futuresLedger,now),[futuresExchange,futuresFrame,futuresFavorites,futuresBars,futuresLedger,now]);",
 " const futuresMultiPlans=useMemo(()=>plansForChosenVenues(demoVenueMode,futuresFrame,selectedDemoFavorites,futuresBars,now),[demoVenueMode,futuresFrame,selectedDemoFavorites,futuresBars,now]);\n const selectedFeed=useMemo(()=>chosenFeedRows(demoVenueMode,futuresFrame,selectedDemoFavorites,futuresBars,futuresLedger,now),[demoVenueMode,futuresFrame,selectedDemoFavorites,futuresBars,futuresLedger,now]);",
 'plan creation and status per selected source');
app=rep(app,
 "  setFuturesLedger(prev=>enrollMultiDemoPlans(prev,futuresMultiPlans,futuresSetup,Date.now()));",
 "  setFuturesLedger(prev=>enrollChosenDemoPlans(prev,futuresMultiPlans,futuresSetup,Date.now()));",
 'independent simulated venue enrollment');
app=rep(app,
 " }catch{}},[futuresScope,autoStudyCheckpoints]);",
 " }catch{}},[futuresScope,autoStudyCheckpoints]);\n useEffect(()=>{try{\n  if(favoriteChoice!==null)localStorage.setItem('apex_v76_selected_favorites',JSON.stringify(favoriteChoice));\n  localStorage.setItem('apex_v76_demo_venues',demoVenueMode);\n }catch{setFuturesMessage('Не удалось сохранить список избранных пар или выбор биржи.');}},[favoriteChoice,demoVenueMode]);",
 'persist user selection without rewriting favorites');
app=rep(app,read('updates/v75-favorites-ui.txt'),read('updates/v76-multi-choice-ui.txt'),'replace all favorites with pick-four UI');
app=re(app,/ const studySnapshots=useMemo\(\(\)=>combinedCheckpoints\([\s\S]*?\n \};/,
 [
 " const studySnapshots=useMemo(()=>rollingSnapshots(rollingArchive,studyProtocol),[rollingArchive,studyProtocol]);",
 " const commitRolling=(next:CheckpointArchive)=>{",
 "  if(next===rollingArchive)return false;",
 "  try{",
 "   localStorage.setItem('apex_v76_rolling_checkpoints',JSON.stringify(next));",
 "   setRollingArchive(next);",
 "   // User chose one rolling archive; remove OLD snapshot-only keys only",
 "   // after the new record is safely persisted. Do not touch study protocol.",
 "   localStorage.removeItem('apex_v67_study_checkpoints');",
 "   localStorage.removeItem('apex_v75_checkpoint_continuation');",
 "   return true;",
 "  }catch{setFuturesMessage('Не удалось сохранить контрольную точку. Предыдущая история не затронута.');return false;}",
 " };",
 " useEffect(()=>{",
 "  try{",
 "   const raw=localStorage.getItem('apex_v76_rolling_checkpoints');",
 "   if(raw!==JSON.stringify(rollingArchive))localStorage.setItem('apex_v76_rolling_checkpoints',JSON.stringify(rollingArchive));",
 "   localStorage.removeItem('apex_v67_study_checkpoints');",
 "   localStorage.removeItem('apex_v75_checkpoint_continuation');",
 "  }catch{setFuturesMessage('Не получилось перенести историю снимков. Старые ключи пока сохранены.');}",
 " },[rollingArchive]);"
 ].join('\n'),
 'replace multi-section checkpoint helpers with rolling history and safe migration');
app=re(app,/ useEffect\(\(\)=>\{\n  if\(!autoStudyCheckpoints\|\|!studyProtocol\)return;\n  const r=autoAppendCheckpoint\([\s\S]*?\},\[autoStudyCheckpoints,studyProtocol,studyCheckpointArchive,checkpointContinuation,forwardStudy,now\]\);/,
 [
 " useEffect(()=>{",
 "  if(!autoStudyCheckpoints||!studyProtocol)return;",
 "  const updated=autoRollingCheckpoint(rollingArchive,studyProtocol,forwardStudy,true,now);",
 "  if(updated!==rollingArchive)commitRolling(updated);",
 " },[autoStudyCheckpoints,studyProtocol,rollingArchive,forwardStudy,now]);"
 ].join('\n'),'rolling auto-checkpoints');
app=rep(app,
 '<span className="text-[10px] text-slate-400">Всего: {studySnapshots.length} · разделов: {1+checkpointContinuation.segments.length}</span>',
 '<span className="text-[10px] text-slate-400">{studySnapshots.length}/64 · последние снимки</span>',
 '64 rolling count display');
app=re(app,/   <button type="button" onClick=\{\(\)=>\{\n    if\(!studyProtocol\)return;\n    try\{\n     const r=appendCheckpoint\([\s\S]*?\}\} className=/,
 [
 '   <button type="button" onClick={()=>{',
 '    if(!studyProtocol)return;',
 '    try{',
 '     const updated=addRollingCheckpoint(rollingArchive,studyProtocol,forwardStudy,Date.now());',
 "     if(updated===rollingArchive){setFuturesMessage('Новый снимок невозможен: время или протокол не изменились.');return;}",
 "     if(commitRolling(updated))setFuturesMessage('Сохранена контрольная точка. При заполнении 64 удаляется только самая старая.');",
 "    }catch(e){setFuturesMessage('Ошибка контрольной точки: '+String(e));}",
 '   }} className='
 ].join('\n'),'manual checkpoints overwrite only oldest');
app=rep(app,
 'После 64 точек начинается новый раздел архива, старые остаются нетронутыми.',
 'Когда накопится 64 снимка, следующий заменит самый старый. Остаются только последние 64; сам протокол и журнал DEMO не удаляются.',
 'latest-64 notice');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.5','РЫНОЧНЫЙ РАДАР • 7.6','display version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;let script=read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.5','РЫНОЧНЫЙ РАДАР • 7.6');
 if(f==='test-v74-reliability.cjs'||f==='test-v75-research.cjs'){
  script=script.replaceAll("'Все избранные · DEMO'","'Мульти · избранные'")
    .replaceAll("'favoriteFeed'","'selectedFeed'");
 }
 write(p,script);
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v76-selected.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.6 — user-selected favorite-four and single/both public venues; rolling 64 snapshots\n- MULTI Futures DEMO now lets users choose 1–4 from current Radar USDT favorites and select Binance only / Bybit only / BOTH. A source-qualified watch requests actual public candles independently per market (normally max eight distinct asset-venue keys); active paper-ticket keys remain prioritized. An otherwise selected symbol without futures market data has no simulated plan. No real order submission or account connections.\n- Saved user preferences are restored, while historic virtual tickets keep their exchange/symbol; original study protocol and archived hypotheses are untouched. Single-symbol mode retains the previous exchange selector behavior.\n- Migration combines valid APEX 6.7 and 7.5 snapshot sections, retains most recent 64 in apex_v76_rolling_checkpoints, then removes previous snapshot storage keys ONLY after new localStorage serialization succeeds. After the 64th, oldest checkpoint is dropped from the rolling list; new one appended. If storage rejects the write, no in-memory or stored snapshots are deleted. Neither protocol nor virtual position archive is affected.\n');
console.log('APEX 7.6 selected favorites, venue selection and circular 64 checkpoints installed');
