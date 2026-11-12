import {collectAsset,collectVisibleDepth,fetchSpotCatalog,fetchSpotTicker,normalizeSymbol} from './research.mjs';
import {createForegroundDepthPolicy} from './foreground-depth-policy.mjs';
import {createForegroundBookStreams} from './live-depth-streams.mjs';
import {selectDepthComparison,needsMatchedRest} from './depth-comparison-selector.mjs';
import {collectContext,createBitcoinBackgroundGate} from './context-sources.mjs';
import {RELEASE_API,latestSignedRelease,updateStatus} from './update-check.mjs';
import {getMobileStatus,getMobileHistory,saveMobileSnapshot,hasMobileObservationStorage,setMobileSettings,normalizeAlertMarkedIds,getMobileCandles,saveMobileCandles,getMobileWhaleHistory,getMobileResearchForecasts,getMobileAssetResearchForecasts,getMobileRadarHistory,requestMobileForecastNotificationPermission} from './mobile-bridge.mjs';
import {exportMobileCloudBackup,importMobileCloudBackup,
 getMobileCloudBackupStatus} from './mobile-bridge.mjs';
import {fetchCandles,analyzeStructure} from './candles.mjs';
import {CandleChart} from './candle-chart.mjs';
import {analyzeMarketFrame,compareMarketFrames,MARKET_FRAMES} from './market-core.mjs';
import {initFavoriteResearch} from './favorite-dashboard.mjs';
import {consumeMobileNotificationTarget,listenMobileNotificationOpen} from './mobile-bridge.mjs';
import {initOverviewResearchProgress} from './overview-research-progress.mjs';
import {initAssetFavoritePicker} from './asset-favorites-picker.mjs';
import {createMarketMatrixCache,matrixFromNativeRadar} from './market-matrix-cache.mjs';
import {initLiquidityDashboard} from './liquidity-dashboard.mjs';
import {initOnChainDashboard} from './onchain-dashboard.mjs';
import {initWhaleDashboard} from './whale-dashboard.mjs';
import {initLargeTradeDashboard} from './large-trade-dashboard.mjs';
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
import {createOverviewCache} from './overview-cache.mjs';
import {initRadarDashboard} from './radar-dashboard.mjs';
import {initCleanIntelligence} from './clean-intelligence.mjs';
import {initCleanIntelligenceMajor} from './clean-intelligence-major.mjs';
import {initCleanIntelligenceAssetHub} from './clean-intelligence-asset-hub.mjs';
import {initCleanIntelligenceEditorial} from './clean-intelligence-editorial.mjs';
import {buildScenarioMap} from './scenario-map.mjs';
import {publicationCaveat} from './scenario-publication-timing.mjs';
import {visibleChartScenarios,compactScenarioDetails} from './clean-chart-scenarios.mjs';
import {buildScenarioReplay} from './scenario-replay.mjs';
import {directionalOutcomeLabel} from './directional-scenario.mjs';

const el=(id)=>document.getElementById(id);
/** Keep technical notes accessible without showing every warning as a paragraph. */
function foldAssetTechnicalNotes(){
 for(const note of document.querySelectorAll('#view-asset .footnote')){
  if(note.closest('details')||note.closest('summary'))continue;
  const fold=document.createElement('details');
  fold.className='asset-quiet-detail';
  const title=document.createElement('summary');
  title.textContent='Методика и источники';
  note.replaceWith(fold);fold.append(title,note);
 }
}
foldAssetTechnicalNotes();
const fmt=(value,digits=8)=>Number.isFinite(value)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(value):'—';
const fmtPrice=(value)=>fmt(value,value>=1?2:value>=0.01?4:8);
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
 'okx-depth':'OKX · Spot order book'
};
const assessmentNames={
 INSUFFICIENT:'Недостаточно данных',MIXED:'Противоречивый контекст',
 UPWARD_CONTEXT:'Положительный исторический контекст',
 DOWNWARD_CONTEXT:'Отрицательный исторический контекст'
};
let chosen='BTCUSDT',current=null,controller=null,catalog=[],pending=0,lastLoad=0;
let fastTickerAt=0,fastTickerBusy=false,lastVerifiedTickerAt=0;
const foregroundDepthPolicy=createForegroundDepthPolicy();
let depthBusy=false,depthController=null,depthStream=null;
const latestLiveDepth=new Map(); // newest verified WS frames, UI only.
const latestRestDepth=new Map(); // newest verified REST fallback, UI only.
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
 const scope=el('apex-settings-alert-scope');
 scope.value=data.alertScope==='tracked'?'tracked':'all';
 scope.disabled=!mobileReady;
 text('apex-settings-alert-scope-hint',
  scope.value==='tracked'?
   'Уведомления только по ★ отмеченным сценариям ('+
   Number(data.alertMarkedCount||0)+'). Сбор статистики для остальных продолжается.':
   'Уведомления обо всех сценариях избранных активов. Статистика не зависит от выбора.');
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
   'Новые M1-события отслеживаются; архивные M5 сохраняются. В фоне возможны задержки Android.':
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
 const backup=await getMobileCloudBackupStatus();
 const usable=mobileReady&&backup.available===true;
 el('apex-backup-export').disabled=!usable;
 el('apex-backup-import').disabled=!usable;
 if(!usable){
  text('apex-backup-status','Для облачного архива нужна новая Android APK APEX.');
 }else{
  text('apex-backup-status',backup.lastWrittenAt?
   'Последний архив передан выбранному хранилищу: '+
    new Date(backup.lastWrittenAt).toLocaleString('ru-RU')+
    '. Проверьте синхронизацию файла в облаке.':
   'Архив ещё не создавался на этом телефоне. Пароль не сохраняется.');
 }
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
// Export or import only through the Android system document picker.
// Never send the password to an APEX server, persist it in localStorage,
// log it, or include it unencrypted in the archive.
let cloudBackupBusy=false;
async function runCloudBackup(mode){
 if(cloudBackupBusy)return;
 const input=el('apex-backup-passphrase');
 const passphrase=input.value;
 if(passphrase.length<12||passphrase.length>128){
  text('apex-backup-status',
   'Придумайте парольную фразу от 12 до 128 символов.');
  return;
 }
 const restore=mode==='restore';
 if(restore&&!window.confirm(
  'Восстановить зашифрованный архив APEX? Сохранённые сценарии и свечи '+
  'будут ДОБАВЛЕНЫ к существующим, без удаления данных. '+
  'Фон и уведомления останутся выключены до нового согласия. Продолжить?'
 ))return;
 cloudBackupBusy=true;
 const exportButton=el('apex-backup-export');
 const importButton=el('apex-backup-import');
 exportButton.disabled=true;importButton.disabled=true;
 text('apex-backup-status',restore?
  'Выберите файл .apexbackup в Google Drive или другом облаке…':
  'Выберите Google Drive или другое хранилище в окне Android…');
 try{
  let result;
  if(restore)result=await importMobileCloudBackup(passphrase,{confirmed:true});
  else{
   let ids=[];
   try {
    const raw=JSON.parse(localStorage.getItem(
     'apex9_selected_research_ids_v1')||'[]');
    ids=normalizeAlertMarkedIds(raw);
   }catch{
    throw Error('Не удалось проверить сохранённые отметки сценариев.');
   }
   // Reversible UI-only hidden cards are portable too; the Room originals
   // and forecast outcomes remain unchanged in the encrypted research file.
   const hiddenRaw=JSON.parse(localStorage.getItem(
    'apex9_hidden_research_ids_v1')||'[]');
   const hiddenIds=Array.isArray(hiddenRaw)?[...new Set(hiddenRaw.filter(
    key=>typeof key==='string'&&
     /^(direction2|direction3|range1):[A-Z0-9]{5,20}:(1h|15m|4h):\d{10,16}$/.test(key)
   ))].slice(-300):[];
   result=await exportMobileCloudBackup(passphrase,ids,hiddenIds);
  }
  if(result?.cancelled){
   text('apex-backup-status','Выбор файла отменён. История не изменена.');
  }else if(result?.error){
   text('apex-backup-status',result.error);
  }else if(restore&&result?.restored===true){
   if(result.settingsRestored===false){
    text('apex-backup-status',
     'История Room объединена, но настройки не восстановлены. '+
     'Не удаляйте исходный архив: повторите восстановление.');
    return;
   }
   const ui=result.uiMarkedIds;
   if(Array.isArray(ui)){
    let saved=[];
    try{
     saved=JSON.parse(localStorage.getItem(
      'apex9_selected_research_ids_v1')||'[]');
    }catch{}
    const merged=normalizeAlertMarkedIds([
     ...(Array.isArray(ui)?ui:[]),...(Array.isArray(saved)?saved:[])
    ]).slice(0,300);
    try{localStorage.setItem('apex9_selected_research_ids_v1',
     JSON.stringify(merged));}catch{}
   }
   if(Array.isArray(result.uiHiddenIds)){
    let savedHidden=[];
    try{savedHidden=JSON.parse(localStorage.getItem(
     'apex9_hidden_research_ids_v1')||'[]');}catch{}
    const mergedHidden=[...new Set([
     ...result.uiHiddenIds,...(Array.isArray(savedHidden)?savedHidden:[])
    ].filter(key=>typeof key==='string'&&
     /^(direction2|direction3|range1):[A-Z0-9]{5,20}:(1h|15m|4h):\d{10,16}$/.test(key)
    ))].slice(-300);
    try{localStorage.setItem('apex9_hidden_research_ids_v1',
     JSON.stringify(mergedHidden));}catch{}
   }
   text('apex-backup-status',
    'История APEX объединена с архивом. Перезапускаем экран для проверки…');
   window.location.reload();
  }else if(!restore&&result?.saved===true){
   text('apex-backup-status',
    'Зашифрованный архив записан. Проверьте, что файл полностью '+
    'загрузился в выбранное облако. Пароль нужен на другом телефоне.');
  }else text('apex-backup-status','Не удалось подтвердить завершение операции.');
 }catch(error){
  text('apex-backup-status','Ошибка архива: '+String(
   error?.message||error).slice(0,180));
 }finally{
  input.value='';
  cloudBackupBusy=false;
  if(mobileReady){
   exportButton.disabled=false;
   importButton.disabled=false;
  }
 }
}
el('apex-backup-export').addEventListener('click',
 ()=>void runCloudBackup('export'));
