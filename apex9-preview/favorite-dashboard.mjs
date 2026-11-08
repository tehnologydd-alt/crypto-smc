/**
 * APEX Android First — dynamic on-device favorites and automatic research journal.
 * User selects up to 10 assets; no UI for manually authoring predictions.
 * Sync is foreground and (when opted-in) via Android WorkManager.
 */
import {getMobileFavorites,changeMobileFavorite,
 syncMobileFavoriteResearch,getMobileResearchForecasts,getMobileCandles} from './mobile-bridge.mjs';
import {sanitizeFavorites,journalCounts,forecastStage,
 FORECAST_STAGES,FORECAST_STAGE_LABELS,FAVORITES_MAX} from './favorite-logic.mjs';
import {attachSparkline} from './sparkline.mjs';
import {journalObservedStats} from './journal-stats.mjs';
import {inspectResearchTimeline} from './research-timeline.mjs';

const id=name=>document.getElementById(name);
const create=(tag,className='',value)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
const clear=node=>{while(node.firstChild)node.removeChild(node.firstChild);};
const fmt=(num,digits=6)=>Number.isFinite(num)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(num):'—';
const date=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString('ru-RU'):'—';
const coinNames={
 BTC:['Bitcoin','₿'],ETH:['Ethereum','◆'],GRAM:['Gram','◇'],SOL:['Solana','≋']
};
function formatRemaining(ms){
 if(!Number.isFinite(ms)||ms<0)return '—';
 const minutes=Math.ceil(ms/60000),hours=Math.floor(minutes/60);
 return hours?hours+' ч '+(minutes%60)+' мин':minutes+' мин';
}
function timelineForForecast(row){
 const trace=inspectResearchTimeline(row,{now:Date.now()});
 const panel=create('section','research-timeline');
 panel.setAttribute('aria-label','История зафиксированных этапов сценария');
 const heading=create('div','research-timeline-heading');
 heading.append(create('strong','', 'История наблюдений'),
  create('span','',trace.state==='INVALID'?'Проверка записи':
   trace.verifiedSteps+' из 4 зафиксировано'));
 panel.append(heading);
 if(trace.state==='INVALID'){
  panel.append(create('p','research-timeline-warning',
   'Исходная гипотеза не прошла проверку. Этапы не отображаются.'));
  return {panel,trace};
 }
 const steps=create('ol','research-timeline-steps');
 for(const step of trace.steps){
  const list=create('li','research-timeline-step '+(step.observed?'observed':'unobserved'));
  const mark=create('span','research-step-mark',step.observed?'✓':'·');
  mark.setAttribute('aria-hidden','true');
  const item=create('div','research-step-body');
  item.append(create('strong','',step.title),
   create('span','',step.observed?date(step.at):
    'Подтверждённого события пока нет'));
  if(step.observed&&step.recordedAt-step.at>60000){
   item.append(create('small','',
    'Записано на устройство: '+date(step.recordedAt)));
  }
  list.append(mark,item);steps.append(list);
 }
 panel.append(steps);
 const status=create('p','research-timeline-note');
 if(trace.state==='INCONSISTENT_RESULT'){
  status.textContent='Сохранённый итог противоречит исходному исследованию — не включён в статистику.';
  status.classList.add('warning');
 }else if(trace.state==='DUE_UNVERIFIED'){
  status.textContent='Четырёхчасовой горизонт уже прошёл. Итог не проверен: ожидаем исходные закрытые свечи.';
  status.classList.add('warning');
 }else if(trace.state==='EVALUATED'){
  status.textContent='Итог проверен по четвёртому завершённому H1-закрытию.';
 }else{
  status.textContent='До конца исследовательского горизонта: '+
   formatRemaining(trace.remainingMs)+
   '. Срок сам по себе не означает подтверждение или завершение.';
 }
 panel.append(status);
 return {panel,trace};
}
function cardForForecast(row,{tracked,onToggle,onOpen,getMini}={}){
 const card=create('article','forecast-record');
 const headActions=create('div','forecast-card-actions');
 const follow=create('button','forecast-follow',tracked?'★ Отмечен':'☆ Наблюдать');
 follow.type='button';follow.setAttribute('aria-pressed',tracked?'true':'false');
 follow.addEventListener('click',()=>onToggle?.(row.id));
 const open=create('button','forecast-open','Паспорт '+row.asset);
 open.type='button';open.addEventListener('click',()=>onOpen?.(row.asset));
 headActions.append(follow,open);
 const stage=forecastStage(row);
 let data=null;
 try{data=JSON.parse(row.hypothesis);}catch{}
 const head=create('div','forecast-record-head');
 const heading=create('div');
 heading.append(create('strong','',row.asset+' · H1'),
  create('small','', 'Наблюдение по эмпирическому диапазону'));
 head.append(heading,create('span','forecast-state '+stage.toLowerCase(),
  FORECAST_STAGE_LABELS[stage]));
 card.append(head,headActions);
 const chart=create('div','forecast-mini-chart');
 chart.dataset.sparkSymbol=row.asset;
 card.append(chart);
 getMini?.(row.asset,chart);
 if(!data||typeof data.bandLow!=='number'||typeof data.bandHigh!=='number'){
  card.append(create('p','muted','Исходная запись требует проверки формата.'));
  return card;
 }
 card.append(create('div','forecast-band',
  fmt(data.bandLow)+' — '+fmt(data.bandHigh)+' USDT'));
 const rows=create('div','forecast-info');
 for(const [label,value] of [
  ['Опубликован',date(row.publishedAt)],
  ['Начальная цена',fmt(data.anchorClose)+' USDT'],
  ['Срок проверки',date(data.targetCloseAt)],
  ['Источник','Binance Spot · закрытые H1']]){
  const line=create('div','data-row');
  line.append(create('span','',label),create('strong','',value));
  rows.append(line);
 }
 card.append(rows);
 const {panel:progress,trace}=timelineForForecast(row);
 card.append(progress);
 if(trace.result){
  card.append(create('div','forecast-result',
   (trace.result.outcome==='WITHIN_RANGE'?
    'Итоговое закрытие внутри опубликованного диапазона':
    'Итоговое закрытие вне опубликованного диапазона')+
   ' · '+fmt(trace.result.actualClose)+' USDT · '+date(trace.result.evaluatedAt)));
 }
 return card;
}
export function initFavoriteResearch({getSelectedSymbol,onSelectSymbol,onForecastStage}){
 let favorites=[],native=false,busy=false,syncing=false,lastSyncAt=0,
  stage='PENDING_CONFIRMATION',stageTouched=false,journalMode='all',journalGeneration=0,
  lastRows=[],lastTotal=0;
 const MINI_CACHE=new Map(),MINI_LOADING=new Set();
 let selected=new Set();
 try{
  const stored=JSON.parse(localStorage.getItem('apex9_selected_research_ids_v1')||'[]');
  if(Array.isArray(stored))selected=new Set(stored.filter(x=>typeof x==='string').slice(0,300));
 }catch{}
 const persistSelected=()=>{
  try{localStorage.setItem('apex9_selected_research_ids_v1',
   JSON.stringify([...selected].slice(-300)));}catch{}
 };
 function renderMini(symbol,slot){
  if(MINI_CACHE.has(symbol)){attachSparkline(slot,MINI_CACHE.get(symbol));return;}
  attachSparkline(slot,[]);
  if(MINI_LOADING.has(symbol))return;
  MINI_LOADING.add(symbol);
  void getMobileCandles(symbol,'1h',60).then(r=>{
   MINI_CACHE.set(symbol,r.candles||[]);
   const nodes=document.querySelectorAll('[data-spark-symbol]');
   for(const n of nodes)
    if(n.dataset.sparkSymbol===symbol)attachSparkline(n,MINI_CACHE.get(symbol));
  }).catch(()=>MINI_CACHE.set(symbol,[]))
   .finally(()=>MINI_LOADING.delete(symbol));
 }
 const status=text=>{id('favorite-selection-status').textContent=text;};
 function renderFavorites(){
  const rail=id('favorite-rail');clear(rail);
  id('favorites-count').textContent=favorites.length+' / '+FAVORITES_MAX;
  id('forecast-favorites-count').textContent=favorites.length+' / '+FAVORITES_MAX;
  if(!favorites.length){
   rail.append(create('p','muted',native
    ?'Избранное пока пусто. Найдите интересующий актив и нажмите «☆ Добавить в избранное».'
    :'Избранное хранится в Android-приложении.'));
  }else for(const symbol of favorites){
   const wrapper=create('div','asset-chip favorite-card');
   wrapper.setAttribute('role','listitem');
   if(symbol===getSelectedSymbol())wrapper.classList.add('selected');
   const open=create('button','favorite-open');
   open.type='button';open.dataset.symbol=symbol;
   open.setAttribute('aria-label','Исследовать '+symbol);
   const token=symbol.replace(/(USDT|USDC|BTC|ETH|EUR)$/,'');
   const [label,mark]=coinNames[token]||[token,token.slice(0,1)];
   const icon=create('span','coin-mark '+token.toLowerCase(),mark);
   const labels=create('span','favorite-names');
   labels.append(create('strong','',label),create('small','',symbol));
   open.append(icon,labels);
   const spark=create('span','favorite-chart');
   spark.dataset.sparkSymbol=symbol;
   wrapper.append(spark);
   renderMini(symbol,spark);
   wrapper.addEventListener('click',(e)=>{
    if(e.target?.closest?.('.favorite-remove'))return;
    onSelectSymbol(symbol);
   });
   const remove=create('button','favorite-remove','×');
   remove.type='button';
   remove.setAttribute('aria-label','Удалить '+symbol+' из избранного');
   remove.addEventListener('click',()=>void updateFavorite(symbol,false));
   wrapper.append(open,remove);rail.append(wrapper);
  }
  const selected=favorites.includes(getSelectedSymbol());
  const toggle=id('favorite-toggle');
  toggle.disabled=!native||busy||(!selected&&favorites.length>=FAVORITES_MAX);
  toggle.textContent=selected?'★ Убрать из избранного':
   favorites.length>=FAVORITES_MAX?'Максимум 10 активов':'☆ Добавить в избранное';
  toggle.setAttribute('aria-pressed',selected?'true':'false');
  status(native?'Избрано '+favorites.length+' из '+FAVORITES_MAX+
   ' · сохраняется на Android-телефоне':
   'Android-хранилище недоступно. Избранное не сохраняется в веб-просмотре.');
 }
 async function updateFavorite(symbol,add){
  if(!native||busy)return;
  busy=true;renderFavorites();
  try{
   const result=await changeMobileFavorite(symbol,add);
   favorites=sanitizeFavorites(result.favorites);
   renderFavorites();
   await loadJournal();
   if(add)void sync(true);
  }catch(e){
   status('Не удалось изменить избранное: '+String(e?.message||e));
  }finally{
   busy=false;renderFavorites();
  }
 }
 function renderStats(){
  const stats=journalObservedStats(lastRows,{
   selectedIds:[...selected],totalPublished:lastTotal,now:Date.now()
  });
  for(const [name,value] of [['all',stats.all],['tracked',stats.tracked]]){
   const slot=id('forecast-stat-'+name);slot.replaceChildren();
   const line=create('div','forecast-stat-line');
   for(const [label,n] of [
    ['Всего',value.total],['В работе',value.waiting+value.confirmed+value.active],
    ['Завершено',value.completed],['Подтверждён итог',value.verifiedOutcomes],
    ['В диапазоне',value.within],['Вне диапазона',value.outside],
    ['Ждут данных',value.unverifiedDue],['Сомнительные записи',value.inconsistent]
   ]){
    const node=create('div','forecast-stat-value');
    node.append(create('span','',label),create('strong','',fmt(n,0)));line.append(node);
   }
   slot.append(create('h4','',name==='all'?'Все наблюдения':'Отмеченные пользователем'),line);
   if(stats.truncated)slot.append(create('p','muted',
     'Общий архив больше открытых 75 записей: эта сводка относится только к загруженной части журнала.'));
   else slot.append(create('p','muted',
     'Засчитываются только согласованные с исходной гипотезой итоги. Срок без свечей — не отмена и не успех.'));
  }
 }
 function renderRows(){
  const box=id('research-forecast-list');box.replaceChildren();
  for(const b of document.querySelectorAll('[data-journal-stage]')){
   const on=b.dataset.journalStage===stage;
   b.classList.toggle('active',on);
   b.setAttribute('aria-pressed',on?'true':'false');
  }
  for(const b of document.querySelectorAll('[data-forecast-mode]')){
   const on=b.dataset.forecastMode===journalMode;
   b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on?'true':'false');
  }
  const visible=lastRows.filter(row=>forecastStage(row)===stage&&
   (journalMode==='all'||selected.has(row.id)));
  if(!visible.length){
   box.append(create('p','muted',journalMode==='tracked'?
    'Пока нет отмеченных сценариев на выбранном этапе. Отметьте нужный сценарий на вкладке «Все».':
    'На этом этапе пока нет сохранённых наблюдений.'));
  }else for(const row of visible){
   box.append(cardForForecast(row,{
    tracked:selected.has(row.id),
    onToggle:key=>{
     if(selected.has(key))selected.delete(key);else selected.add(key);
     persistSelected();renderStats();renderRows();
    },
    onOpen:onSelectSymbol,getMini:renderMini
   }));
  }
  renderStats();
 }
 async function loadJournal(){
  const seq=++journalGeneration;
  const data=await getMobileResearchForecasts(75);
  if(seq!==journalGeneration)return;
  if(!data.native||data.error){
   lastRows=[];lastTotal=0;
   for(const x of FORECAST_STAGES)id('stage-count-'+x).textContent='0';
   id('forecast-pending-count').textContent='—';
   id('forecast-evaluated-count').textContent='—';
   renderRows();
   id('research-forecast-list').replaceChildren(create('p','muted',
    data.error?'Локальный журнал недоступен: '+data.error:
    'Журнал исследований доступен в Android APK.'));
   return;
  }
  lastRows=Array.isArray(data.forecasts)?data.forecasts:[];
  lastTotal=data.publishedCount||lastRows.length;
  const counts=journalCounts(lastRows);
  for(const [x,num] of Object.entries(counts))
   id('stage-count-'+x).textContent=String(num);
  id('forecast-pending-count').textContent=fmt(counts.PENDING_CONFIRMATION+counts.CONFIRMED+counts.ACTIVE,0);
  id('forecast-evaluated-count').textContent=fmt(data.evaluatedCount,0);
  if(!stageTouched&&!counts.PENDING_CONFIRMATION){
   stage=counts.CONFIRMED?'CONFIRMED':counts.ACTIVE?'ACTIVE':
    counts.COMPLETED?'COMPLETED':'PENDING_CONFIRMATION';
  }
  for(const b of document.querySelectorAll('[data-forecast-stage]')){
   const on=b.dataset.forecastStage===stage;
   b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');
  }
  renderRows();
 }
 function getScenarioRows(asset){
  return lastRows.filter(x=>x.asset===asset&&
   ['PENDING_CONFIRMATION','CONFIRMED','ACTIVE'].includes(forecastStage(x)));
 }
 function message(text,error=false){
  const node=id('forecast-action-status');
  node.textContent=text;node.classList.toggle('is-offline',error);
 }
 async function sync(force=false){
  if(document.hidden||syncing||!native||favorites.length===0)return;
  if(!force&&lastSyncAt&&Date.now()-lastSyncAt<15*60*1000)return;
  syncing=true;lastSyncAt=Date.now();
  message('APEX исследует избранные активы и проверяет состояния прогнозов…');
  try{
   const result=await syncMobileFavoriteResearch();
   if(result.error)throw Error(result.error);
   const created=result.reports.filter(x=>x.state==='CREATED').length;
   const missing=result.reports.filter(x=>[
    'ERROR','SOURCE_UNAVAILABLE','STALE','GAP','INVALID','INSUFFICIENT'
   ].includes(x.state));
   message('Проверено активов: '+result.checked+
    (created?' · новых гипотез: '+created:' · новых гипотез нет')+
    (missing.length?' · данных недостаточно для '+missing.length+
     ' активов.':' · наблюдения сохранены на устройстве.'));
  }catch(e){
   message('Проверка избранного: '+String(e?.message||e),true);
  }finally{syncing=false;await loadJournal();}
 }
 for(const button of document.querySelectorAll('[data-forecast-stage]')){
  button.addEventListener('click',()=>{
   stageTouched=true;stage=button.dataset.forecastStage;
   onForecastStage?.(stage);
   renderRows();
  });
 }
 for(const button of document.querySelectorAll('[data-journal-stage]')){
  button.addEventListener('click',()=>{
   stage=button.dataset.journalStage;stageTouched=true;renderRows();
  });
 }
 for(const button of document.querySelectorAll('[data-forecast-mode]')){
  button.addEventListener('click',()=>{
   journalMode=button.dataset.forecastMode;renderRows();
  });
 }
 id('favorite-toggle').addEventListener('click',()=>{
  const symbol=getSelectedSymbol();
  void updateFavorite(symbol,!favorites.includes(symbol));
 });
 renderFavorites();
 return {
  async initialize(){
   const result=await getMobileFavorites();
   native=result.native;favorites=sanitizeFavorites(result.favorites);
   renderFavorites();await loadJournal();
   void sync(true);
  },
  selectChanged(){renderFavorites();},
  openForecasts(){void loadJournal();void sync(false);},
  resume(){void sync(false);},
  getFavorites:()=>[...favorites],
  getScenarioRows,
  refreshJournal:loadJournal,
  renderMini,
  openOverviewSummary:()=>void loadJournal()
 };
}
