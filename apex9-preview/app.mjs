import {collectAsset,fetchSpotCatalog,fetchSpotTicker,normalizeSymbol} from './research.mjs';
import {collectContext,createBitcoinBackgroundGate} from './context-sources.mjs';
import {RELEASE_API,latestSignedRelease,updateStatus} from './update-check.mjs';
import {getMobileStatus,getMobileHistory,saveMobileSnapshot,setMobileSettings,getMobileCandles,saveMobileCandles,getMobileResearchForecasts,requestMobileForecastNotificationPermission} from './mobile-bridge.mjs';
import {fetchCandles,analyzeStructure} from './candles.mjs';
import {CandleChart} from './candle-chart.mjs';
import {analyzeMarketFrame,compareMarketFrames,MARKET_FRAMES} from './market-core.mjs';
import {initFavoriteResearch} from './favorite-dashboard.mjs';
import {initLiquidityDashboard} from './liquidity-dashboard.mjs';
import {initOnChainDashboard} from './onchain-dashboard.mjs';
import {initEvidenceDashboard} from './evidence-dashboard.mjs';
import {initValidationDashboard} from './validation-dashboard.mjs';
import {initResearchPatternsDashboard} from './research-patterns-dashboard.mjs';
import {initResearchRegimesDashboard} from './research-regimes-dashboard.mjs';
import {initCrossAssetDashboard} from './cross-asset-dashboard.mjs';
import {initResearchSynthesisDashboard} from './research-synthesis-dashboard.mjs';
import {planAssetExplanation,describeResearchQuality} from './research-quality-route.mjs';
import {workspaceArea,assetAreaForEntry,researchAreaForTarget,activeDock} from './research-workspace.mjs';
import {initEditorialDashboard} from './editorial-dashboard.mjs';
import {buildAssetNewsContext} from './asset-news-context.mjs';
import {initNewsM5Panel} from './news-m5-panel.mjs';
import {formatNewsCollectionAnalysis,analyzeNewsCollection} from './news-research-analysis.mjs';
import {sourceStatusLine} from './live-news-collection.mjs';
import {fetchBlueskyPosts} from './social-public.mjs';
import {discussionEvidence} from './discussion-evidence.mjs';
import {createEditorialBudget} from './editorial-budget.mjs';
import {createEventHistory} from './event-history.mjs';
import {initFreeSourceDashboard} from './free-source-dashboard.mjs';
import {initResearchLayersDashboard} from './research-layer-dashboard.mjs';
import {globalMarketSnapshot} from './market-overview.mjs';
import {initRadarDashboard} from './radar-dashboard.mjs';
import {buildScenarioMap} from './scenario-map.mjs';
import {buildScenarioReplay} from './scenario-replay.mjs';
import {directionalOutcomeLabel} from './directional-scenario.mjs';

const el=(id)=>document.getElementById(id);
const fmt=(value,digits=8)=>Number.isFinite(value)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(value):'—';
const time=(ms)=>Number.isFinite(ms)
 ?new Date(ms).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const layerNames={
 market:'Рыночная цена',liquidity:'Видимая ликвидность',onchain:'Ончейн',
 news:'Новости',social:'Публичные обсуждения',macro:'Макроэкономика',
 cross_asset:'Взаимосвязи активов'
};
const sourceNames={
 'binance-ticker':'Binance · Spot 24h',
 'binance-depth':'Binance · Spot order book',
 'bybit-depth':'Bybit · Spot order book'
};
const assessmentNames={
 INSUFFICIENT:'Недостаточно данных',MIXED:'Противоречивый контекст',
 UPWARD_CONTEXT:'Положительный исторический контекст',
 DOWNWARD_CONTEXT:'Отрицательный исторический контекст'
};
let chosen='BTCUSDT',current=null,controller=null,catalog=[],pending=0,lastLoad=0;
let fastTickerAt=0,fastTickerBusy=false;
try{chosen=normalizeSymbol(localStorage.getItem('apex9_preview_asset'))||chosen;}catch{}
el('asset-input').value=chosen;
el('asset-name').textContent=chosen;