el('apex-backup-import').addEventListener('click',
 ()=>void runCloudBackup('restore'));
el('apex-settings-background').addEventListener('change',event=>{
 const original=el('native-background-sync');
 if(original.disabled){event.target.checked=original.checked;return;}
 event.target.disabled=true;
 original.checked=event.target.checked;
 original.dispatchEvent(new Event('change',{bubbles:true}));
});
// Send the exact starred forecast IDs, not just starred asset symbols.
// A single Android DataStore edit updates the mode and the selected IDs.
el('apex-settings-alert-scope').addEventListener('change',async event=>{
 const input=event.target,requested=input.value;
 const previous=requested==='tracked'?'all':'tracked';
 input.disabled=true;
 try{
  let raw=[];
  try{raw=JSON.parse(localStorage.getItem('apex9_selected_research_ids_v1')||'[]');}
  catch{throw Error('Список отмеченных повреждён. Выбор не сохранён');}
  const ids=normalizeAlertMarkedIds(raw);
  await setMobileSettings({alertScope:requested,alertMarkedIds:ids});
  await refreshMobileStatus();
 }catch(error){
  input.value=previous;
  input.disabled=!mobileReady;
  text('apex-settings-alert-scope-hint',
   'Не удалось изменить режим: '+String(error?.message||error));
 }
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
const whaleDashboard=initWhaleDashboard({
 getFavorites:()=>favoriteManager.getFavorites()
});
const largeTradeDashboard=initLargeTradeDashboard({
 getFavorites:()=>favoriteManager.getFavorites()
});

function updateTab(view){
 document.body.dataset.view=view;
 largeTradeDashboard.sync();
 if(view!=='asset'){
  depthStream?.stop();latestLiveDepth.clear();latestRestDepth.clear();
 }
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
 largeTradeDashboard.sync();
 for(const button of document.querySelectorAll('[data-asset-area-button]')){
  const active=button.dataset.assetAreaButton===mode;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-pressed',String(active));
 }
 if(document.body.dataset.view==='asset'&&previousArea!==mode){
  if(mode!=='data'){
   depthStream?.stop();latestLiveDepth.clear();latestRestDepth.clear();
  }
  if(mode==='data'){
   void syncDepthStreams();
   renderDepth({depth:[]}); // Never carry a previous sync badge unverified.
  }
  if(mode==='chart')requestAnimationFrame(()=>{
   candleView.resize();void refreshWhaleChart(chosen);
  });
  if(mode==='structure'){
   void loadCandleHistory(false);
   void restoreMarketMatrix(chosen);
  }
  if(mode==='data')requestAnimationFrame(()=>{
   void liquidityDashboard.refresh(chosen);
   void onChainDashboard.refresh(chosen);
   void whaleDashboard.refresh(chosen);
   void largeTradeDashboard.refresh(chosen);
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
const overviewCache=createOverviewCache({storage:editorialStorage});
const marketMatrixCache=createMarketMatrixCache({storage:editorialStorage});
const assetNewsBudget=createEditorialBudget({storage:editorialStorage});
const bitcoinBackgroundGate=createBitcoinBackgroundGate();
el('asset-news-check').addEventListener('click',()=>ensureAssetNewsFeed({force:true}));
const newsM5Panel=initNewsM5Panel({getSymbol:()=>chosen,storage:editorialStorage});
const assetEventArchive=createEventHistory({storage:editorialStorage});
const freeSourceDashboard=initFreeSourceDashboard({getSymbol:()=>chosen,storage:editorialStorage});
/** Only the visible favorite's public partial books. No socket traffic in
 * overview, background Android, or other selected-but-closed favorites.
 */
depthStream=createForegroundBookStreams({
 onBook({symbol,venue,depth}){
  if(document.hidden||document.body.dataset.view!=='asset'||
   el('view-asset').dataset.assetArea!=='data'||chosen!==symbol||
   !favoriteManager.hasFavorite(symbol))return;
  latestLiveDepth.set(venue,depth);
  renderDepth({depth:[depth]});
 },
 onSample({symbol,depth,collectedAt}){
  if(document.hidden||document.body.dataset.view!=='asset'||
   el('view-asset').dataset.assetArea!=='data'||chosen!==symbol||
   !favoriteManager.hasFavorite(symbol)||!hasMobileObservationStorage())return;
  // The service emits at most one source-checked snapshot per 30 seconds.
  void saveMobileSnapshot({symbol,collectedAt,depth:[depth],sources:[]})
   .then(saved=>{
    if(saved?.saved<1||chosen!==symbol||document.hidden||
     document.body.dataset.view!=='asset'||
     el('view-asset').dataset.assetArea!=='data')return;
    void liquidityDashboard.refresh(symbol);
   }).catch(()=>{});
 },
 onStatus({symbol,venue,state,error}){
  if(symbol!==chosen||document.hidden)return;
  if(state!=='LIVE'){
   latestLiveDepth.delete(venue);
   if(document.body.dataset.view==='asset'&&
    el('view-asset').dataset.assetArea==='data'){
    renderDepth({depth:[]});
   }
  }
  const status=el('depth-stream-status');
  if(!status)return;
  const label=state==='LIVE'?'WS работает':
   state==='CONNECTING'?'подключается':
   ['OFFLINE','DISCONNECTED','TIMEOUT','UNAVAILABLE'].includes(state)?
    'WS недоступен, резерв REST':
   state==='REMOTE_ERROR'?'биржа отклонила подписку, REST':
   state==='CLOCK_SKEW'?'несовпадение времени, REST':
   state==='SEQUENCE_RESET'?'сбой последовательности, REST':
   state==='INVALID'?'ответ не прошёл проверку, REST':'ожидание';
  status.dataset[venue]=label+(error?' ('+String(error).slice(0,75)+')':'');
  status.textContent='Потоки: Binance '+(status.dataset.binance||'ожидание')+
   ' · OKX '+(status.dataset.okx||'ожидание')+
   ' · REST включается при сбое или устаревании.';
 }
});
function syncDepthStreams(){
 const inData=document.body.dataset.view==='asset'&&
  el('view-asset').dataset.assetArea==='data';
 const favorite=favoriteManager.hasFavorite(chosen);
 depthStream?.sync({asset:chosen,visible:!document.hidden,
  favorite,native:hasMobileObservationStorage(),dataArea:inData});
 if(inData&&!document.hidden)depthStream?.tick();
}
researchLayersDashboard=initResearchLayersDashboard({
 getSymbol:()=>chosen,storage:editorialStorage,
 checkSocial:asset=>loadAssetSocial(asset),
 checkMacro:()=>editorialDashboard.open('macro')
});
const radarDashboard=initRadarDashboard({
 getCatalog:()=>catalog,getFavorites:()=>favoriteManager.getFavorites(),
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
let whaleChartQuery=0;
async function refreshWhaleChart(asset){
 const sequence=++whaleChartQuery;
 candleView.setWhaleEvents(asset,[]);
 const status=el('chart-whale-status');
 if(!favoriteManager.hasFavorite(asset)){
  status.textContent='Метки W: добавьте актив в избранное. Ранее сохранённые события не подменяются.';
  return;
 }
 const result=await getMobileWhaleHistory(asset,80);
 if(sequence!==whaleChartQuery||chosen!==asset)return;
 candleView.setWhaleEvents(asset,result.events||[]);
 status.textContent=result.complete?
  'Метки W: '+result.events.length+' событий в локальной выборке Room · '+
   'только первая фиксация транзакции, не ордера.':
  'Метки W недоступны: проверенный Android-архив пока отсутствует.';
}
function refreshBlockStatus(){
 const zones=candleView.orderBlocks||[];
 el('chart-ob-status').textContent='Зоны: '+zones.length+
  ' подтверждённых структурных зон в истории · показываем не более 3';
}
for(const [id,property] of [
 ['chart-ob-toggle','blocks'],['chart-whale-toggle','whales']]){
 const button=el(id);
 button.addEventListener('click',()=>{
  const enabled=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(enabled));
  button.classList.toggle('selected',enabled);
  candleView.setOverlayVisibility({[property]:enabled});
 });
}
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
 const selected=scenarios.find(s=>s.id===focusedScenarioId)||null;
 if(selected?.model==='DIRECTIONAL'||selected?.model==='MULTIFRAME'){
  root.classList.remove('has-replay');
  text('scenario-replay-counter',selected.model==='MULTIFRAME'?
   selected.sourceInterval.toUpperCase()+' · TP / SL':'24 H1 · TP / SL');
  text('scenario-replay-context',selected.asset+' · '+
   (selected.side==='UP'?'↑ Рост':'↓ Снижение')+
   ' · оригинальные уровни: TP1 '+fmt(selected.levels.tp1)+
   ', TP2 '+fmt(selected.levels.tp2)+', TP3 '+fmt(selected.levels.tp3)+
   ', SL '+fmt(selected.levels.sl));
  text('scenario-replay-warning',
   'Карта показывает сохранённые уровни и этапы из Room. '+
   'Порядок касаний проверяется отдельно, способом из публикации сценария. '+
   'Свечи графика не доказывают порядок внутри свечи.');
  candleView.setReplayCursor(null);
  return;
 }
 if(!selected){
  text('scenario-replay-counter','0 / 5 закрытий');
  text('scenario-replay-context','Выбери исследование для просмотра его подтверждённой H1-истории.');
  text('scenario-replay-warning',scenarios.length?
   'Выберите сценарий выше. До выбора его уровни и этапы на графике скрыты.':
   'Сценарии не загружены. Наблюдения не имитируются.');
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

/** Scenario UI is opt-in. Rendering a list NEVER selects the first order. */
function renderCleanChartDetails(scenario){
 const root=el('chart-scenario-details'),hide=el('chart-scenario-hide');
 const hint=el('chart-scenario-hint');
 clear(root);
 const item=compactScenarioDetails(scenario);
 if(!item){
  root.hidden=true;hide.disabled=true;hide.textContent='Сценарий не выбран';
  hint.textContent='Уровни скрыты. Нажмите на сценарий ниже, чтобы показать только его на графике.';
  return;
 }
 root.hidden=false;hide.disabled=false;hide.textContent='✕ Скрыть уровни';
 hint.textContent='Выбран один сценарий. Повторное нажатие на его карточку уберёт уровни.';
 const heading=create('div','clean-chart-scenario-heading');
 const name=item.direction==='UP'?'↑ Рост':item.direction==='DOWN'?
  '↓ Снижение':'Исторический диапазон';
 const complete=item.finished?' · завершён (архив)':' · наблюдение';
 heading.append(create('strong','',name+complete),
  create('small','',scenario.sourceInterval.toUpperCase()+
   ' · публикация '+new Date(scenario.publishedAt).toLocaleString('ru-RU')));
 root.append(heading);
 const lagNotice=publicationCaveat(scenario);
 if(lagNotice)
  root.append(create('p','clean-chart-publication-warning',lagNotice));
 const grid=create('div','clean-chart-scenario-grid');
 for(const [name,price] of item.rows){
  const style=name==='E'?' entry':name==='SL'?' stop':
   name.startsWith('T')?' target':'';
  const card=create('div','clean-chart-scenario-cell'+style);
  card.append(create('small','',name),
   create('strong','',fmtPrice(price)));
  grid.append(card);
 }
 root.append(grid);
 if(item.riskReward){
  root.append(create('p','clean-chart-scenario-foot',
   'R:R к T1 / T2 / T3: '+item.riskReward.map(x=>x.toFixed(2)).join(' / ')+
   ' · рассчитано по исходным уровням, не по результату исполнения.'));
 }
 root.append(create('p','clean-chart-scenario-foot',
  (item.finished?'Завершённый сценарий показан как историческая запись. ':
   'Уровни — исходная публикация, не торговая команда. ')+
  'Линии появляются только на имеющихся закрытых свечах. '+
  'Порядок касаний TP и SL проверяется отдельно в журнале.'));
}
el('chart-scenario-hide').addEventListener('click',()=>{
 if(!focusedScenarioId)return;
 focusedScenarioId=null;replayScenarioId=null;replayStep=0;
 renderScenarioMap(chosen);
});
function renderScenarioMap(asset){
 const box=el('asset-scenario-summary');clear(box);
 for(const button of document.querySelectorAll('[data-scenario-map-mode]')){
  const on=button.dataset.scenarioMapMode===scenarioMode;
  button.classList.toggle('selected',on);
  button.setAttribute('aria-pressed',on?'true':'false');
 }
 const map=buildScenarioMap(lastScenarioRows,{
  asset,mode:scenarioMode,selectedIds:trackedResearchIds(),
  focusId:focusedScenarioId,now:Date.now(),max:3,
  interval:candleInterval
 });
 const chartSupported=['1m','15m','1h','4h'].includes(candleInterval);
 // Only an explicit user-selected ID is allowed to paint scenario levels.
 // Absence of a choice means NONE, even if there are many forecasts in Room.
 candleView.setInterval(candleInterval);
 const single=visibleChartScenarios(map.scenarios,{
  selectedId:focusedScenarioId,interval:candleInterval});
 candleView.setScenarios(chartSupported?single:[]);
 const extra=(map.hidden?' · ещё '+map.hidden+' вне мини-карты':'')+
  (lastScenarioTruncated?' · журнал частичный (последние 75 записей)':'');
 const focus=single[0]||null;
 renderCleanChartDetails(focus);
 if(focus&&chartSupported&&drawnCandleAsset===asset&&
  drawnCandleInterval===candleInterval&&candleView.data.length)
  candleView.focusOnScenario(focus.anchorCloseAt);
 const context=chartSupported?' · показываем закрытые свечи '+
  candleInterval.toUpperCase():' · метки доступны для M1, M15, H1, H4';
 text('asset-scenario-status',map.state==='INVALID'?
  'Параметры карты не прошли проверку.':
  map.available?
   'Показано '+map.scenarios.length+' из '+map.available+
   ' доступных сценариев'+extra+context+
   (focus?' · показан выбранный':' · уровни скрыты до выбора'):
   scenarioMode==='tracked'?
    'Нет отмеченных пользователем исследований по '+asset+
    '. Отметить сценарий можно во вкладке «Прогнозы».':
    'Для '+asset+' пока нет проверяемых сценариев в доступном журнале.');
 for(const sc of map.scenarios){
  const button=create('button','scenario-map-item'+
   (sc.tracked?' tracked':'')+(focus?.id===sc.id?' focused':''));
  button.type='button';
  const chosenNow=focus?.id===sc.id;
  button.setAttribute('aria-pressed',String(chosenNow));
  button.setAttribute('aria-label',
   (chosenNow?'Скрыть уровни сценария от ':'Выбрать и показать сценарий от ')+
   new Date(sc.publishedAt).toLocaleString('ru-RU'));
  const top=create('span','scenario-map-item-heading');
  const name=['DIRECTIONAL','MULTIFRAME'].includes(sc.model)?
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
   ['DIRECTIONAL','MULTIFRAME'].includes(sc.model)?
    'Вход '+fmtPrice(sc.levels.entry)+' · TP1 '+fmtPrice(sc.levels.tp1)+
    ' · TP2 '+fmtPrice(sc.levels.tp2)+' · TP3 '+fmtPrice(sc.levels.tp3)+
    ' · SL '+fmtPrice(sc.levels.sl):
    fmt(sc.bandLow)+' — '+fmt(sc.bandHigh)+' USDT');
  const detail=create('span','scenario-map-item-time',
   'Опорная свеча: '+new Date(sc.anchorCloseAt).toLocaleString('ru-RU')+
   ' · публикация: '+new Date(sc.publishedAt).toLocaleString('ru-RU'));
  button.append(top,middle,detail);
  if(['DIRECTIONAL','MULTIFRAME'].includes(sc.model))button.title='Точные исходные уровни: '+
   JSON.stringify(sc.levels);
  if(sc.result)button.append(create('span','scenario-map-item-result',
   (['DIRECTIONAL','MULTIFRAME'].includes(sc.model)?
    directionalOutcomeLabel(sc.result.outcome):
    sc.result.outcome==='WITHIN_RANGE'?
     'Итог в исходном диапазоне':'Итог за пределами диапазона')+
   ' · '+new Date(sc.targetCloseAt).toLocaleString('ru-RU')));
  button.addEventListener('click',()=>{
   const deselect=focusedScenarioId===sc.id;
   focusedScenarioId=deselect?null:sc.id;
   replayScenarioId=null;replayStep=0;
   renderScenarioMap(asset);
   if(deselect){
    text('chart-selected','Уровни сценария скрыты. Свечи и рынок остаются на графике.');
    return;
   }
   if(!chartSupported)return;
   const found=candleView.focusOnScenario(sc.anchorCloseAt);
   text('chart-selected',found?
    'Показан только выбранный сценарий · опорная '+
     candleInterval.toUpperCase()+'-свеча от '+
      new Date(sc.publishedAt).toLocaleString('ru-RU')+'.':
    'Опорной свечи нет в загруженной истории. Недостающие уровни не дорисованы.');
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
  const results=await getMobileAssetResearchForecasts(asset,75);
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
const matrixRestoringAssets=new Set();
const matrixLastRequest=new Map();
function renderMarketMatrix(comparison,asset){
 const box=el('market-matrix-items');clear(box);
 const names={DIRECTIONAL:'направленное',RANGE:'диапазон',
  MIXED:'смешанное',UNKNOWN:'не определён'};
 for(const frame of comparison.frames){
  const row=create('div','market-matrix-row');
  const heading=create('strong','',frameLabels[frame.interval]||frame.interval);
  const middle=create('div');
  middle.append(create('div','frame-caption',
   frame.status==='OK'
    ?directionLabels[frame.direction]+' · '+(names[frame.mode]||'не определён')
    :frame.status==='CACHE'?
     (directionLabels[frame.direction]||'Направление не установлено')+
     ' · сохранённое наблюдение (не свежее)'
    :frame.status==='STALE'?'Источник устарел':
     frame.status==='MISSING'?'Ожидаем завершённые свечи':'Нет актуальных данных'));
  const code=frame.status==='OK'?'Актуально':
   frame.status==='CACHE'?'Архив':frame.status==='MISSING'?'Ожидание':frame.status;
  const state=create('span','frame-status '+(frame.status==='OK'?'':'is-stale'),code);
  row.append(heading,middle,state);box.append(row);
 }
 const message={
  INSUFFICIENT:'Для согласованности нужно минимум два актуальных горизонта. Сохранённые данные показаны отдельно.',
  DIVERGENT:'Исторические направления на свежих горизонтах расходятся.',
  UP_CONTEXT:'На доступных свежих горизонтах преобладал рост.',
  DOWN_CONTEXT:'На доступных свежих горизонтах преобладало снижение.',
  MIXED:'Единого направления на горизонтах не обнаружено.'
 };
 text('market-matrix-summary',(message[comparison.state]||'Контекст не определён')+
  ' · актуальных '+comparison.available+'/4 · '+asset+'.');
}
function resetMarketMatrix(reason='Ожидаем проверенные свечи.',asset=chosen){
 matrixGeneration++;
 matrixController?.abort();matrixController=null;
 const saved=marketMatrixCache.read(asset);
 renderMarketMatrix(compareMarketFrames(saved?.frames||{},{asset}),asset);
 text('market-matrix-status',saved?'Исторические наблюдения из локального кеша · '+reason:reason);
 el('market-matrix-run').disabled=false;
}
async function restoreMarketMatrix(asset=chosen){
 if(matrixRestoringAssets.has(asset))return;
 const generation=matrixGeneration;
 const saved=marketMatrixCache.read(asset),old=saved?.frames||{};
 renderMarketMatrix(compareMarketFrames(old,{asset}),asset);
 text('market-matrix-status',saved?'Сохранённые горизонты · сверяем историю Android…':
  'Читаем наблюдения Радара и закрытые свечи…');
 matrixRestoringAssets.add(asset);
 try{
  const native=await getMobileRadarHistory();
  if(asset!==chosen||generation!==matrixGeneration)return;
  const verified=matrixFromNativeRadar(native,asset,{now:Date.now()});
  const combined={...old,...verified};
  const current=Object.values(combined).filter(x=>x.state==='OK').length;
  if(Object.keys(combined).length){
   renderMarketMatrix(compareMarketFrames(combined,{asset}),asset);
   marketMatrixCache.save(asset,combined);
  }
  text('market-matrix-status',current>=2?
   'Радар Android · актуальных закрытых горизонтов '+current+'/4':
   Object.keys(combined).length?
    'Есть сохранённые наблюдения · актуальных '+current+'/4 · уточняем источники':
    'История пока не накоплена · проверяем доступные свечи');
  if(current===4)return;
  if(!favoriteManager.hasFavorite(asset)){
   text('market-matrix-status','Автообновление доступно для избранных. Показан только архив.');
   return;
  }
  const last=matrixLastRequest.get(asset)||0;
  if(Date.now()-last>=15*60000&&!matrixController)
   void runMarketMatrix(false,combined);
 }catch(e){
  if(asset===chosen&&generation===matrixGeneration)
   text('market-matrix-status','История Android недоступна · сохранённые значения остаются');
 }finally{matrixRestoringAssets.delete(asset);}
}
async function runMarketMatrix(force=false,preloaded=null){
 if(matrixController){
  if(!force)return;
  matrixController.abort();
 }
 const run=++matrixGeneration,asset=chosen;
 const now=Date.now(),last=matrixLastRequest.get(asset)||0;
 if(!force&&last&&now-last<15*60000)return;
 // User-initiated refresh still has a minimum gap, avoiding rate-limit loops.
 if(force&&last&&now-last<2*60000){
  text('market-matrix-status','Следующая проверка доступна через 2 минуты · показываем сохранённый результат');
  return;
 }
 const controller=new AbortController();
 matrixController=controller;matrixLastRequest.set(asset,now);
 const button=el('market-matrix-run');button.disabled=true;
 const saved=marketMatrixCache.read(asset);
 const frames={...(saved?.frames||{}),...(preloaded||{})};
 if(Object.keys(frames).length)
  renderMarketMatrix(compareMarketFrames(frames,{asset}),asset);
 else renderMarketMatrix(compareMarketFrames({},{asset}),asset);
 try{
  for(let i=0;i<MARKET_FRAMES.length;i++){
   if(run!==matrixGeneration||controller.signal.aborted||asset!==chosen)return;
   const interval=MARKET_FRAMES[i];
   if(!force&&frames[interval]?.state==='OK')continue;
   text('market-matrix-status','Обновляем закрытые '+frameLabels[interval]+
    ' · '+(i+1)+'/4 · сохранённые наблюдения остаются видимыми');
   const cached=await getMobileCandles(asset,interval,120);
   if(run!==matrixGeneration||controller.signal.aborted)return;
   // Room closed OHLCV may already contain the exact latest complete candle.
   const local=cached?.candles?.length?
    analyzeMarketFrame(cached.candles,interval,{now:Date.now(),source:'Android Room'}):null;
   if(!force&&local?.status==='OK'){
    frames[interval]={asset,interval,state:'OK',summary:local};
    renderMarketMatrix(compareMarketFrames(frames,{asset}),asset);
    continue;
   }
   const source=await fetchCandles(asset,interval,{
    signal:controller.signal,limit:120,now:()=>Date.now()
   });
   if(run!==matrixGeneration||controller.signal.aborted)return;
   if(source.state==='OK'&&source.candles?.length){
    const summary=analyzeMarketFrame(source.candles,interval,{now:source.receivedAt});
    if(summary.status==='OK'){
     frames[interval]={asset,interval,state:'OK',summary};
     void saveMobileCandles(asset,interval,source.candles.filter(c=>c.closed));
    }
   }else if(!frames[interval]&&local&&local.status!=='INVALID'){
    frames[interval]={asset,interval,state:'CACHE',summary:local};
   }
   // No response or rate-limit must not erase previously confirmed readings.
   renderMarketMatrix(compareMarketFrames(frames,{asset}),asset);
  }
  if(run!==matrixGeneration)return;
  marketMatrixCache.save(asset,frames);
  const count=Object.values(frames).filter(row=>row.state==='OK').length;
  text('market-matrix-status','Проверка завершённых свечей · актуальных '+count+
   '/4 · '+new Date().toLocaleTimeString('ru-RU',{
    hour:'2-digit',minute:'2-digit'})+
   (count<4?' · остальные показаны как архив или недоступны':''));
 }catch(e){
  if(run===matrixGeneration)
   text('market-matrix-status','Нет нового ответа · последний подтверждённый результат сохранён');
 }finally{
  if(run===matrixGeneration){matrixController=null;button.disabled=false;}
 }
}
el('market-matrix-run').addEventListener('click',()=>void runMarketMatrix(true));
function displayCandleStructure(candles,description){
 drawnCandleAsset=chosen;drawnCandleInterval=candleInterval;
 const analysis=analyzeStructure(candles);
 showMarketCore(candles,description,candleInterval);
 candleView.setData(candles,analysis.events);
 refreshBlockStatus();
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
  const row=create('div','structure-event is-'+
   (event.direction==='UP'?'up':'down')+' is-'+event.type.toLowerCase());
  const label=create('div');
  label.append(create('b','',event.type+' · '+(mapDir[event.direction]||event.direction)),
   create('small','',new Date(event.time).toLocaleString('ru-RU',{
    day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+
    ' · уровень '+fmt(event.level,2)));
  row.append(label,create('small','structure-kind',
   event.type==='CHoCH'?'Изменение':'Продолжение'));
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
  // A scenario from another timeframe is never silently carried over.
  focusedScenarioId=null;replayScenarioId=null;replayStep=0;
  drawnCandleInterval='';drawnCandleAsset='';
  candleView.setReplayCursor(null);
  candleView.setInterval(interval);
  refreshBlockStatus();
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


let assetFavoritePicker=null;
let experienceOverview=null;
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
 },
 onFavoritesChanged:()=>{
  radarDashboard.favoritesChanged();
  assetFavoritePicker?.render();
  experienceOverview?.favoritesChanged();
 },
 onResearchSynced:()=>experienceOverview?.researchUpdated()
});
experienceOverview=initOverviewResearchProgress({
 getFavorites:()=>favoriteManager.getFavorites()
});
assetFavoritePicker=initAssetFavoritePicker({
 getFavorites:()=>favoriteManager.getFavorites(),
 getSelected:()=>chosen,
 onSelect:symbol=>{void investigate(symbol);}
});
const favoritesReady=favoriteManager.initialize().then(()=>{
 assetFavoritePicker.render();
 // The native favorite list is now hydrated; queue independent read-only
 // per-favorite quality audits without visiting the Scenarios page.
 experienceOverview?.favoritesChanged();
 // Starts outside the Radar page; no page-open network kick-off.
 radarDashboard.start();
 if(document.body.dataset.view==='catalog')renderCatalog();
 const saved=favoriteManager.getFavorites();
 if(!saved.length){renderGlobalOverview(null);return;}
 if(!favoriteManager.hasFavorite(chosen)){
  // Persisted manual-only asset must not trigger automatic background work.
  chosen=saved[0];text('asset-name',chosen);el('asset-input').value=chosen;
 }
 if(document.body.dataset.view==='overview')void investigate(chosen);
});
/**
 * Cold-start notification intent survives WebView startup. A warm tap emits
 * an ApexNative event; either path consumes exactly one native target and
 * loads that exact Room scenario. Never infer the target from just a symbol.
 */
let notificationOpening=false,notificationOpenQueued=false;
function requestNotificationOpen(){
 notificationOpenQueued=true;
 if(notificationOpening)return;
 notificationOpening=true;
 void (async()=>{
  try{
   await favoritesReady;
   while(notificationOpenQueued){
    notificationOpenQueued=false;
    const target=await consumeMobileNotificationTarget();
    if(!target)continue;
    navigate('forecasts','forecast-notification-focus');
    await favoriteManager.openNotificationForecast(target);
   }
  }catch{
   // Native/Room unavailability must never replace a target with a guess.
  }finally{notificationOpening=false;}
 })();
}
void listenMobileNotificationOpen(requestNotificationOpen);
void favoritesReady.then(requestNotificationOpen).catch(()=>{});

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
  if(!catalog.length)void loadCatalog().catch(()=>{});
  el('asset-input').value='';
  catalogPage=1;
  renderCatalog();
 }
 if(view==='asset'){
  setAssetArea(assetAreaForEntry(targetId,lastAssetArea));
  assetFavoritePicker?.render();
 }
 if(view==='quality')setQualityArea(researchAreaForTarget(targetId));
 updateTab(view);
 requestAnimationFrame(()=>{
  if(view==='radar')radarDashboard.open();
  if(view==='asset'){
   const area=el('view-asset').dataset.assetArea;
   if(area==='chart'){
    candleView.resize();void refreshWhaleChart(chosen);
   }
   // Both chart and historical structure use the same completed candle data.
   void loadCandleHistory(false);
   void showAssetScenarios(chosen);
   if(area==='structure')void restoreMarketMatrix(chosen);
   // Native depth and onchain panels are only refreshed when opened.
   // Multi-TF market comparison remains explicitly user-initiated.
   if(area==='data'){
    void liquidityDashboard.refresh(chosen);
    void onChainDashboard.refresh(chosen);
    void whaleDashboard.refresh(chosen);
    void largeTradeDashboard.refresh(chosen);
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
   if(targetId==='forecast-feature-audit')
    el('forecast-feature-audit').open=true;
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
   experienceOverview?.openOverview();
   void editorialDashboard.openOverview();
   void freeSourceDashboard.openOverview();
  }
  if(view==='news'||view==='macro')void editorialDashboard.open(view);
  // Contextual entry must keep the flat task selector on screen.
  const node=view==='overview'?
   el('overview-favorites-anchor'):
   view==='quality'&&targetId==='forecast-feature-audit'?
    el('forecast-feature-audit'):
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
const insightTrack=el('forecast-insights-track');
const insightTabs=[...document.querySelectorAll('[data-insight-slide]')];
function updateInsightSlide(activeIndex){
 for(const button of insightTabs){
  const active=Number(button.dataset.insightSlide)===activeIndex;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-pressed',String(active));
 }
}
for(const button of insightTabs)button.addEventListener('click',()=>{
 const index=Number(button.dataset.insightSlide);
 const slide=insightTrack.querySelector('[data-insight-panel="'+index+'"]');
 if(!slide)return;
 updateInsightSlide(index);
 insightTrack.scrollTo({left:slide.offsetLeft-insightTrack.offsetLeft,behavior:'smooth'});
});
insightTrack.addEventListener('scroll',()=>{
 const slides=[...insightTrack.querySelectorAll('[data-insight-panel]')];
 const closest=slides.reduce((best,slide,index)=>{
  const distance=Math.abs(slide.getBoundingClientRect().left-
   insightTrack.getBoundingClientRect().left);
  return distance<best.distance?{index,distance}:best;
 },{index:0,distance:Infinity});
 updateInsightSlide(closest.index);
},{passive:true});

function markSelectedAsset(){
 favoriteManager.selectChanged();
 evidenceDashboard.refreshAssetChoices();
}
initCleanIntelligence();
initCleanIntelligenceMajor();
initCleanIntelligenceAssetHub();
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
 // Keep the newest verified public snapshot of each selected favorite.
 // A stale WS frame never masks the REST fallback, and Bybit stays archived.
 const currentRows=current?.symbol===chosen&&Array.isArray(current.depth)?
  current.depth:[];
 const inputRows=Array.isArray(snapshot?.depth)?snapshot.depth:[];
 const activeBooks=['binance','okx'].map(venue=>{
  const choices=[...currentRows,...inputRows,latestRestDepth.get(venue)];
  if(depthStream?.isFresh(venue))choices.push(latestLiveDepth.get(venue));
  return choices.filter(b=>b?.venue===venue&&b.symbol===chosen&&
   Number.isSafeInteger(b.receivedAt))
   .sort((a,b)=>b.receivedAt-a.receivedAt)[0];
 }).filter(Boolean);
 // Drive the two liquidity columns from the same verified books shown above,
 // not only from periodically saved Room checkpoints.
 if(document.body.dataset.view==='asset'&&
  el('view-asset').dataset.assetArea==='data')
  liquidityDashboard.setVisibleBooks(chosen,activeBooks);
 const matched=selectDepthComparison(activeBooks,
  ['binance','okx'].map(venue=>latestRestDepth.get(venue)).filter(Boolean),{
   asset:chosen,now:Date.now()
  });
 const comparison=matched.comparison;
 const syncStatus=el('depth-sync-status');
 if(syncStatus){
  syncStatus.dataset.state=comparison.state;
  const stamps='Binance '+(comparison.binanceAt?time(comparison.binanceAt):'—')+
   ' · OKX '+(comparison.okxAt?time(comparison.okxAt):'—');
  syncStatus.textContent=comparison.state==='SYNCED'?
   'Сопоставлены по времени получения (до 3 сек)'+
   (matched.method==='PAIRED_REST'?
    (matched.levelsEqual?' · парный REST 50/50 уровней':' · парные REST-снимки'):
    ' · доступные WS/REST-снимки')+'. '+
   'Общая полоса ±'+fmt(comparison.commonBandBps,1)+' б.п. · '+
   'Binance '+fmt(comparison.binanceImbalancePct,1)+'% / OKX '+
    fmt(comparison.okxImbalancePct,1)+'% · разница '+
    fmt(comparison.differencePctPoints,1)+' п.п. · '+stamps+
    '. Это не подтверждает одновременность на биржах.':
   'Сравнение недоступно · '+comparison.reason+
    (comparison.lagMs!==null?' · разница '+comparison.lagMs+' мс':'')+
    ' · '+stamps+'. Проценты не сопоставляем.';
 }
 if(!activeBooks.length){
  list.append(create('p','muted','Публичные стаканы сейчас недоступны.'));
  return;
 }
 for(const item of activeBooks){
  const row=create('div','source-line');
  const content=create('div');
  content.append(
   create('b','',item.venue==='binance'?'Binance Spot':item.venue==='okx'?'OKX Spot':'Источник Spot'),
   create('small','', 'Bid '+fmt(item.bestBid)+' · Ask '+fmt(item.bestAsk)),
   create('small','', 'Видимый дисбаланс: '+fmt(item.visibleDepthImbalance*100,1)+'%'+
    ' · Спред '+fmt(item.spreadBps,2)+' б.п.'),
   create('small','',item.collectionMethod==='PUBLIC_WS_BOOK_SNAPSHOT'?
    'WebSocket · до '+item.snapshotLevelsMax+' уровней на сторону':
    'REST · ограниченный проверенный снимок')
  );
  const age=Date.now()-item.receivedAt;
  const fresh=age>=0&&age<(item.collectionMethod==='PUBLIC_WS_BOOK_SNAPSHOT'?
   12000:180000);
  row.append(content,create('span','source-state '+(fresh?'ok':'fail'),
   (fresh?'Свежий ':'Архив ')+time(item.receivedAt)));
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
 const live=globalMarketSnapshot(context,{now:Date.now()});
 if(live.state==='OK')overviewCache.saveGlobal(live);
 const saved=overviewCache.readGlobal();
 const useCache=live.state!=='OK'&&Boolean(saved);
 const view=useCache?{...saved.value,state:'STALE',
  reason:'Сохранённая сводка CoinGecko · нет свежего подтверждённого ответа'}:live;
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
  (useCache?'Сохранено на устройстве · ':'По времени CoinGecko: ')+time(view.observedAt)+
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
 lastVerifiedTickerAt=Number.isSafeInteger(snapshot.ticker?.observedAt)?
  snapshot.ticker.observedAt:0;
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
 if(changed){fastTickerAt=0;lastVerifiedTickerAt=0;}
 if(changed){
  depthController?.abort();depthStream?.stop();latestLiveDepth.clear();latestRestDepth.clear();
  const streamLabel=el('depth-stream-status');
  if(streamLabel){
   delete streamLabel.dataset.binance;
   delete streamLabel.dataset.okx;
   streamLabel.textContent='Открывайте «Данные» избранного актива для потоковых снимков.';
  }
 }
 if(changed){
  newsM5Panel.reset();
  scenarioRequest++;
  drawnCandleAsset='';drawnCandleInterval='';
  replayScenarioId=null;replayStep=0;
  candleView.setData([]);candleView.setReplayCursor(null);
  candleView.setWhaleEvents(symbol,[]);
  whaleChartQuery++;refreshBlockStatus();
  lastScenarioRows=[];lastScenarioAsset='';lastScenarioFetchedAt=0;
  focusedScenarioId=null;
  candleView.setScenarios([]);
  resetMarketMatrix('Актив изменён · загружаем сохранённые горизонты.',symbol);
 }
 chosen=symbol;
 assetFavoritePicker?.render();
 if(changed)renderPassportResearchQuality(null);
 if(changed){
  liquidityDashboard.clear(symbol);
  onChainDashboard.clear(symbol);
  whaleDashboard.clear(symbol);
  largeTradeDashboard.clear(symbol);
 }
 markSelectedAsset();
 if(changed&&document.body.dataset.view==='asset'){
  void loadCandleHistory(true);
  if(el('view-asset').dataset.assetArea==='data'){
   void loadAssetSocial(symbol);
   // When the user changes an asset while Data is already visible,
   // trigger the same network source check as when opening the tab.
   void onChainDashboard.refresh(symbol);
   void whaleDashboard.refresh(symbol);
   void largeTradeDashboard.refresh(symbol);
  }
 }
 text('asset-name',chosen);
 el('asset-input').value=chosen;
 if(document.body.dataset.view==='asset'){
  void showAssetScenarios(chosen);
  if(el('view-asset').dataset.assetArea==='chart')
   void refreshWhaleChart(chosen);
 }
 if(changed){text('market-price','—');text('market-change','24 ч: —');}
 text('top-status','Обновление…');
 if(changed)text('updated-at','Запрос публичных источников…');
 text('active-sources','—');text('layer-coverage','—');
 text('hero-coverage','Покрытие: ожидание данных');
 text('context-status','—');
 text('quote-volume','—');text('ticker-time','—');
 if(changed){
  clear(el('depth-list'));clear(el('source-list'));clear(el('missing-layers'));
  freeSourceDashboard.setContext(chosen,null);
  freeSourceDashboard.setSnapshot(chosen,null);
  freeSourceDashboard.setSocial(chosen,null);
 }
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
  liquidityDashboard.setSourceStatuses(chosen,snapshot.sources);
  renderContext(context);
  freeSourceDashboard.setSnapshot(chosen,snapshot);
  freeSourceDashboard.setContext(chosen,context);
  // Persist only actual successful source observations in the phone's Room DB.
  const persisted=await saveMobileSnapshot(snapshot);
  if(active!==pending)return;
  // This full request already sampled the two books. Do not repeat it.
  for(const venue of ['binance','okx']){
   const seen=snapshot.sources.find(row=>row.id===venue+'-depth');
   if(seen)foregroundDepthPolicy.record(chosen,venue,seen.state);
  }
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
/**
 * Selected favorite, visible Android asset screen only.
 * Depth-only GETs, at most once a minute per provider with failure backoff.
 * Android may pause WebView timers; this is not a background service.
 */
async function refreshVisibleDepth(){
 if(depthBusy||controller||document.hidden||
  document.body.dataset.view!=='asset'||
  !favoriteManager.hasFavorite(chosen)||
  !hasMobileObservationStorage())return;
 const symbol=chosen;
 const allowed=Object.fromEntries(['binance','okx'].map(venue=>[
  venue,foregroundDepthPolicy.allowed(symbol,venue,{
   visible:true,favorite:true,native:true,busy:false}).allowed
 ]));
 // One fresh snapshot is usable for each source separately.
 // A paired 50/50 REST request is warranted whenever BOTH provider slots
 // are independently due and the best WS/REST pair lacks comparability.
 // This covers a working Binance WS with a resting OKX REST snapshot.
 const depthChoices=['binance','okx'].map(venue=>
  depthStream?.isFresh(venue)?
   latestLiveDepth.get(venue):latestRestDepth.get(venue)).filter(Boolean);
 const pairedRest=el('view-asset').dataset.assetArea==='data'&&
  needsMatchedRest(depthChoices,{asset:symbol,now:Date.now(),due:allowed});
 const due=pairedRest?['binance','okx']:
  ['binance','okx'].filter(venue=>
   !depthStream?.isFresh(venue)&&allowed[venue]);
 if(!due.length)return;
 const seq=pending;
 depthBusy=true;
 const local=new AbortController();
 depthController=local;
 const deadline=setTimeout(()=>local.abort(),8000);
 let recorded=false;
 try{
  const sample=await collectVisibleDepth(symbol,{
   venues:due,signal:local.signal,now:()=>Date.now(),
   equalLevels:pairedRest?50:null});
  if(!local.signal.aborted){
   for(const venue of due){
    const reply=sample.sources.find(row=>row.id===venue+'-depth');
    foregroundDepthPolicy.record(symbol,venue,reply?.state||'OFFLINE');
   }
   recorded=true;
  }
  // Show provider status and independent backoff, including when the
  // response has no valid book and therefore does not add a Room sample.
  if(recorded&&seq===pending&&chosen===symbol&&
   favoriteManager.hasFavorite(symbol)){
   const retryAt=Object.fromEntries(due.map(venue=>{
    const allowed=foregroundDepthPolicy.allowed(symbol,venue,{
     visible:true,favorite:true,native:true,busy:false});
    return [venue,allowed.nextAt||null];
   }));
   liquidityDashboard.setSourceStatuses(symbol,sample.sources,retryAt);
  }
  // Save operational outcomes only for real completed GETs while this
  // selected favorite still owns the response. Never count cached data,
  // cancellations, or replayed UI updates as additional API attempts.
  if(recorded&&seq===pending&&chosen===symbol&&
   favoriteManager.hasFavorite(symbol))
   freeSourceDashboard.recordSpotDepthResults(symbol,sample.sources);
  if(local.signal.aborted||document.hidden||controller||
   seq!==pending||chosen!==symbol||
   !favoriteManager.hasFavorite(symbol))return;
  // Room receives only successfully validated actual book snapshots.
  if(sample.depth.length){
   for(const book of sample.depth)
    if(book?.symbol===symbol&&
     (book.venue==='binance'||book.venue==='okx'))
     latestRestDepth.set(book.venue,book);
   if(el('view-asset').dataset.assetArea==='data')
    renderDepth(sample);
   const saved=await saveMobileSnapshot(sample);
   if(!saved.native||saved.saved<1)return;
  }
  if(local.signal.aborted||document.hidden||controller||
   seq!==pending||chosen!==symbol||
   !favoriteManager.hasFavorite(symbol))return;
  if(el('view-asset').dataset.assetArea==='data')
   void liquidityDashboard.refresh(symbol);
 }catch{
  if(!recorded&&!local.signal.aborted)for(const venue of due)
   foregroundDepthPolicy.record(symbol,venue,'OFFLINE');
 }finally{
  clearTimeout(deadline);
  if(depthController===local)depthController=null;
  depthBusy=false;
 }
}

/** A cached quote is never displayed as fresh after its provider time expires. */
function refreshQuoteAge(checkState=''){
 if(document.body.dataset.view!=='asset')return;
 const now=Date.now(),age=lastVerifiedTickerAt?now-lastVerifiedTickerAt:Infinity;
 if(age>90000||age< -60000){
  el('market-price').classList.add('is-stale');
  text('updated-at',lastVerifiedTickerAt?
   'Цена: '+time(lastVerifiedTickerAt)+' · ИСТОРИЯ / нет свежего подтверждения'+
    (checkState?' · '+checkState:''):
   'Цена: свежие данные не подтверждены'+(checkState?' · '+checkState:''));
 }else{
  el('market-price').classList.remove('is-stale');
  text('updated-at','Цена: '+time(lastVerifiedTickerAt)+' · Binance Spot'+
   (checkState?' · последняя попытка '+checkState:''));
 }
}
// Visible-asset quote and depth cadence; no background polling.
async function refreshVisibleQuote(){
 if(document.hidden||document.body.dataset.view!=='asset'||
  !favoriteManager.hasFavorite(chosen)||fastTickerBusy||controller||!chosen||
  Date.now()-fastTickerAt<30000)return;
 const symbol=chosen;
 fastTickerAt=Date.now();
 fastTickerBusy=true;
 const local=new AbortController();
 const deadline=setTimeout(()=>local.abort(),8000);
 try{
  const result=await fetchSpotTicker(symbol,{now:()=>Date.now(),
   signal:local.signal});
  if(document.hidden||symbol!==chosen)return;
  if(result.state!=='OK'||!result.data){
   refreshQuoteAge(result.state||'OFFLINE');
   return;
  }
  const ticker=result.data;
  lastVerifiedTickerAt=ticker.observedAt;
  text('market-price',fmt(ticker.price)+' USDT');
  text('market-change','24 ч: '+(ticker.changePercent>0?'+':'')+
   fmt(ticker.changePercent,2)+'%');
  el('market-change').className='delta'+
   (ticker.changePercent>0?' positive':
    ticker.changePercent<0?' negative':'');
  text('ticker-time',time(ticker.observedAt));
  refreshQuoteAge();
 }catch{
  // Keep the last validated price only as a clearly timestamped archive.
  if(symbol===chosen)refreshQuoteAge('OFFLINE');
 }finally{clearTimeout(deadline);fastTickerBusy=false;}
}
setInterval(()=>{
 if(document.hidden)return;
 refreshQuoteAge();
 if(document.body.dataset.view==='asset'&&
  el('view-asset').dataset.assetArea==='data'&&
  favoriteManager.hasFavorite(chosen))
  renderDepth({depth:[]}); // Expire a previously matched pair even when WS stalls.
 if(document.body.dataset.view==='asset'&&favoriteManager.hasFavorite(chosen)){
  syncDepthStreams();
  largeTradeDashboard.sync();
  largeTradeDashboard.tick();
  if(!controller&&lastLoad&&Date.now()-lastLoad>10*60000)
   void investigate(chosen);
  else {
   void refreshVisibleQuote();
   void refreshVisibleDepth();
  }
 }
},15000);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  depthController?.abort();
  depthStream?.stop();
  largeTradeDashboard.sync();
  return;
 }
 if(document.body.dataset.view==='asset'&&favoriteManager.hasFavorite(chosen)){
  syncDepthStreams();
  largeTradeDashboard.sync();
  if(!controller&&lastLoad&&Date.now()-lastLoad>10*60000)
   void investigate(chosen);
  else {
   void refreshVisibleQuote();
   void refreshVisibleDepth();
  }
 }
 favoriteManager.resume();
});
// Catalogue requires explicit user navigation; never scan all pairs on startup.
renderGlobalOverview(null);
setInterval(()=>{if(!document.hidden)favoriteManager.resume();},60000);
