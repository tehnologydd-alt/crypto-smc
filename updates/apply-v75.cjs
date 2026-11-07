/** APEX 7.5: favorites-driven DEMO observation, checkpoint continuation, outcome accounting.
 * Restore/keep legacy v7.4 settings without adding real orders or private endpoints.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.5 '+label+' matches='+n);return s.replace(a,b);}
function re(s,replacementPattern,out,label){const all=[...s.matchAll(new RegExp(replacementPattern.source,replacementPattern.flags.includes('g')?replacementPattern.flags:'g'+replacementPattern.flags))];if(all.length!==1)throw Error('APEX 7.5 '+label+' matches='+all.length);return s.replace(all[0][0],out);}
for(const f of ['v75-favorites-research.ts','v75-checkpoint-continuation.ts','v75-demo-profit.ts'])
 fs.copyFileSync('updates/'+f,'src/radar/'+f);
fs.copyFileSync('updates/test-v75-research.cjs','scripts/test-v75-research.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {autoCheckpointIfDue} from './radar/v74-auto-checkpoints';",
 "import {autoCheckpointIfDue} from './radar/v74-auto-checkpoints';\nimport {futuresFavoriteUniverse,favoritesObserveKeys,deriveFavoritePlans,favoriteBatch,favoriteFeedOverview,normalizeFavoriteSymbol} from './radar/v75-favorites-research';\nimport {restoreContinuation,combinedCheckpoints,appendCheckpoint,autoAppendCheckpoint,type AppendResult,type ContinuationArchive} from './radar/v75-checkpoint-continuation';\nimport {demoProfitBreakdown} from './radar/v75-demo-profit';",
 'imports');
app=rep(app,
 "import {restoreDemoSymbols,toggleDemoSymbol,multiDemoKeys,deriveMultiDemoPlans,enrollMultiDemoPlans,FUTURES_DEMO_SYMBOLS,MAX_MULTI_SYMBOLS,type FuturesScope} from './radar/v74-multi-demo';",
 "import {enrollMultiDemoPlans,type FuturesScope} from './radar/v74-multi-demo';",
 'remove fixed-list imports');
app=rep(app,
 " const [multiDemoSymbols,setMultiDemoSymbols]=useState<string[]>(()=>restoreDemoSymbols(localStorage.getItem('apex_v74_multi_symbols')));",
 " const [favoriteRound,setFavoriteRound]=useState(0);\n const [demoFeeBps,setDemoFeeBps]=useState<0|5|10>(5);",
 'favorite rotating scan and educational cost scenario');
app=rep(app,
 " const [futuresSymbol,setFuturesSymbol]=useState(()=>localStorage.getItem('apex_v64_futures_symbol')||'BTCUSDT');",
 " const [futuresSymbol,setFuturesSymbol]=useState(()=>normalizeFavoriteSymbol(localStorage.getItem('apex_v64_futures_symbol'))||'BTCUSDT');",
 'TON -> GRAM for NEW selected observations');
app=rep(app,
 " const [studyCheckpointArchive,setStudyCheckpointArchive]=useState<CheckpointArchive>(()=>restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now()));",
 " const [studyCheckpointArchive,setStudyCheckpointArchive]=useState<CheckpointArchive>(()=>restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now()));\n const [checkpointContinuation,setCheckpointContinuation]=useState<ContinuationArchive>(()=>restoreContinuation(localStorage.getItem('apex_v75_checkpoint_continuation'),restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now()),Date.now()));",
 'append-only additional checkpoint segments');
app=rep(app,
 " const futuresSelectedKey=futuresExchange+':'+futuresSymbol+':'+futuresFrame;",
 " const futuresSelectedKey=futuresExchange+':'+futuresSymbol+':'+futuresFrame;\n const futuresFavorites=useMemo(()=>futuresFavoriteUniverse(favorites),[favorites]);\n useEffect(()=>{if(futuresScope!=='multi'||futuresMode!=='auto')return;\n  const interval=setInterval(()=>{if(!document.hidden)setFavoriteRound(i=>i+1);},75000);\n  return ()=>clearInterval(interval);\n },[futuresScope,futuresMode]);",
 'normalized rotating watch of user favorites');
app=re(app,/ const futuresObserveKeys=useMemo\(\(\)=>multiDemoKeys\([\s\S]*?\);\n const futuresObserveKey=/,
 [
 " const futuresObserveKeys=useMemo(()=>favoritesObserveKeys(futuresExchange,futuresFrame,",
 "  futuresSymbol,futuresFavorites,favoriteRound,futuresMode==='auto'&&futuresScope==='multi',",
 "  view==='assistant'&&!showLegacySpotArchive,futuresLedger),",
 "  [futuresExchange,futuresFrame,futuresSymbol,futuresFavorites,favoriteRound,futuresMode,futuresScope,view,showLegacySpotArchive,futuresLedger]);",
 " const futuresObserveKey="
 ].join('\n'),
 'observe selected favorites across rotations');
app=rep(app,
 " const futuresMultiPlans=useMemo(()=>deriveMultiDemoPlans(futuresExchange,futuresFrame,multiDemoSymbols,futuresBars,now),[futuresExchange,futuresFrame,multiDemoSymbols,futuresBars,now]);",
 " const futuresMultiPlans=useMemo(()=>deriveFavoritePlans(futuresExchange,futuresFrame,futuresFavorites,favoriteRound,futuresBars,now),[futuresExchange,futuresFrame,futuresFavorites,favoriteRound,futuresBars,now]);\n const favoriteFeed=useMemo(()=>favoriteFeedOverview(futuresExchange,futuresFrame,futuresFavorites,futuresBars,futuresLedger,now),[futuresExchange,futuresFrame,futuresFavorites,futuresBars,futuresLedger,now]);",
 'favorites-derived proposals and truthful no-setup diagnostics');
app=rep(app,
 "  localStorage.setItem('apex_v74_multi_symbols',JSON.stringify(multiDemoSymbols));\n",
 "",
 'leave old saved multi selection untouched (legacy)');
app=rep(app,
 " }catch{}},[futuresScope,multiDemoSymbols,autoStudyCheckpoints]);",
 " }catch{}},[futuresScope,autoStudyCheckpoints]);",
 'persist only current multi/futures scope');
app=rep(app,read('updates/v74-multi-scope-ui.txt'),read('updates/v75-favorites-ui.txt'),'favorites not fixed list UI');
app=rep(app,
 "{[...new Set(['BTCUSDT','ETHUSDT',...favorites.filter(s=>s.endsWith('USDT'))])].slice(0,70).map(s=><option key={s} value={s}>{s}</option>)}",
 "{[...new Set(['BTCUSDT','ETHUSDT','GRAMUSDT',futuresSymbol,...futuresFavorites])].filter(Boolean).slice(0,90).map(s=><option key={s} value={s}>{s}</option>)}",
 'GRAM in single-pair selector & any favorites');
app=rep(app,
 " const studySnapshots=useMemo(()=>checkpointsForProtocol(studyCheckpointArchive,studyProtocol),[studyCheckpointArchive,studyProtocol]);",
 " const studySnapshots=useMemo(()=>combinedCheckpoints(studyCheckpointArchive,checkpointContinuation,studyProtocol),[studyCheckpointArchive,checkpointContinuation,studyProtocol]);\n const commitCheckpoint=(r:AppendResult)=>{\n  if(!r.written)return false;\n  try{\n   if(r.written==='legacy')localStorage.setItem('apex_v67_study_checkpoints',JSON.stringify(r.legacy));\n   else localStorage.setItem('apex_v75_checkpoint_continuation',JSON.stringify(r.continuation));\n   if(r.written==='legacy')setStudyCheckpointArchive(r.legacy);\n   else setCheckpointContinuation(r.continuation);\n   return true;\n  }catch{setFuturesMessage('Недостаточно места для новой контрольной точки. Существующая история не изменена.');return false;}\n };",
 'legacy and continuation checkpoints in one display');
app=re(app,/ useEffect\(\(\)=>\{\n  if\(!autoStudyCheckpoints\|\|!studyProtocol\)return;[\s\S]*?\},\[autoStudyCheckpoints,studyProtocol,studyCheckpointArchive,forwardStudy,now\]\);/,
 [
 " useEffect(()=>{",
 "  if(!autoStudyCheckpoints||!studyProtocol)return;",
 "  const r=autoAppendCheckpoint(studyCheckpointArchive,checkpointContinuation,studyProtocol,forwardStudy,true,now);",
 "  if(r.written)commitCheckpoint(r);",
 " },[autoStudyCheckpoints,studyProtocol,studyCheckpointArchive,checkpointContinuation,forwardStudy,now]);"
 ].join('\n'),
 'auto snapshots can continue into extra immutable segments');
app=rep(app,
 '<span className="text-[10px] text-slate-400">{studySnapshots.length}/64</span>',
 '<span className="text-[10px] text-slate-400">Всего: {studySnapshots.length} · разделов: {1+checkpointContinuation.segments.length}</span>',
 'replace hard cap with total count and segments');
app=re(app,/   <button type="button" disabled=\{studySnapshots.length>=64\} onClick=\{\(\)=>\{[\s\S]*?\}\} className=/,
 [
 '   <button type="button" onClick={()=>{',
 '    if(!studyProtocol)return;',
 '    try{',
 '     const r=appendCheckpoint(studyCheckpointArchive,checkpointContinuation,studyProtocol,forwardStudy,Date.now());',
 "     if(!r.written){setFuturesMessage('Контрольная точка не создана: нет нового времени или протокол не совпадает.');return;}",
 "     if(commitCheckpoint(r))setFuturesMessage('Контрольная точка сохранена. Старые разделы архива не изменены.');",
 "    }catch(e){setFuturesMessage('Ошибка контрольной точки: '+String(e));}",
 '   }} className='
 ].join('\n'),
 'manual checkpoint button has no 64 barrier');
app=rep(app,
 'При включённой автоматике APEX сохраняет снимок после первой оценки, каждых 5 новых оценённых сценариев или спустя 24 часа, если появился новый результат.',
 'При включённой автоматике APEX сохраняет снимок после первой оценки, каждых 5 новых оценённых сценариев или спустя 24 часа, если появился новый результат. После 64 точек начинается новый раздел архива, старые остаются нетронутыми.',
 'checkpoint continuation explained');
app=rep(app,
 " const studySensitivity=useMemo(()=>studyCostSensitivity(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);",
 " const studySensitivity=useMemo(()=>studyCostSensitivity(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);\n const studyProfit=useMemo(()=>demoProfitBreakdown(studyProtocol,futuresLedger,demoFeeBps,now),[studyProtocol,futuresLedger,demoFeeBps,now]);",
 'positive and negative virtual accounting');
const marker='Как условные комиссии меняют результат';
const i=app.indexOf(marker),start=i<0?-1:app.lastIndexOf('<section className="rounded-2xl',i);
if(start<0||i-start>400)throw Error('APEX 7.5 cannot locate hypothetical-fee panel');
app=app.slice(0,start)+read('updates/v75-demo-profit-ui.txt')+'\n '+app.slice(start);
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.4','РЫНОЧНЫЙ РАДАР • 7.5','version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 7.4','РЫНОЧНЫЙ РАДАР • 7.5'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v75-research.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.5 — Radar favorites, GRAM, append-only checkpoints, readable DEMO positive/negative outcomes\n- Futures DEMO multi scope now draws its USDT universe from actual Radar favorites (not the old eight hardcoded symbols), normalizing obsolete TONUSDT to GRAMUSDT **only for new observations**; old tickets/protocol remain unchanged. Favorites over four are scanned in bounded rotating rounds every 75 seconds when the Android web view remains active. A specific pair can show no quote or no fresh hypothetical setup, not a fabricated signal. Historical outcomes never get modified by the rename.\n- After 64 immutable checkpoint snapshots, new append-only continuation segments allow further checkpoints without deleting the previous 64. The legacy localStorage key is kept. If local storage quota runs out, the app reports failure rather than deleting snapshots; the protocol and all existing snapshots continue to be usable.\n- Separate educational summaries for positive gross outcomes, negative gross outcomes and illustrative post-commission results at 0/5/10 hypothetical basis points per side, per Futures exchange and combined. Not real account PnL, includes no slippage/funding/liquidation, no real orders or external trading credentials.\n');
console.log('APEX 7.5 favorite-driven DEMO scanning, checkpoint continuation and transparent virtual PnL overlay installed');