function text(id,value){el(id).textContent=value;}
function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}
function create(tag,cls,value){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(value!==undefined)n.textContent=String(value);
 return n;
}
const installedBuildPromise=(async()=>{
 try{
  const response=await fetch('./apex-build-info.json',{cache:'no-store'});
  if(!response.ok)throw Error('No Android build information');
  const result=await response.json();
  if(result.appId!=='com.apexintelligence.research'||!Number.isSafeInteger(result.buildRun))
   throw Error('Unknown app build');
  text('installed-version',result.versionName+(result.signedRelease?' · подписанная':' · debug'));
  text('update-status',result.signedRelease
   ?'Подписанная сборка. Для проверки новых опубликованных версий нажмите кнопку ниже.'
   :'Тестовая debug-подпись. Для перехода на стабильные обновления требуется первая установка подписанного выпуска.');
  return result;
 }catch{
  text('installed-version','Веб-прототип');
  text('update-status','Проверка обновлений APK доступна в установленной Android-версии.');
  return null;
 }
})();
async function checkForUpdates(){
 const button=el('check-updates-button');
 const link=el('update-release-link');
 button.disabled=true;link.classList.add('hidden');
 text('update-status','Проверяем официальный GitHub на наличие подписанных обновлений…');
 try{
  const installed=await installedBuildPromise;
  const response=await fetch(RELEASE_API,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error(response.status===403?'GitHub ограничил частоту запросов':'GitHub HTTP '+response.status);
  const payload=await response.json();
  const latest=latestSignedRelease(payload);
  const result=updateStatus(installed,latest);
  text('update-status',result.message);
  if(latest&&(result.state==='UPDATE'||result.state==='REINSTALL_ONCE')){
   link.href=latest.page;
   link.classList.remove('hidden');
  }
 }catch(e){
  text('update-status','Не удалось проверить обновления: '+String(e?.message||e));
 }finally{
  button.disabled=false;
 }
}
el('check-updates-button').addEventListener('click',()=>void checkForUpdates());

let mobileReady=false;
async function refreshMobileStatus(){
 const data=await getMobileStatus();
 mobileReady=data.native===true;
 text('native-observation-count',mobileReady?fmt(data.observationCount,0):'—');
 text('native-forecast-count',mobileReady?fmt(data.forecastCount,0):'—');
 text('native-candle-count',mobileReady?fmt(data.candleCount,0):'—');
 const toggle=el('native-background-sync');
 toggle.disabled=!mobileReady;
 toggle.checked=mobileReady&&Boolean(data.backgroundSyncEnabled);
 const modalToggle=el('apex-settings-background');
 modalToggle.checked=toggle.checked;
 modalToggle.disabled=!mobileReady;
 for(const [id,field] of [
  ['apex-settings-alerts','forecastAlertsEnabled'],
  ['apex-settings-alert-limit','alertLimitReady'],
  ['apex-settings-alert-targets','alertTargets'],
  ['apex-settings-alert-stop','alertStop'],
  ['apex-settings-screen','keepScreenOn']
 ]){
  const input=el(id);
  input.checked=Boolean(data[field]);
  input.disabled=!mobileReady||(id.startsWith('apex-settings-alert-')&&
   !data.forecastAlertsEnabled);
 }
 text('apex-settings-alert-status',!mobileReady?
  'Оповещения доступны в Android APK.':
  !data.forecastAlertsEnabled?'Уведомления выключены.':
  !data.notificationPermissionGranted?
   'У Android нет разрешения на уведомления. Проверьте системные настройки.':
  data.backgroundSyncEnabled?
   'Новые M5-события отслеживаются. В фоне возможны задержки Android.':
   'Уведомления включены, но для фона нужна синхронизация Android.');
 text('apex-settings-screen-status',!mobileReady?
  'Режим экрана доступен в Android APK.':
  data.keepScreenOn?
   'Экран остаётся включённым, пока приложение видно.':
   'Экран гаснет по обычным настройкам телефона.');
 text('apex-settings-background-status',mobileReady
  ?(toggle.checked?'Фоновая синхронизация включена. Точное время запуска определяет Android.':
    'Фоновая синхронизация отключена.')
  :'Настройка доступна только внутри установленного Android-приложения.');
 text('native-storage-status',mobileReady
  ?'База Room доступна · '+(data.observationCount||0)+' записей · последнее наблюдение: '+
   (data.latestObservationAt?time(data.latestObservationAt):'пока нет')
  :(data.error?'Нативное хранилище недоступно: '+data.error:
   'Веб-режим: локальная база и фоновые задания доступны только внутри Android APK.'));
 el('native-show-history').disabled=!mobileReady;
 return data;
}
async function showMobileHistory(){
 if(!mobileReady)return;
 const list=el('native-history');clear(list);
 list.append(create('p','muted','Читаем сохранённые наблюдения '+chosen+'…'));
 try{
  const result=await getMobileHistory(chosen,15);
  clear(list);
  const rows=result.observations||[];
  if(!rows.length){
   list.append(create('p','muted','История '+chosen+' пока пуста. После успешного получения публичных данных записи появятся здесь.'));
   return;
  }
  for(const row of rows){
   const line=create('div','source-line');
   const left=create('div');
   left.append(create('b','',row.kind==='liquidity'?'Видимая ликвидность':'Рыночный снимок'),
    create('small','',row.source+' · наблюдение '+time(Number(row.observedAt))),
    create('small','', 'Сохранено '+new Date(row.collectedAt).toLocaleString('ru-RU')+' · историческая запись'));
   line.append(left,create('span','source-state neutral','СОХРАНЕНО'));
   list.append(line);
  }
 }catch(error){
  clear(list);list.append(create('p','muted','Не удалось прочитать базу: '+String(error?.message||error)));
 }
}
el('native-refresh-status').addEventListener('click',()=>void refreshMobileStatus());
el('native-show-history').addEventListener('click',()=>void showMobileHistory());
el('apex-settings-open').addEventListener('click',()=>{
 const dialog=el('apex-settings-dialog');
 void refreshMobileStatus();
 if(typeof dialog.showModal==='function')dialog.showModal();
 else dialog.setAttribute('open','');
});
el('apex-settings-close').addEventListener('click',()=>{
 const dialog=el('apex-settings-dialog');
 if(typeof dialog.close==='function')dialog.close();
 else dialog.removeAttribute('open');
});
el('apex-settings-sources').addEventListener('click',()=>{
 const dialog=el('apex-settings-dialog');
 if(typeof dialog.close==='function')dialog.close();
 else dialog.removeAttribute('open');
 navigate('sources','native-storage-panel');
});
el('apex-settings-background').addEventListener('change',event=>{
 const original=el('native-background-sync');
 if(original.disabled){event.target.checked=original.checked;return;}
 event.target.disabled=true;
 original.checked=event.target.checked;
 original.dispatchEvent(new Event('change',{bubbles:true}));
});
for(const [id,key] of [
 ['apex-settings-alerts','forecastAlertsEnabled'],
 ['apex-settings-alert-limit','alertLimitReady'],
 ['apex-settings-alert-targets','alertTargets'],
 ['apex-settings-alert-stop','alertStop'],
 ['apex-settings-screen','keepScreenOn']
]){
 el(id).addEventListener('change',async event=>{
  const input=event.target,requested=input.checked;
  input.disabled=true;
  try{
   if(key==='forecastAlertsEnabled'&&requested){
    const permission=await requestMobileForecastNotificationPermission();
    if(!permission.granted)
     throw Error(permission.error||'Разрешение на уведомления не предоставлено');
   }
   await setMobileSettings({[key]:requested});
   await refreshMobileStatus();
  }catch(error){
   input.checked=!requested;
   text(key==='keepScreenOn'?'apex-settings-screen-status':'apex-settings-alert-status',
    'Не удалось сохранить настройку: '+String(error?.message||error));
   input.disabled=!mobileReady;
  }
 });
}
el('native-background-sync').addEventListener('change',async event=>{
 const toggle=event.target,enabled=toggle.checked;
 toggle.disabled=true;
 text('native-storage-status','Сохраняем настройки Android…');
 try{
  await setMobileSettings({asset:chosen,backgroundSyncEnabled:enabled});
  await refreshMobileStatus();
 }catch(error){
  toggle.checked=!enabled;
  const mirrored=el('apex-settings-background');
  mirrored.checked=!enabled;
  mirrored.disabled=false;
  text('native-storage-status','Не удалось настроить фоновые задания: '+String(error?.message||error));
  toggle.disabled=!mobileReady;
 }
});
void refreshMobileStatus();

function sourceRow(title,status,sub){
 const row=create('div','source-line');
 const content=create('div');
 content.append(create('b','',title),create('small','',sub));
 const state=create('span','source-state '+(status==='OK'?'ok':'fail'),status);
 row.append(content,state);
 return row;
}
function setNotice(message,isError=false){
 el('load-message').classList.toggle('error',isError);
 text('load-message',message);
}
const liquidityDashboard=initLiquidityDashboard();
const onChainDashboard=initOnChainDashboard();

function updateTab(view){
 document.body.dataset.view=view;
 for(const tab of document.querySelectorAll('[data-tab]')){
  const active=tab.dataset.tab===activeDock(view);
  tab.classList.toggle('active',active);
  if(active)tab.setAttribute('aria-current','page');
  else tab.removeAttribute('aria-current');
 }
 for(const name of ['overview','catalog','asset','forecasts','sources','news','macro','quality','radar'])
  el('view-'+name).classList.toggle('hidden',name!==view);
}


/**
 * One flat choice per screen, no nested disclosure-navigation tree.
 * Keep every analytical DOM node mounted so native Room callbacks and
 * existing panel references keep functioning while areas change.
 */
let lastAssetArea='chart';
function setAssetArea(requested){
 const mode=workspaceArea('asset',requested);
 if(!mode)return;
 const panel=el('view-asset');
 const previousArea=panel.dataset.assetArea;
 panel.dataset.assetArea=mode;
 lastAssetArea=mode;
 for(const button of document.querySelectorAll('[data-asset-area-button]')){
  const active=button.dataset.assetAreaButton===mode;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-pressed',String(active));
 }
 if(document.body.dataset.view==='asset'&&previousArea!==mode){
  if(mode==='chart')requestAnimationFrame(()=>candleView.resize());
  if(mode==='structure')void loadCandleHistory(false);
  if(mode==='data')requestAnimationFrame(()=>{
   void liquidityDashboard.refresh(chosen);
   void onChainDashboard.refresh(chosen);
   void loadAssetSocial(chosen);
   void ensureAssetNewsFeed();
  });
 }
}
function setQualityArea(requested){
 const mode=workspaceArea('quality',requested);
 if(!mode)return;
 el('view-quality').dataset.qualityArea=mode;
 for(const button of document.querySelectorAll('[data-quality-area-button]')){
  const active=button.dataset.qualityAreaButton===mode;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-pressed',String(active));
 }
}

let recentAssetContext=null;
let researchLayersDashboard=null;
const editorialDashboard=initEditorialDashboard({
 getSymbol:()=>chosen,
 onMacroObservation:report=>researchLayersDashboard?.setMacro(report),
 onNewsObservation:()=>{
  // Shared headlines are already fetched; never refresh market or forecasts.
  if(recentAssetContext?.symbol===chosen)
   renderAssetNews(recentAssetContext.sources?.find(s=>s.id==='gdelt-news'));
 }
});
/** Request RSS/news only when the user opens asset Data or taps refresh.
 * A 15-minute shared observation avoids repeated requests between assets.
 */
function ensureAssetNewsFeed({force=false}={}){
 const previous=editorialDashboard.getNewsObservation();
 const recent=Number.isSafeInteger(previous?.checkedAt)&&
  Date.now()-previous.checkedAt>=0&&
  Date.now()-previous.checkedAt<15*60000;
 if(!force&&recent)return;
 void editorialDashboard.open('news');
}
// The high-frequency price refresh must NEVER generate unbounded GDELT queries.
let editorialStorage=null;
try{editorialStorage=window.localStorage;}catch{}
const assetNewsBudget=createEditorialBudget({storage:editorialStorage});
const bitcoinBackgroundGate=createBitcoinBackgroundGate();
el('asset-news-check').addEventListener('click',()=>ensureAssetNewsFeed({force:true}));
const newsM5Panel=initNewsM5Panel({getSymbol:()=>chosen,storage:editorialStorage});
const assetEventArchive=createEventHistory({storage:editorialStorage});
const freeSourceDashboard=initFreeSourceDashboard({getSymbol:()=>chosen,storage:editorialStorage});
researchLayersDashboard=initResearchLayersDashboard({
 getSymbol:()=>chosen,storage:editorialStorage,
 checkSocial:asset=>loadAssetSocial(asset),
 checkMacro:()=>editorialDashboard.open('macro')
});
const radarDashboard=initRadarDashboard({
 getCatalog:()=>catalog,
 onOpenAsset:symbol=>{void investigate(symbol);navigate('asset','structure');}
});
const candleView=new CandleChart(el('candle-canvas'),{
 onSelect(bar){
  const stamp=new Date(bar.t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
   year:'numeric',hour:'2-digit',minute:'2-digit'});
  text('chart-selected',stamp+' · O '+fmt(bar.open)+' · H '+fmt(bar.high)+
   ' · L '+fmt(bar.low)+' · C '+fmt(bar.close)+' · Объём '+fmt(bar.volume,2)+
   (bar.closed?' · закрыта':' · формируется'));
 }
});
let candleInterval='1h',candleGeneration=0,candleController=null,
 candleLastKey='',candleLastAt=0;
let scenarioRequest=0,scenarioMode='all',focusedScenarioId=null,
 lastScenarioRows=[],lastScenarioAsset='',lastScenarioFetchedAt=0,
 lastScenarioTruncated=false,drawnCandleAsset='',drawnCandleInterval='',
 replayStep=0,replayScenarioId=null;

function trackedResearchIds(){
 try{
  const raw=JSON.parse(localStorage.getItem('apex9_selected_research_ids_v1')||'[]');
  return Array.isArray(raw)?raw.filter(x=>typeof x==='string').slice(-300):[];
 }catch{return [];}
}
const replayTime=stamp=>Number.isSafeInteger(stamp)?
 new Date(stamp).toLocaleString('ru-RU'):'—';
function renderScenarioReplay(scenarios){
 const root=el('scenario-replay-panel'),
  steps=el('scenario-replay-steps'),
  detail=el('scenario-replay-detail');
 clear(steps);clear(detail);
 const selected=scenarios.find(s=>s.id===focusedScenarioId)||scenarios[0];
 if(selected?.model==='DIRECTIONAL'){
  root.classList.remove('has-replay');
  text('scenario-replay-counter','24 H1 · TP / SL');
  text('scenario-replay-context',selected.asset+' · '+
   (selected.side==='UP'?'↑ Рост':'↓ Снижение')+
   ' · оригинальные уровни: TP1 '+fmt(selected.levels.tp1)+
   ', TP2 '+fmt(selected.levels.tp2)+', TP3 '+fmt(selected.levels.tp3)+
   ', SL '+fmt(selected.levels.sl));
  text('scenario-replay-warning',
   'Старый 4H Replay относится только к архиву диапазонов. '+
   'Для 24-часового прогноза порядок касаний проверяется в карточке «Сценарии» '+
   'по реальным H1 и не заменяется четырьмя историческими закрытиями.');
  candleView.setReplayCursor(null);
  return;
 }
 if(!selected){
  text('scenario-replay-counter','0 / 5 закрытий');
  text('scenario-replay-context','Выбери исследование для просмотра его подтверждённой H1-истории.');
  text('scenario-replay-warning','Сценарии не загружены. Наблюдения не имитируются.');
  candleView.setReplayCursor(null);
  root.classList.remove('has-replay');
  return;
 }
 root.classList.add('has-replay');
 if(replayScenarioId!==selected.id){
  replayScenarioId=selected.id;replayStep=0;
 }
 const hasH1=candleInterval==='1h'&&drawnCandleInterval==='1h'&&
  drawnCandleAsset===chosen;
 const observed=hasH1?candleView.data:[];
 const replay=buildScenarioReplay(selected,observed,{now:Date.now()});
 text('scenario-replay-counter',replay.observed+' / 5 закрытий');
 text('scenario-replay-context',
  selected.asset+' · исходный диапазон '+fmt(selected.bandLow)+
  ' — '+fmt(selected.bandHigh)+' USDT · опубликовано '+
  replayTime(selected.publishedAt));
 for(let i=0;i<=4;i++){
  const point=replay.points[i];
  const button=create('button','scenario-replay-step'+
   (replayStep===i?' current':'')+
   (point?.state==='OBSERVED'?' observed':' missing'));
  button.type='button';button.setAttribute('aria-pressed',replayStep===i?'true':'false');
  button.setAttribute('aria-label','Посмотреть '+(
   point?.label||'H1 №'+i));
  button.append(create('strong','',String(i)),
   create('small','',point?.state==='OBSERVED'?'●':'—'));
  button.addEventListener('click',()=>{
   replayStep=i;
   renderScenarioReplay(scenarios);
   const step=replay.points[i];
   if(hasH1&&step?.state==='OBSERVED'){
    const found=candleView.focusOnScenario(step.closeAt);
    if(!found)text('chart-selected','Этой H1-свечи нет в видимой истории.');
   }
  });
  steps.append(button);
 }
 const point=replay.points[replayStep];
 if(point){
  detail.append(create('strong','',point.label+' · '+replayTime(point.closeAt)));
  if(point.state==='OBSERVED'){
   detail.append(create('div','scenario-replay-price',
    fmt(point.close)+' USDT'));
   const sign=point.deltaPct>0?'+':'';
   detail.append(create('p','',
    'Относительно опорного закрытия: '+sign+fmt(point.deltaPct,3)+'% · '+
    (point.inside?'в исходном диапазоне':'вне исходного диапазона')));
   detail.append(create('p','',
    replayStep===3?'Промежуточное закрытие H1. Не является отдельным этапом подтверждения.':
    point.stageObserved?'Соответствующий этап подтверждён записью Room.':
    'Цена сохранена, но отдельное подтверждение этапа отсутствует.'));
   if(replayStep===4)detail.append(create('p','',
    replay.verifiedFinal?'Итог согласуется с сохранённым исследованием.':
    'Историческая цена известна, но итог журнала не подтверждён этим наблюдением.'));
  }else{
   const messages={
    NOT_CLOSED:'Свеча ещё не закрыта: значение недоступно.',
    MISSING:'Нет сохранённой закрытой H1-свечи. Цена не восполняется.',
    AMBIGUOUS:'Найдены повторные записи на один час. Наблюдение отклонено.',
    INVALID_SOURCE:'Нарушена проверка сохранённого OHLCV.'
   };
   detail.append(create('p','scenario-replay-absent',
    messages[point.state]||'Наблюдение недоступно.'));
  }
 }
 const reasons={
  INVALID:'Исходная гипотеза не прошла проверку.',
  ANCHOR_MISMATCH:'Опорная цена не совпадает с оригинальным исследованием.',
  SOURCE_CONFLICT:'В истории найдены противоречивые или ошибочные H1-свечи.',
  RESULT_CONFLICT:'Итог журнала противоречит фактическому H1-закрытию.',
  EMPTY:'Нет закрытых исходных H1-свечей в доступном кэше.',
  PARTIAL:'История неполная — отсутствующие цены и этапы не дорисовываются.',
  COMPLETE:replay.verifiedFinal?
   'Все пять H1-закрытий известны; итог согласован с журналом.':
   'Все пять закрытий известны, но итог исследования ещё не подтверждён.'
 };
 text('scenario-replay-warning',
  !hasH1?'Для Replay открой H1 и загрузи исторические свечи выбранного актива.':
   reasons[replay.state]||'Данные проверяются по исходным записям Room.');
 if(hasH1&&point?.state==='OBSERVED'){
  candleView.setReplayCursor({closeAt:point.closeAt,close:point.close});
 }else candleView.setReplayCursor(null);
}

function renderScenarioMap(asset){
 const box=el('asset-scenario-summary');clear(box);
 for(const button of document.querySelectorAll('[data-scenario-map-mode]')){
  const on=button.dataset.scenarioMapMode===scenarioMode;
  button.classList.toggle('selected',on);
  button.setAttribute('aria-pressed',on?'true':'false');
 }
 const map=buildScenarioMap(lastScenarioRows,{
  asset,mode:scenarioMode,selectedIds:trackedResearchIds(),
  focusId:focusedScenarioId,now:Date.now(),max:3
 });
 const onH1=candleInterval==='1h';
 if(map.scenarios.length&&!map.scenarios.some(sc=>sc.focused)){
  map.scenarios[0].focused=true;
  focusedScenarioId=map.scenarios[0].id;
 }
 candleView.setInterval(candleInterval);
 candleView.setScenarios(onH1?map.scenarios:[]);
 const extra=(map.hidden?' · ещё '+map.hidden+' вне мини-карты':'')+
  (lastScenarioTruncated?' · журнал частичный (последние 75 записей)':'');
 const focus=map.scenarios.find(sc=>sc.focused);
 if(focus&&onH1&&candleView.data.length)
  candleView.focusOnScenario(focus.anchorCloseAt);
 const context=onH1?' · показываем только реальные H1-свечи':
  ' · метки доступны только при выборе H1';
 text('asset-scenario-status',map.state==='INVALID'?
  'Параметры карты не прошли проверку.':
  map.available?
   'Показано '+map.scenarios.length+' из '+map.available+
   ' доступных сценариев'+extra+context:
   scenarioMode==='tracked'?
    'Нет отмеченных пользователем исследований по '+asset+
    '. Отметить сценарий можно во вкладке «Прогнозы».':
    'Для '+asset+' пока нет проверяемых сценариев в доступном журнале.');
 for(const sc of map.scenarios){
  const button=create('button','scenario-map-item'+
   (sc.tracked?' tracked':'')+(sc.focused?' focused':''));
  button.type='button';
  button.setAttribute('aria-label',
   'Показать на графике исследовательский сценарий от '+
   new Date(sc.publishedAt).toLocaleString('ru-RU'));
  const top=create('span','scenario-map-item-heading');
  const name=sc.model==='DIRECTIONAL'?
   (sc.side==='UP'?'↑ РОСТ':'↓ СНИЖЕНИЕ')+
    (sc.stage==='EVALUATED'?' · завершён':
     sc.stage==='ACTIVE'?' · активный · TP1':
      sc.stage==='CONFIRMED'?' · активный · вход':' · лимитный · ожидает входа'):
   sc.stage==='EVALUATED'?'Завершён · итог сохранён':
   sc.stage==='DUE_UNVERIFIED'?'Горизонт прошёл · итог не проверен':
   sc.stage==='ACTIVE'?'Наблюдается · две H1':
   sc.stage==='CONFIRMED'?'Первое H1 подтверждено':
   'Ожидает подтверждения';
  top.append(create('strong','',name),
   create('small','',(sc.tracked?'★ Отмечен':'Исследование')+
     ' · '+sc.milestones.length+' из 4 событий'));
  const middle=create('span','scenario-map-item-range',
   sc.model==='DIRECTIONAL'?
    'Вход '+fmt(sc.levels.entry)+' · TP1 '+fmt(sc.levels.tp1)+
    ' · TP2 '+fmt(sc.levels.tp2)+' · TP3 '+fmt(sc.levels.tp3)+
    ' · SL '+fmt(sc.levels.sl):
    fmt(sc.bandLow)+' — '+fmt(sc.bandHigh)+' USDT');
  const detail=create('span','scenario-map-item-time',
   'Опорная свеча: '+new Date(sc.anchorCloseAt).toLocaleString('ru-RU')+
   ' · публикация: '+new Date(sc.publishedAt).toLocaleString('ru-RU'));
  button.append(top,middle,detail);
  if(sc.result)button.append(create('span','scenario-map-item-result',
   (sc.model==='DIRECTIONAL'?
    directionalOutcomeLabel(sc.result.outcome):
    sc.result.outcome==='WITHIN_RANGE'?
     'Итог в исходном диапазоне':'Итог за пределами диапазона')+
   ' · '+new Date(sc.targetCloseAt).toLocaleString('ru-RU')));
  button.addEventListener('click',()=>{
   focusedScenarioId=sc.id;
   replayStep=0;
   renderScenarioMap(asset);
   if(!onH1)return;
   const found=candleView.focusOnScenario(sc.anchorCloseAt);
   text('chart-selected',found?
    'График перемещён к опорной H1-свече исследования от '+
      new Date(sc.publishedAt).toLocaleString('ru-RU')+'.':
    'Опорной свечи нет в загруженной истории. Карта не дорисовывает недостающие данные.');
  });
  box.append(button);
 }
 renderScenarioReplay(map.scenarios);
}
async function showAssetScenarios(asset,{force=false}={}){
 if(lastScenarioAsset!==asset){
  lastScenarioAsset=asset;lastScenarioRows=[];lastScenarioFetchedAt=0;
  lastScenarioTruncated=false;
  candleView.setScenarios([]);
 }
 if(!force&&lastScenarioFetchedAt&&Date.now()-lastScenarioFetchedAt<15000){
  renderScenarioMap(asset);return;
 }
 const token=++scenarioRequest;
 text('asset-scenario-status','Проверяем подлинные этапы сохранённых исследований…');
 try{
  const results=await getMobileResearchForecasts(75);
  if(token!==scenarioRequest||asset!==chosen)return;
  if(!results.native||results.error){
   lastScenarioRows=[];lastScenarioFetchedAt=Date.now();
   renderScenarioMap(asset);
   text('asset-scenario-status',results.error||
    'Карта наблюдений доступна в установленном Android APK.');
   return;
  }
  lastScenarioRows=Array.isArray(results.forecasts)?results.forecasts:[];
  lastScenarioTruncated=Number.isSafeInteger(results.publishedCount)&&
   results.publishedCount>lastScenarioRows.length;
  lastScenarioFetchedAt=Date.now();
  renderScenarioMap(asset);
 }catch(error){
  if(token!==scenarioRequest||asset!==chosen)return;
  lastScenarioRows=[];renderScenarioMap(asset);
  text('asset-scenario-status','Не удалось прочитать историю Room: '+
   String(error?.message||error));
 }
}
for(const button of document.querySelectorAll('[data-scenario-map-mode]')){
 button.addEventListener('click',()=>{
  scenarioMode=button.dataset.scenarioMapMode;
  focusedScenarioId=null;replayScenarioId=null;replayStep=0;
  renderScenarioMap(chosen);
 });
}

function candleMessage(message,warning=false){
 text('candle-status',message);
 el('candle-status').classList.toggle('is-offline',warning);
}

const coreRegimes={DIRECTIONAL:'Направленное',RANGE:'Диапазон',MIXED:'Смешанное',UNKNOWN:'—'};
const frameLabels={'15m':'M15','1h':'H1','4h':'H4','1d':'D1'};
const directionLabels={UP:'Рост в истории',DOWN:'Снижение в истории',FLAT:'Без изменения',UNKNOWN:'Недостаточно данных'};
function pctNumber(v,d=2){return Number.isFinite(v)?(v>0?'+':'')+fmt(v,d)+'%':'—';}
function showMarketCore(candles,origin,interval){
 const result=analyzeMarketFrame(candles,interval,{now:Date.now(),source:origin});
 const available=result.status==='OK'||result.status==='STALE';
 text('market-core-interval',frameLabels[interval]||interval);
 text('market-core-status',available?
   origin+' · '+result.closedBars+' завершённых свечей · '+(result.status==='STALE'?'исторический срез':'источник обработан')+
   ' · это не прогноз':
   origin+' · '+(result.reason||'Недостаточно данных')+' · вывод не рассчитан');
 text('core-regime',available?coreRegimes[result.mode]:'—');
 text('core-velocity',available?pctNumber(result.velocityPctPerBar,3):'—');
 text('core-acceleration',available?pctNumber(result.accelerationPctPerBar2,3):'—');
 text('core-volume',available&&Number.isFinite(result.volumeRatio)?fmt(result.volumeRatio,2)+'×':'—');
 text('core-range-values',available?fmt(result.rangeLow)+' — '+fmt(result.rangeHigh):'—');
 text('core-range-position',available&&Number.isFinite(result.rangePosition)?fmt(result.rangePosition*100,1)+'%':'—');
 text('core-volatility',available?pctNumber(result.volatilityPctPerBar,3):'—');
 el('core-range-indicator').style.left=available&&Number.isFinite(result.rangePosition)
   ?Math.min(100,Math.max(0,result.rangePosition*100))+'%':'50%';
 return result;
}
let matrixGeneration=0,matrixController=null;
function resetMarketMatrix(reason='Сравнение ещё не запущено.'){
 matrixGeneration++;
 matrixController?.abort();
 matrixController=null;
 text('market-matrix-status',reason);
 text('market-matrix-summary','Нет свежего сравнения горизонтов.');
 clear(el('market-matrix-items'));
 el('market-matrix-run').disabled=false;
}
function renderMarketMatrix(comparison,asset){
 const box=el('market-matrix-items');clear(box);
 const names={DIRECTIONAL:'направленное',RANGE:'диапазон',MIXED:'смешанное',UNKNOWN:'не определён'};
 for(const frame of comparison.frames){
  const row=create('div','market-matrix-row');
  row.append(create('strong','',frameLabels[frame.interval]||frame.interval));
  const middle=create('div');
  middle.append(create('div','frame-caption',frame.status==='OK'
   ?directionLabels[frame.direction]+' · '+(names[frame.mode]||'не определён')
   :frame.status==='CACHE'?'Историческая запись на телефоне, не текущие сведения':
    frame.status==='STALE'?'Данные источника устарели':
    frame.status==='MISSING'?'Нет проверенных данных':'Нет актуальных свечей'));
  const state=create('span','frame-status '+(frame.status==='OK'?'':'is-stale'),frame.status==='OK'?'Свежие':frame.status);
  row.append(middle,state);box.append(row);
 }
 const message={
  INSUFFICIENT:'Для сравнения нужно минимум два актуальных горизонта. Исторический кэш не является текущим подтверждением.',
  DIVERGENT:'Свежие горизонты расходятся по ранее наблюдавшемуся направлению движения.',
  UP_CONTEXT:'Наблюдалось преобладание роста на доступных свежих горизонтах.',
  DOWN_CONTEXT:'Наблюдалось преобладание снижения на доступных свежих горизонтах.',
  MIXED:'Исторические изменения различаются; единого контекста не обнаружено.'
 };
 text('market-matrix-summary',(message[comparison.state]||'Контекст не определён')+
  ' · свежих: '+comparison.available+'/4 · актив: '+asset+'. Не является прогнозом.');
}
async function runMarketMatrix(){
 matrixController?.abort();
 const run=++matrixGeneration,asset=chosen;
 const controller=new AbortController();
 matrixController=controller;
 const button=el('market-matrix-run');button.disabled=true;
 const frames={};
 clear(el('market-matrix-items'));
 try{
  for(let i=0;i<MARKET_FRAMES.length;i++){
   if(run!==matrixGeneration||controller.signal.aborted)return;
   const interval=MARKET_FRAMES[i];
   text('market-matrix-status','Проверяем '+asset+' · '+frameLabels[interval]+' ('+(i+1)+'/4). Только публичные данные.');
   // At most one concurrent fetch to respect Android bandwidth and exchange limits.
   const cached=await getMobileCandles(asset,interval,120);
   if(run!==matrixGeneration)return;
   const source=await fetchCandles(asset,interval,{
    signal:controller.signal,limit:120,now:()=>Date.now()
   });
   if(run!==matrixGeneration)return;
   if(source.state==='OK'&&source.candles?.length){
    const summary=analyzeMarketFrame(source.candles,interval,{now:source.receivedAt});
    frames[interval]={asset,interval,state:summary.status==='OK'?'OK':summary.status,summary};
    if(summary.status==='OK'){
     void saveMobileCandles(asset,interval,source.candles.filter(c=>c.closed));
    }
   }else if(cached.candles?.length){
    frames[interval]={asset,interval,state:'CACHE',
     summary:analyzeMarketFrame(cached.candles,interval)};
   }else{
    frames[interval]={asset,interval,state:source.state,summary:null};
   }
  }
  if(run!==matrixGeneration)return;
  renderMarketMatrix(compareMarketFrames(frames,{asset}),asset);
  text('market-matrix-status','Проверка завершена · '+new Date().toLocaleTimeString('ru-RU')+
   ' · источник: Binance Spot');
 }catch(error){
  if(run===matrixGeneration)text('market-matrix-status','Сбой получения истории: '+String(error?.message||error));
 }finally{
  if(run===matrixGeneration){
   matrixController=null;button.disabled=false;
  }
 }
}
el('market-matrix-run').addEventListener('click',()=>void runMarketMatrix());

function displayCandleStructure(candles,description){
 drawnCandleAsset=chosen;drawnCandleInterval=candleInterval;
 const analysis=analyzeStructure(candles);
 showMarketCore(candles,description,candleInterval);
 candleView.setData(candles,analysis.events);
 void showAssetScenarios(chosen);
 const container=el('structure-events');clear(container);
 const mapDir={UP:'вверх',DOWN:'вниз'};
 const interesting=analysis.events.filter(e=>e.type==='BOS'||e.type==='CHoCH').slice(-6).reverse();
 text('structure-summary',analysis.status==='OK'
  ?description+' · закрытых свечей: '+analysis.analyzedBars+
   ' · подтверждённых структурных изменений: '+analysis.events.length+
   ' · последний исторический контекст: '+(mapDir[analysis.bias]||'не определён')
  :'Недостаточно закрытых свечей для проверки рыночной структуры.');
 if(!interesting.length)container.append(create('p','muted','Подтверждённых BOS/CHoCH в доступном периоде не найдено.'));
 for(const event of interesting){
  const row=create('div','structure-event'),label=create('div');
  label.append(create('b','',event.type+' · '+(mapDir[event.direction]||event.direction)),
   create('small','',new Date(event.time).toLocaleString('ru-RU')+' · уровень '+fmt(event.level)));
  row.append(label,create('small','',event.type==='CHoCH'?'Изменение':'Продолжение'));
  container.append(row);
 }
}
async function loadCandleHistory(force=false){
 const asset=chosen,interval=candleInterval,key=asset+':'+interval;
 if(!force&&candleLastKey===key&&Date.now()-candleLastAt<90000){
  requestAnimationFrame(()=>candleView.resize());
  return;
 }
 if(candleController)candleController.abort();
 const id=++candleGeneration;
 const request=new AbortController();
 candleController=request;
 const timeout=setTimeout(()=>request.abort(),12000);
 candleLastKey=key;candleLastAt=Date.now();
 candleMessage('Загружаем '+asset+' · '+interval+' — проверенная история Binance Spot…');
 try{
  const cached=await getMobileCandles(asset,interval,500);
  if(id!==candleGeneration)return;
  if(cached.candles.length){
   displayCandleStructure(cached.candles,'Локальный кэш');
   candleMessage('Локальный кэш: '+cached.candles.length+' завершённых свечей. Проверяем актуальность…',true);
  }else{
   candleView.setData([]);
   showMarketCore([],'Источник ещё не получен',interval);
   text('structure-summary','Ожидаются реальные завершённые свечи.');
   clear(el('structure-events'));
  }
  const result=await fetchCandles(asset,interval,{signal:request.signal,now:()=>Date.now(),limit:500});
  if(id!==candleGeneration)return;
  if(result.candles.length){
   displayCandleStructure(result.candles,result.state==='STALE'?'Источник устарел':'Binance Spot');
   const closed=result.candles.filter(x=>x.closed);
   if(closed.length)void saveMobileCandles(asset,interval,closed).then(saved=>{
    if(saved.native&&saved.saved>0)void refreshMobileStatus();
   });
   candleMessage((result.state==='OK'?'Binance Spot':'Устаревшие данные источника')+
    ' · '+result.candles.length+' свечей · '+interval+
    ' · получено '+time(result.receivedAt),result.state!=='OK');
  }else if(cached.candles.length){
   candleMessage('Нет свежих свечей ('+result.state+'). Отображается исторический кэш на телефоне.',true);
  }else{
   candleMessage('История недоступна ('+result.state+'). '+(result.error||'Нет данных'),true);
   candleLastAt=0;
  }
 }catch(error){
  if(id===candleGeneration){
   candleMessage('Не удалось загрузить свечи: '+String(error?.message||error),true);
   candleLastAt=0;
  }
 }finally{
  clearTimeout(timeout);
  if(id===candleGeneration)candleController=null;
 }
}
for(const button of document.querySelectorAll('[data-interval]')){
 const interval=button.dataset.interval;
 button.addEventListener('click',()=>{
  candleInterval=interval;
  drawnCandleInterval='';drawnCandleAsset='';
  candleView.setReplayCursor(null);
  candleView.setInterval(interval);
  renderScenarioMap(chosen);
  resetMarketMatrix('Таймфрейм графика изменён. При необходимости повторите сравнение.');
  for(const x of document.querySelectorAll('[data-interval]')){
   const selected=x.dataset.interval===interval;
   x.classList.toggle('selected',selected);
   x.setAttribute('aria-pressed',selected?'true':'false');
  }
  void loadCandleHistory(true);
 });
}
el('chart-refresh').addEventListener('click',()=>void loadCandleHistory(true));
el('chart-reset').addEventListener('click',()=>{
 candleView.reset();
 text('chart-selected','Масштаб возвращён к последним свечам.');
});


const favoriteManager=initFavoriteResearch({
 getSelectedSymbol:()=>chosen,
 onSelectSymbol:(symbol,researchId=null)=>{
  void investigate(symbol);
  focusedScenarioId=researchId;
  if(researchId)scenarioMode='all';
  navigate('asset','chart');
 },
 onForecastStage:()=>navigate('forecasts'),
 onExplainSymbol:symbol=>openAssetExplanation(symbol),
 onOpenRadar:(symbol,interval)=>{
  if(radarDashboard.focus(symbol,interval))navigate('radar','radar-focus-panel');
 }
});
void favoriteManager.initialize().then(()=>{
 if(document.body.dataset.view==='catalog')renderCatalog();
});
const evidenceDashboard=initEvidenceDashboard({
 getSelectedSymbol:()=>chosen,
 getFavorites:()=>favoriteManager.getFavorites()
});
const validationDashboard=initValidationDashboard();
const researchPatternsDashboard=initResearchPatternsDashboard();
const researchRegimesDashboard=initResearchRegimesDashboard();
const crossAssetDashboard=initCrossAssetDashboard();
const researchSynthesisDashboard=initResearchSynthesisDashboard({
 onSummary:report=>renderPassportResearchQuality(report)
});
renderPassportResearchQuality(null);

/** The passport can describe only the last completed, asset-matched audit. */
function renderPassportResearchQuality(report){
 const state=describeResearchQuality(report,chosen);
 const label=el('asset-quality-status'),detail=el('asset-quality-detail');
 label.textContent=state.label;
 label.dataset.state=state.state;
 detail.textContent=state.detail;
}
/** User-initiated explain action from passport or exact favorite card. */
function openAssetExplanation(value){
 const symbol=normalizeSymbol(value);
 if(!symbol)return;
 // investigate synchronizes the app's chosen asset before any network await.
 if(chosen!==symbol)void investigate(symbol);
 const selected=evidenceDashboard.selectAsset(symbol);
 const allowed=[...el('evidence-asset').options].map(x=>x.value);
 const route=planAssetExplanation(symbol,allowed);
 if(!selected||route.state!=='READY')return;
 navigate(route.view,route.targetId);
 researchSynthesisDashboard.openForAsset(route.asset);
}

function navigate(view,targetId){
 if(view!=='radar')radarDashboard.close();
 if(view==='catalog'){
  el('asset-input').value='';
  catalogPage=1;
  renderCatalog();
 }
 if(view==='asset')setAssetArea(assetAreaForEntry(targetId,lastAssetArea));
 if(view==='quality')setQualityArea(researchAreaForTarget(targetId));
 updateTab(view);
 requestAnimationFrame(()=>{
  if(view==='radar')radarDashboard.open();
  if(view==='asset'){
   const area=el('view-asset').dataset.assetArea;
   if(area==='chart')candleView.resize();
   // Both chart and historical structure use the same completed candle data.
   void loadCandleHistory(false);
   void showAssetScenarios(chosen);
   // Native depth and onchain panels are only refreshed when opened.
   // Multi-TF market comparison remains explicitly user-initiated.
   if(area==='data'){
    void liquidityDashboard.refresh(chosen);
    void onChainDashboard.refresh(chosen);
    void loadAssetSocial(chosen);
    void freeSourceDashboard.openAsset(chosen);
    void ensureAssetNewsFeed();
   }
   if(!lastLoad||Date.now()-lastLoad>90000)void investigate(chosen);
  }
  if(view==='sources'){
   researchLayersDashboard?.open(chosen);
   void freeSourceDashboard.checkPublicSources(chosen);
  }
  if(view==='forecasts')favoriteManager.openForecasts();
  if(view==='quality'){
   evidenceDashboard.open();
   const back=el('quality-context-back');
   const fromPassport=targetId==='synthesis-panel';
   el('view-quality').dataset.qualityEntry=fromPassport?'asset':'dock';
   back.dataset.go=fromPassport?'asset':'forecasts';
   back.textContent=fromPassport?'‹ Актив':'‹ Прогнозы';
   back.setAttribute('aria-label',fromPassport?
    'Вернуться к паспорту актива':'Вернуться к прогнозам');
  }
  if(view==='overview'){
   favoriteManager.openOverviewSummary();
   void editorialDashboard.openOverview();
   void freeSourceDashboard.openOverview();
  }
  if(view==='news'||view==='macro')void editorialDashboard.open(view);
  // Contextual entry must keep the flat task selector on screen.
  const node=view==='overview'?
   el('overview-favorites-anchor'):
   view==='quality'&&targetId?
    el('quality-workspace-anchor'):
    targetId?el(targetId):el('view-'+view);
  if(node)node.scrollIntoView({behavior:'smooth',block:'start'});
 });
}
el('asset-explain').addEventListener('click',()=>openAssetExplanation(chosen));
for(const button of document.querySelectorAll('[data-asset-area-button]'))
 button.addEventListener('click',()=>{
  setAssetArea(button.dataset.assetAreaButton);
  if(button.dataset.assetAreaButton==='data')void freeSourceDashboard.openAsset(chosen);
  el('asset-workspace-anchor').scrollIntoView({behavior:'smooth',block:'start'});
 });
for(const button of document.querySelectorAll('[data-quality-area-button]'))
 button.addEventListener('click',()=>{
  setQualityArea(button.dataset.qualityAreaButton);
  el('quality-workspace-anchor').scrollIntoView({behavior:'smooth',block:'start'});
 });
for(const button of document.querySelectorAll('[data-tab]'))
 button.addEventListener('click',()=>navigate(button.dataset.tab));
for(const button of document.querySelectorAll('[data-go]'))
 button.addEventListener('click',()=>navigate(button.dataset.go,button.dataset.target));
function markSelectedAsset(){
 favoriteManager.selectChanged();
 evidenceDashboard.refreshAssetChoices();
}
updateTab('overview');
void editorialDashboard.openOverview();
void freeSourceDashboard.openOverview();
markSelectedAsset();

function suggestions(query){
 const datalist=el('asset-options');clear(datalist);
 if(!catalog.length)return;
 const q=(query||'').toUpperCase().trim().replace(/[^A-Z0-9]/g,'');
 const matches=q?catalog.filter(x=>x.startsWith(q)).slice(0,35):catalog.slice(0,35);
 for(const item of matches){
  const option=create('option');
  option.value=item;
  datalist.appendChild(option);
 }
}
let catalogPage=1;
function renderCatalog(){
 const list=el('catalog-results');list.replaceChildren();
 const q=el('asset-input').value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!catalog.length){
  list.append(create('p','muted','Каталог загружается или недоступен. Можно ввести символ вручную.'));
  text('catalog-result-count','Нет загруженных пар');
  el('catalog-show-more').hidden=true;
  return;
 }
 const matches=q?catalog.filter(symbol=>symbol.includes(q)):catalog;
 text('catalog-result-count',fmt(matches.length,0)+' пар');
 const shown=matches.slice(0,catalogPage*60);
 for(const symbol of shown){
  const row=create('div','catalog-row');row.setAttribute('role','listitem');
  const open=create('button','catalog-open',symbol);
  open.type='button';open.setAttribute('aria-label','Исследовать '+symbol);
  open.addEventListener('click',()=>{void investigate(symbol);navigate('asset','chart');});
  const chosen=favoriteManager.hasFavorite(symbol);
  const star=create('button','catalog-favorite',chosen?'★':'☆');
  star.type='button';star.setAttribute('aria-pressed',String(chosen));
  star.setAttribute('aria-label',(chosen?'Убрать ':'Добавить ')+symbol+(chosen?' из избранного':' в избранное'));
  star.disabled=!favoriteManager.isNative()||(!chosen&&favoriteManager.getFavorites().length>=10);
  star.addEventListener('click',async()=>{
   await favoriteManager.toggleSymbol(symbol);renderCatalog();
  });
  row.append(open,star);list.append(row);
 }
 el('catalog-show-more').hidden=shown.length>=matches.length;
}
el('catalog-show-more').addEventListener('click',()=>{catalogPage++;renderCatalog();});
el('asset-input').addEventListener('input',(ev)=>{
 suggestions(ev.target.value);catalogPage=1;renderCatalog();
});

async function loadCatalog(){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9500);
 try{
  const result=await fetchSpotCatalog({
   fetchImpl:(url,opts)=>fetch(url,{...opts,signal:controller.signal})
  });
  if(result.state==='OK'){
   catalog=result.symbols;
   radarDashboard.catalogChanged();
   text('catalog-status','Каталог Binance Spot/USDT: '+fmt(catalog.length,0)+
    ' доступных пар. Можно вводить сокращение, например GRAM.');
   suggestions(el('asset-input').value);
   renderCatalog();
  }else{
   renderCatalog();
   text('catalog-status','Каталог недоступен ('+result.state+
    '). Ручной ввод символа работает, если доступен API.');
  }
 }finally{clearTimeout(timer);}
}

function renderDepth(snapshot){
 const list=el('depth-list');clear(list);
 if(!snapshot.depth.length){
  list.append(create('p','muted','Публичные стаканы сейчас недоступны.'));
  return;
 }
 for(const item of snapshot.depth){
  const row=create('div','source-line');
  const content=create('div');
  content.append(
   create('b','',item.venue==='binance'?'Binance Spot':'Bybit Spot'),
   create('small','', 'Bid '+fmt(item.bestBid)+' · Ask '+fmt(item.bestAsk)),
   create('small','', 'Видимый дисбаланс: '+fmt(item.visibleDepthImbalance*100,1)+'%'+
    ' · Спред '+fmt(item.spreadBps,2)+' б.п.')
  );
  row.append(content,create('span','source-state ok',time(item.receivedAt)));
  list.append(row);
 }
}
function renderSources(snapshot){
 const list=el('source-list');clear(list);
 for(const source of snapshot.sources){
  const detail=source.state==='OK'
   ?'Срез получен · '+time(source.data?.receivedAt)
   :(source.error||'Не удалось получить данные');
  list.append(sourceRow(sourceNames[source.id]||source.id,source.state,detail));
 }
}

const contextSources={
 'coingecko-global':'CoinGecko · глобальная статистика',
 'bitcoin-mempool':'mempool.space · сеть Bitcoin (общий рынок)',
 'gdelt-news':'GDELT · упоминания в СМИ'
};
const usd=(x)=>Number.isFinite(x)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(x):'—';
function renderGlobalOverview(context){
 const view=globalMarketSnapshot(context,{now:Date.now()});
 const state=el('overview-global-state');
 state.dataset.state=view.state;
 state.textContent=view.reason;
 const available=view.state==='OK'||view.state==='STALE';
 text('overview-global-cap',available?usd(view.marketCapUsd):'—');
 text('overview-global-volume',available?usd(view.totalVolumeUsd):'—');
 text('overview-global-btc',available?fmt(view.btcDominancePercent,2)+'%':'—');
 const change=el('overview-global-change');
 change.textContent=available?
  (view.marketCapChange24hPercent>0?'+':'')+fmt(view.marketCapChange24hPercent,2)+'%':'—';
 change.className='overview-global-delta'+(available?
  view.marketCapChange24hPercent>0?' positive':
   view.marketCapChange24hPercent<0?' negative':'':'');
 text('overview-global-updated',available?
  'По времени CoinGecko: '+time(view.observedAt)+
   (view.state==='STALE'?' · данные устарели':''):
  'Нет подтверждённого обновления общего рынка.');
}
function appendLine(target,label,value){
 const line=create('div','data-row');
 line.append(create('span','',label),create('strong','',value));
 target.append(line);
}
function showAssetEventHistory(){
 const list=el('asset-event-history'),status=el('asset-event-history-status');
 if(!list||!status)return;
 clear(list);
 const result=assetEventArchive.list({symbol:chosen,includeGlobal:true,limit:12});
 if(result.state!=='OK'){
  status.textContent='Локальная история недоступна';
  list.append(create('p','muted','Сохранённые события проверить не удалось.'));
  return;
 }
 status.textContent=chosen+' · найдено в истории '+result.total+
  ' · показано '+result.events.length;
 if(!result.events.length){
  list.append(create('p','muted','История появится после ответов доступных источников.'));
  return;
 }
 for(const event of result.events){
  const row=create('article','apex-event-history-row');
  const link=create('a','',event.title);
  link.href=event.href;link.target='_blank';link.rel='noopener noreferrer';
  const scope=event.kind==='MACRO'&&!event.assets.includes(chosen)?
   'Общий макрофон':event.kind==='SOCIAL'?'Социальное обсуждение':
    'Публикация об активе';
  row.append(link,create('small','',scope+' · '+
   new Date(event.eventAt).toLocaleString('ru-RU')+
   ' · '+event.source+' · влияние не подтверждено'));
  list.append(row);
 }
}
async function loadAssetSocial(symbol){
 const list=el('asset-social-list'),state=el('asset-social-state');
 if(!symbol||!list||!state)return;
 clear(list);
 state.textContent='Проверяем кеш публичных обсуждений · Bluesky… Reddit ожидает одобренного доступа.';
 const result=await assetNewsBudget.load('social',
  ()=>fetchBlueskyPosts(symbol),{key:symbol});
 if(symbol!==chosen)return;
 freeSourceDashboard.setSocial(symbol,result);
 researchLayersDashboard?.setSocial(symbol,result);
 assetEventArchive.captureAsset(symbol,{social:result});
 showAssetEventHistory();
 if(!['OK','EMPTY','STALE'].includes(result.state)){
  state.textContent='Bluesky · '+result.state+
   ' · запросов '+(result.quota?.used??'—')+'/6 за сутки';
  list.append(create('p','muted','Обсуждения недоступны. Мнения пользователей не подменяются сведениями.'));
  return;
 }
 state.textContent='Bluesky · '+(result.state==='STALE'?'архив, требуется обновление':
  'публичные сообщения')+' · запросов '+(result.quota?.used??'—')+'/6'+
  ' · Reddit: требуется одобренный OAuth';
 if(!result.posts?.length){
  list.append(create('p','muted','Новых публичных обсуждений для этого актива нет.'));
  return;
 }
 for(const post of result.posts){
  const row=create('article','asset-event-row');
  const link=create('a','',post.text);
  link.href=post.href;link.target='_blank';link.rel='noopener noreferrer';
  const evidence=discussionEvidence(post,{symbol,now:Date.now()});
  const label=evidence.relevance==='MENTIONS_ASSET'?'упоминает актив':
   evidence.relevance==='GENERAL_TOPIC'?'общая тема':'связь не подтверждена';
  row.append(link,create('small','',
   post.author+' · '+new Date(post.indexedAt).toLocaleString('ru-RU')+
   ' · непроверенное сообщение'+(result.state==='STALE'?' · архив':'')),
   create('small','',label+' · '+evidence.age+
    (evidence.topics.length?' · '+evidence.topics.join(' / '):'')+
    ' · влияние на цену неизвестно'));
  list.append(row);
 }
}
function renderAssetNews(gdelt){
 const merged=buildAssetNewsContext(chosen,{
  gdelt,live:editorialDashboard.getNewsObservation()
 },{now:Date.now(),limit:6});
 const dest=el('asset-news-list');
 clear(dest);
 const asset=chosen.replace(/(USDT|USDC|USD|EUR)$/,'');
 text('asset-news-source-status','Фактические состояния · '+sourceStatusLine(merged.sources));
 text('asset-news-summary',formatNewsCollectionAnalysis(
  analyzeNewsCollection(merged.stories,{asset,now:Date.now()}),asset));
 if(merged.state==='UNAVAILABLE'){
  text('asset-news-state','Нет успешных ответов новостных источников для исследования.');
  dest.append(create('p','muted','Проверьте состояния источников выше. Новые публикации не подставляются.'));
  return;
 }
 if(merged.state==='EMPTY'){
  text('asset-news-state','Источники проверены, но явных упоминаний этого актива нет.');
  dest.append(create('p','muted','Общие новости не считаются подтверждёнными событиями этой монеты.'));
  return;
 }
 if(merged.state==='INVALID'){
  text('asset-news-state','Ошибка проверки новостной подборки.');
  return;
 }
 text('asset-news-state',merged.stories.length+
  ' публикаций с явным названием актива · только новостный контекст');
 for(const item of merged.stories){
  const row=create('article','asset-event-row');
  const link=create('a','',item.title);
  link.href=item.href;link.target='_blank';link.rel='noopener noreferrer';
  const temporal=item.timeKind==='PUBLISHED'?'публикация':
   item.timeKind==='INDEXED'?'индексация':'время не уточнено';
  const indexers=Array.isArray(item.indexedBy)?item.indexedBy:[];
  const providers=indexers.length>1?
   ' · индексаторы: '+indexers.join(', ')+' (не независимое подтверждение)':'';
  row.append(link,create('small','',
   item.source+' · '+temporal+' '+new Date(item.observedAt).toLocaleString('ru-RU')+
   providers+(item.outdated?' · архив / не перепроверено':'')+
   ' · факт события и влияние на цену не проверены'));
  newsM5Panel.attach(item,row,chosen);
  dest.append(row);
 }
}
function contextSourceExplanation(item){
 if(item?.id==='bitcoin-mempool'&&item?.state==='OK'){
  const scope=item.data?.assetSpecific?
   'сеть выбранного BTC':'сеть Bitcoin, не блокчейн выбранной монеты';
  return 'Реальные показатели · '+scope+
   (item.access==='CACHE'?' · локальный кеш (до 2 мин)':' · ответ API')+
   ' · получено '+time(item.data.receivedAt);
 }
 if(item?.id==='gdelt-news'&&
  ['WAIT_INTERVAL','LIMIT_REACHED','STALE'].includes(item?.state)){
  const nextAt=item.quota?.nextAt;
  return (item.state==='STALE'?'Архив: новые публикации пока не проверены':
   item.state==='LIMIT_REACHED'?'Локальный суточный лимит запросов':'Локальная пауза GDELT')+
   (Number.isSafeInteger(nextAt)&&nextAt>Date.now()?
    ' · следующая попытка после '+time(nextAt):'')+
   ' · RSS проверяется отдельно';
 }
 if(item?.state==='OK')return 'Сведения получены'+
  (item.access==='CACHE'?' · локальный кеш':'');
 if(item?.state==='EMPTY')return 'Источник ответил, совпадений нет';
 if(item?.state==='UNSUPPORTED')return 'Не поддерживается для выбранного актива';
 if(item?.state==='RATE_LIMITED')return 'Ограничение запросов на стороне сервиса';
 if(item?.state==='OFFLINE')return 'Нет ответа API · '+(item.error||item.reason||'проверьте сеть');
 if(item?.state==='INVALID')return 'Некорректный ответ источника';
 return item?.reason||item?.error||'Нет доступных сведений';
}
function renderContext(context){
 recentAssetContext=context;
 renderGlobalOverview(context);
 const list=el('context-source-list'),global=el('global-context'),
  chain=el('btc-chain-context'),news=el('news-articles');
 for(const node of [list,global,chain,news])clear(node);
 if(!context){
  for(const node of [list,global,chain,news])
   node.append(create('p','muted','Нет проверенных сведений.'));
  clear(el('asset-news-list'));
  text('asset-news-state','Нет проверенных упоминаний актива.');
  text('asset-news-source-status','Источники по активу пока не проверены.');
  text('asset-news-summary','Нет полученных публикаций для анализа.');
  el('asset-news-list').append(create('p','muted','Источники по активу пока не проверены.'));
  showAssetEventHistory();
  text('external-summary','Внешние источники не были получены.');
  return;
 }
 const data=Object.fromEntries(context.sources.map(x=>[x.id,x]));
 const good=context.sources.filter(x=>x.state==='OK').length;
 text('external-summary',good+' из 3 внешних источников ответили действительными сведениями. '+
  'Данные не используются как неподтверждённые предсказания.');
 const marketOk=current?.sources?.filter(x=>x.state==='OK').length||0;
 text('top-status',(marketOk+good)+' / 6 источников');
 for(const item of context.sources){
  list.append(sourceRow(contextSources[item.id]||item.id,item.state,
   contextSourceExplanation(item)));
 }
 const g=data['coingecko-global'];
 if(g?.state==='OK'&&g.data){
  appendLine(global,'Общая капитализация',usd(g.data.marketCapUsd));
  appendLine(global,'Суточный объём',usd(g.data.totalVolumeUsd));
  appendLine(global,'Доля BTC',fmt(g.data.btcDominancePercent,2)+'%');
  appendLine(global,'Изменение капитализации за 24 ч',
   (g.data.marketCapChange24hPercent>0?'+':'')+fmt(g.data.marketCapChange24hPercent,2)+'%');
  appendLine(global,'Обновление источника',time(g.data.observedAt));
 }else global.append(create('p','muted','CoinGecko: '+(g?.state||'OFFLINE')+
  (g?.error?' · '+g.error:'')));
 const b=data['bitcoin-mempool'];
 if(b?.state==='OK'&&b.data){
  appendLine(chain,'Ожидающих транзакций',fmt(b.data.transactionCount,0));
  appendLine(chain,'Виртуальный размер',fmt(b.data.virtualSizeVBytes,0)+' vB');
  appendLine(chain,'Сумма комиссий',fmt(b.data.totalFeesSats,0)+' сатоши');
  appendLine(chain,'Время получения',time(b.data.receivedAt));
  appendLine(chain,'Область данных',b.data.assetSpecific?
   'Сеть выбранного BTC':'Общая сеть BTC, не блокчейн выбранной монеты');
  if(b.access==='CACHE')appendLine(chain,'Источник','Локальный кеш · до 2 минут');
 }else chain.append(create('p','muted',
  b?.state==='UNSUPPORTED'?'Показатели сети Bitcoin доступны только для BTC.':
  'mempool.space: '+(b?.state||'OFFLINE')+(b?.error?' · '+b.error:'')));
 const n=data['gdelt-news'];
 assetEventArchive.captureAsset(chosen,{news:n});
 showAssetEventHistory();
 renderAssetNews(n);
 if(n?.state==='OK'&&n.data?.articles?.length){
  for(const item of n.data.articles){
   const row=create('div','source-line');
   const content=create('div');
   const link=create('a','news-link',item.title);
   link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
   content.append(link,create('small','',item.domain+' · '+time(item.seenAt)));
   row.append(content);news.append(row);
  }
 }else news.append(create('p','muted',
  n?.state==='EMPTY'?'За указанный период совпадений в GDELT не обнаружено.':
  n?.state==='UNSUPPORTED'?'Нет достаточно однозначного названия для новостного поиска.':
  'GDELT: '+(n?.state||'OFFLINE')+(n?.error?' · '+n.error:'')));
}

function renderSnapshot(snapshot){
 current=snapshot;
 const srcOk=snapshot.sources.filter(s=>s.state==='OK').length;
 const pct=snapshot.ticker?.changePercent;
 text('market-price',snapshot.ticker?fmt(snapshot.ticker.price)+' USDT':'—');
 text('market-change',pct===undefined?'24 ч: —':(pct>0?'+':'')+fmt(pct,2)+'% / 24 ч');
 el('market-change').className='delta'+
  (pct>0?' positive':pct<0?' negative':'');
 text('updated-at','Последняя попытка обновления: '+time(snapshot.collectedAt));
 text('active-sources',srcOk+' / 3');
 text('layer-coverage',snapshot.assessment.coveredLayers.length+' / 7');
 text('hero-coverage','Покрытие: '+snapshot.assessment.coveredLayers.length+' / 7 слоёв');
 text('context-status',snapshot.assessment.assessment==='INSUFFICIENT'?'Недостаточно':
   snapshot.assessment.assessment==='MIXED'?'Противоречия':'Частичный');
 const assessment=assessmentNames[snapshot.assessment.assessment]||'Статус неизвестен';
 const detail=snapshot.assessment.assessment==='INSUFFICIENT'
  ?'Для обоснованного многослойного прогноза данных пока недостаточно. Сейчас доступны только публичные рыночные наблюдения; вероятности не рассчитываются.'
  :'Обнаружен '+assessment.toLowerCase()+'. Это описание источников, а не прогноз цены и не вероятность.';
 text('assessment-text',detail);
 text('top-status',srcOk+' из 3 источников');
 text('quote-volume',snapshot.ticker?fmt(snapshot.ticker.quoteVolume,0)+' USDT':'—');
 text('ticker-time',snapshot.ticker?time(snapshot.ticker.observedAt):'—');
 const tags=el('missing-layers');clear(tags);
 for(const layer of snapshot.assessment.missingLayers)
  tags.append(create('span','tag',layerNames[layer]||layer));
 renderDepth(snapshot);renderSources(snapshot);
 const firstError=snapshot.sources.find(s=>s.state!=='OK');
 if(srcOk===3)setNotice('Все три публичных API ответили. Оценка прогноза не выполняется.');
 else if(srcOk>0)setNotice('Частичные сведения: '+srcOk+' из 3 источников. '+
   (firstError?'Ошибка '+(sourceNames[firstError.id]||firstError.id)+': '+firstError.state:''));
 else setNotice('Нет доступных рыночных данных. Проверяйте соединение, региональные ограничения и CORS.',true);
}
async function investigate(value){
 const symbol=normalizeSymbol(value);
 if(!symbol){
  setNotice('Введите корректный биржевой символ, например BTCUSDT или GRAM.',true);
  return;
 }
 if(controller)controller.abort();
 const active=++pending;
 controller=new AbortController();
 const local=controller;
 const deadline=setTimeout(()=>local.abort(),9000);
 const changed=chosen!==symbol;
 if(changed)fastTickerAt=0;
 if(changed){
  newsM5Panel.reset();
  scenarioRequest++;
  drawnCandleAsset='';drawnCandleInterval='';
  replayScenarioId=null;replayStep=0;
  candleView.setData([]);candleView.setReplayCursor(null);
  lastScenarioRows=[];lastScenarioAsset='';lastScenarioFetchedAt=0;
  focusedScenarioId=null;
  candleView.setScenarios([]);
  resetMarketMatrix('Актив изменён. Для него потребуется отдельное сравнение.');
 }
 chosen=symbol;
 if(changed)renderPassportResearchQuality(null);
 if(changed){
  liquidityDashboard.clear(symbol);
  onChainDashboard.clear(symbol);
 }
 markSelectedAsset();
 if(changed&&document.body.dataset.view==='asset'){
  void loadCandleHistory(true);
  if(el('view-asset').dataset.assetArea==='data')void loadAssetSocial(symbol);
 }
 text('asset-name',chosen);
 el('asset-input').value=chosen;
 if(document.body.dataset.view==='asset')void showAssetScenarios(chosen);
 text('market-price','—');text('market-change','24 ч: —');
 text('top-status','Обновление…');
 text('updated-at','Запрос публичных источников…');
 text('active-sources','—');text('layer-coverage','—');
 text('hero-coverage','Покрытие: ожидание данных');
 text('context-status','—');
 text('quote-volume','—');text('ticker-time','—');
 clear(el('depth-list'));clear(el('source-list'));clear(el('missing-layers'));
 renderContext(null);
 freeSourceDashboard.setContext(chosen,null);
 freeSourceDashboard.setSnapshot(chosen,null);
 freeSourceDashboard.setSocial(chosen,null);
 setNotice('Получаем публичные данные бирж, общий крипторынок, сведения о BTC и новостные упоминания.');
 el('search-button').disabled=true;
 el('refresh-button').disabled=true;
 try{localStorage.setItem('apex9_preview_asset',chosen);}catch{}
 try{
  const [snapshot,context]=await Promise.all([
   collectAsset(chosen,{signal:local.signal,now:()=>Date.now()}),
   collectContext(chosen,{signal:local.signal,now:()=>Date.now(),
    newsGate:(symbol,fetcher)=>assetNewsBudget.load('assetNews',fetcher,
     {key:symbol}),bitcoinNetworkGate:bitcoinBackgroundGate})
  ]);
  if(active!==pending)return;
  renderSnapshot(snapshot);
  renderContext(context);
  freeSourceDashboard.setSnapshot(chosen,snapshot);
  freeSourceDashboard.setContext(chosen,context);
  // Persist only actual successful source observations in the phone's Room DB.
  const persisted=await saveMobileSnapshot(snapshot);
  if(active!==pending)return;
  if(persisted.native){
   try{await setMobileSettings({asset:chosen});}catch{}
   void refreshMobileStatus();
  }
  // Re-read genuine observations only once the native write has completed.
  void liquidityDashboard.refresh(chosen);
  lastLoad=Date.now();
 }catch(error){
  if(active===pending)setNotice('Ошибка обновления: '+String(error?.message||error),true);
 }finally{
  clearTimeout(deadline);
  if(active===pending){
   controller=null;
   el('search-button').disabled=false;
   el('refresh-button').disabled=false;
  }
 }
}
el('search-form').addEventListener('submit',(event)=>{
 event.preventDefault();
 void investigate(el('asset-input').value);
 navigate('asset','chart');
});
el('refresh-button').addEventListener('click',()=>void investigate(chosen));
// Foreground lightweight quote cadence; no high-rate book/news/on-chain polling.
async function refreshVisibleQuote(){
 if(document.hidden||fastTickerBusy||controller||!chosen||
  Date.now()-fastTickerAt<30000)return;
 const symbol=chosen;
 fastTickerAt=Date.now();
 fastTickerBusy=true;
 try{
  const result=await fetchSpotTicker(symbol,{now:()=>Date.now()});
  if(document.hidden||symbol!==chosen)return;
  if(result.state!=='OK'||!result.data)return;
  const ticker=result.data;
  text('market-price',fmt(ticker.price)+' USDT');
  text('market-change','24 ч: '+(ticker.changePercent>0?'+':'')+
   fmt(ticker.changePercent,2)+'%');
  el('market-change').className='delta'+
   (ticker.changePercent>0?' positive':
    ticker.changePercent<0?' negative':'');
  text('ticker-time',time(ticker.observedAt));
  text('updated-at','Цена: '+time(ticker.observedAt)+' · публичный Spot');
 }catch{
  // A failed refresh never erases the last verified displayed quote.
 }finally{fastTickerBusy=false;}
}
setInterval(()=>{
 if(document.hidden)return;
 if(!controller&&lastLoad&&Date.now()-lastLoad>10*60000)
  void investigate(chosen); // Includes slower books and contextual sources.
 else void refreshVisibleQuote();
},15000);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)return;
 if(!controller&&lastLoad&&Date.now()-lastLoad>10*60000)
  void investigate(chosen);
 else void refreshVisibleQuote();
 favoriteManager.resume();
});
void loadCatalog().catch(()=>{
 text('catalog-status','Каталог временно недоступен. Введите известный символ вручную.');
 renderCatalog();
});
void investigate(chosen);
setInterval(()=>{if(!document.hidden)favoriteManager.resume();},60000);
