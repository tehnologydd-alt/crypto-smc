/**
 * APEX Android First — dynamic on-device favorites and automatic research journal.
 * User selects up to 10 assets; no UI for manually authoring predictions.
 * Sync is foreground and (when opted-in) via Android WorkManager.
 */
import {getMobileFavorites,changeMobileFavorite,
 syncMobileFavoriteResearch,getMobileResearchForecasts,getMobileCandles,
 getMobileCandleArchive} from './mobile-bridge.mjs';
import {sanitizeFavorites,journalCounts,forecastStage,
 FORECAST_STAGES,FORECAST_STAGE_LABELS,FAVORITES_MAX} from './favorite-logic.mjs';
import {attachSparkline} from './sparkline.mjs';
import {journalObservedStats} from './journal-stats.mjs';
import {inspectResearchTimeline} from './research-timeline.mjs';
import {planResearchLevels,analyzeResearchLevelSequence} from './research-level-sequence.mjs';
import {displayPair,priceText,stagePresentation,
 observedLevelSummary,scenarioCopyText,SIDE_LABEL} from './forecast-card-ux.mjs';
import {readRadarChanges} from './radar-changes.mjs';
import {getFavoriteRadarNotices,summarizeFavoriteRadar} from './favorite-radar.mjs';
import {bindFavoriteHoldSwipe} from './favorite-gesture.mjs';

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

const H1_ARCHIVE=new Map(),H1_INFLIGHT=new Map();
async function sourceH1(asset){
 const existing=H1_ARCHIVE.get(asset);
 if(existing&&Date.now()-existing.at<45000)return existing.data;
 if(H1_INFLIGHT.has(asset))return H1_INFLIGHT.get(asset);
 const request=getMobileCandleArchive(asset,'1h',{maxRows:4800})
  .then(data=>{
   if(data.native&&data.complete&&!data.error)
    H1_ARCHIVE.set(asset,{at:Date.now(),data});
   return data;
  }).finally(()=>H1_INFLIGHT.delete(asset));
 H1_INFLIGHT.set(asset,request);
 return request;
}
const LEVEL_LABEL={tp1:'TP1',tp2:'TP2',tp3:'TP3',sl:'SL'};
const LEVEL_STATE={
 TP1_FIRST:'Первым наблюдался TP1',
 SL_FIRST:'Первым наблюдался защитный SL',
 SAME_H1_UNKNOWN:'TP1 и SL в одной H1 · порядок неизвестен',
 PUBLICATION_HOUR_UNKNOWN:'Касание в первом H1 · время относительно публикации неизвестно',
 NO_HITS:'Касаний уровней пока нет'
};
function renderLevelSequence(row){
 const container=create('section','forecast-level-study');
 container.setAttribute('aria-label',
  'Исторические контрольные уровни и последовательность касаний');
 const audit=planResearchLevels(row,{now:Date.now()});
 if(audit.state!=='READY'){
  container.append(create('p','forecast-level-warning',
   'Уровни не показаны: '+audit.reason));
  return container;
 }
 const plan=audit.plan;
 const heading=create('div','forecast-level-heading');
 heading.append(create('strong','','Контрольные точки · H1'),
  create('span','forecast-level-origin',
   plan.origin==='PUBLISHED'?'Сохранены при публикации':'Восстановлены из диапазона'));
 container.append(heading);
 const anchor=create('div','forecast-level-reference');
 anchor.append(create('span','','Опорная цена (не подтверждённый вход)'),
  create('strong','',fmt(plan.entry)+' USDT'));
 container.append(anchor);
 const sides=create('div','forecast-level-sides');
 for(const [key,label] of [['UP','Условно вверх'],['DOWN','Условно вниз']]){
  const card=create('div','forecast-level-side');
  card.append(create('strong','forecast-level-side-title',label));
  for(const [label,price] of [
   ['TP1',plan[key].tp1],['TP2',plan[key].tp2],
   ['TP3',plan[key].tp3],['SL',plan[key].sl]]){
   const line=create('div','forecast-level-line');
   line.append(create('span','',label),create('strong','',fmt(price)));
   if(label==='SL')line.classList.add('is-protective');
   card.append(line);
  }
  sides.append(card);
 }
 container.append(sides);
 const disclaimer=create('p','forecast-level-note',
  plan.origin==='PUBLISHED'?
   'Это заранее зафиксированные условные уровни двух направлений, а не '+
   'торговый сигнал или биржевой ордер.':
   'Старая гипотеза не содержала TP/SL и направления. Уровни '+
   'реконструированы задним числом, не считаются результатом прогноза.');
 container.append(disclaimer);
 const action=create('button','forecast-level-check','Проверить порядок касаний H1');
 action.type='button';
 action.setAttribute('aria-label',
  'Проверить историческую последовательность уровней '+row.asset);
 const output=create('div','forecast-level-outcome');
 output.setAttribute('role','status');
 output.setAttribute('aria-live','polite');
 action.addEventListener('click',async()=>{
  if(action.disabled)return;
  action.disabled=true;
  output.replaceChildren(create('p','forecast-level-note',
   'Сверяем закрытые H1-свечи исходного локального архива…'));
  try{
   const archive=await sourceH1(row.asset);
   if(!container.isConnected)return;
   output.replaceChildren();
   if(!archive.native||archive.error||!archive.complete){
    output.append(create('p','forecast-level-warning',
     archive.error||'Недоступен полный проверенный архив H1; касания не засчитываются.'));
    return;
   }
   const result=analyzeResearchLevelSequence(plan,archive.candles,{now:Date.now()});
   if(result.state==='INVALID'||result.state==='NEEDS_DATA'){
    output.append(create('p','forecast-level-warning',
     result.reason||'Не удалось проверить всю необходимую H1-историю.'));
    return;
   }
   output.append(create('p','forecast-level-note',
    'Проверено завершённых H1-часов: '+
    fmt(result.observedHours,0)+' / 4. '+
    (result.complete?'Горизонт завершён.':'Наблюдение продолжается.')));
   for(const branch of result.branches){
    const display=create('div','forecast-level-path');
    display.append(create('strong','',
     (branch.direction==='UP'?'Условно вверх':'Условно вниз')+
     ' · '+LEVEL_STATE[branch.state]));
    if(branch.firstTouch){
     display.append(create('small','',
      'Первая наблюдаемая H1: №'+branch.firstTouch.bar+
      ' · '+date(branch.firstTouch.at)));
    }
    for(const event of branch.observations){
     const line=create('div','forecast-level-event');
     line.append(create('span','','H1 №'+event.bar+' · '+
      event.levels.map(key=>LEVEL_LABEL[key]).join(' + ')),
      create('span','',date(event.at)+
       (event.spansPublication?' · публикация внутри H1':' · закрытая H1')));
     display.append(line);
    }
    display.append(create('small','forecast-level-caution',branch.note));
    output.append(display);
   }
   output.append(create('p','forecast-level-note',result.note));
  }catch(error){
   if(container.isConnected){
    output.replaceChildren(create('p','forecast-level-warning',
     'История H1 недоступна: '+String(error?.message||error)));
   }
  }finally{action.disabled=false;}
 });
 container.append(action,output);
 return container;
}


/** Clipboard is user-initiated; never copied silently or sent to an exchange. */
async function copyResearchText(value){
 const content=String(value);
 try{
  if(globalThis.navigator?.clipboard?.writeText){
   await navigator.clipboard.writeText(content);
   return true;
  }
 }catch{ /* Android WebView may block Clipboard API: try editable fallback. */ }
 const input=create('textarea');
 input.value=content;input.setAttribute('aria-hidden','true');
 input.style.position='fixed';input.style.opacity='0';input.style.pointerEvents='none';
 document.body.append(input);
 input.focus();input.select();
 let ok=false;
 try{ok=Boolean(document.execCommand('copy'));}catch{}
 input.remove();
 return ok;
}
/** Single card; "Отмеченные" and "демо-журнал" are one and the same saved ID set. */
function cardForForecast(row,{tracked,onToggle,onOpen,getMini}={}){
 const card=create('article','forecast-record forecast-visual');
 const trace=inspectResearchTimeline(row,{now:Date.now()});
 const state=stagePresentation(trace);
 const audit=planResearchLevels(row,{now:Date.now()});
 const head=create('div','forecast-visual-head');
 const headText=create('div','forecast-visual-identity');
 headText.append(create('strong','',displayPair(row.asset)),
  create('small','','H1 · Исследование диапазона'));
 const pill=create('span','forecast-visual-state '+state.tone,state.name);
 head.append(headText,pill);card.append(head);
 const source=create('div','forecast-visual-meta');
 source.append(create('span','','Binance Spot · закрытые H1'),
  create('span','','Источники: проверяемые данные'));
 card.append(source);
 const stages=create('div','forecast-step-strip');
 stages.setAttribute('aria-label','Этапы исследовательского сценария');
 for(const [index,label] of ['Создан','Наблюдение','Итог'].entries()){
  const observed=index===0?trace.state!=='INVALID':
   index===1?trace.steps?.some(step=>step.key==='CONFIRMED'&&step.observed):
   Boolean(trace.result);
  const segment=create('span','forecast-step '+(observed?'is-done':'is-pending'),
   (observed?'✓ ':'· ')+label);
  stages.append(segment);
 }
 card.append(stages);
 const when=create('div','forecast-visual-horizon');
 when.textContent=trace.state==='EVALUATED'
  ?'Итог проверен · '+date(trace.result.evaluatedAt)
  :trace.state==='DUE_UNVERIFIED'
   ?'Срок проверки прошёл; подтверждённого итога ещё нет'
   :trace.state==='INVALID'||trace.state==='INCONSISTENT_RESULT'
    ?'Запись требует проверки источника и времени'
    :'Осталось до исследовательского горизонта: '+formatRemaining(trace.remainingMs);
 card.append(when);
 if(audit.state!=='READY'){
  card.append(create('p','forecast-level-warning',
   'Контрольные уровни пока недоступны: '+audit.reason));
 }else{
  const plan=audit.plan;
  const provenance=create('p','forecast-visual-provenance',
   plan.origin==='PUBLISHED'
    ?'Контрольные уровни сохранены вместе с гипотезой.'
    :'Уровни восстановлены задним числом для старой гипотезы; в точность прогнозов не входят.');
  card.append(provenance);
  const branches=create('div','forecast-side-tabs');
  branches.setAttribute('role','group');
  branches.setAttribute('aria-label','Условные варианты исследования');
  const up=create('button','forecast-side-tab is-active','↑ Вверх');
  const down=create('button','forecast-side-tab','↓ Вниз');
  up.type='button';down.type='button';branches.append(up,down);card.append(branches);
  let direction='UP',lastAudit=null;
  const boxes=create('div','forecast-visual-levels');
  const baseRow=create('div','forecast-baseline-row');
  const entry=create('div','forecast-price-box');
  entry.append(create('span','forecast-price-label','Опорная цена · не вход'));
  const price=create('strong','forecast-price-value',priceText(plan.entry));
  const copyPrice=create('button','forecast-copy','▢');
  copyPrice.type='button';copyPrice.setAttribute('aria-label','Копировать опорную цену');
  entry.append(price,copyPrice);
  const sl=create('div','forecast-price-box protective');
  sl.append(create('span','forecast-price-label','Защитный уровень · условно'));
  const slPrice=create('strong','forecast-price-value');
  const copySL=create('button','forecast-copy','▢');
  copySL.type='button';copySL.setAttribute('aria-label','Копировать защитный уровень');
  sl.append(slPrice,copySL);
  baseRow.append(entry,sl);boxes.append(baseRow);
  const targets=create('div','forecast-target-grid');
  const targetInfo=[];
  for(const key of ['tp1','tp2','tp3']){
   const tile=create('div','forecast-target');
   const label=create('span','forecast-target-name',key.toUpperCase());
   const amount=create('strong','forecast-target-price');
   const copy=create('button','forecast-copy','▢');
   copy.type='button';copy.setAttribute('aria-label','Копировать '+key.toUpperCase());
   const info=create('small','forecast-target-mark');
   tile.append(label,amount,copy,info);
   targets.append(tile);targetInfo.push({key,tile,amount,copy,info});
  }
  boxes.append(targets);
  const tracking=create('div','forecast-observation-progress');
  const trackingTitle=create('p','forecast-observation-summary');
  const bars=create('div','forecast-progress-track');
  const barElements=['TP1','TP2','TP3'].map(label=>{
   const node=create('span','forecast-progress-step');
   node.setAttribute('aria-label',label+' ещё не проверен');
   bars.append(node);return node;
  });
  tracking.append(trackingTitle,bars);
  boxes.append(tracking);card.append(boxes);
  const copyStatus=create('p','forecast-copy-feedback');
  copyStatus.setAttribute('role','status');copyStatus.setAttribute('aria-live','polite');
  card.append(copyStatus);
  const doCopy=async value=>{
   const ok=await copyResearchText(value);
   copyStatus.textContent=ok?'Скопировано в буфер обмена.':
    'Не удалось скопировать. Выделите значение вручную.';
  };
  copyPrice.addEventListener('click',()=>void doCopy(priceText(plan.entry)));
  copySL.addEventListener('click',()=>void doCopy(priceText(plan[direction].sl)));
  for(const item of targetInfo)
   item.copy.addEventListener('click',()=>void doCopy(priceText(plan[direction][item.key])));
  function redraw(){
   up.classList.toggle('is-active',direction==='UP');
   down.classList.toggle('is-active',direction==='DOWN');
   up.setAttribute('aria-pressed',String(direction==='UP'));
   down.setAttribute('aria-pressed',String(direction==='DOWN'));
   slPrice.textContent=priceText(plan[direction].sl);
   const branch=lastAudit?.branches?.find(x=>x.direction===direction);
   const info=observedLevelSummary(branch);
   for(const [i,item] of targetInfo.entries()){
    item.amount.textContent=priceText(plan[direction][item.key]);
    const touched=info.hitKeys.includes(item.key);
    item.tile.classList.toggle('is-hit',touched&&!info.ambiguous);
    item.tile.classList.toggle('is-uncertain',touched&&info.ambiguous);
    item.info.textContent=touched?(info.ambiguous?'Касание · порядок ?':'Касание H1'):
     'Не подтверждено';
    barElements[i].classList.toggle('is-hit',touched&&!info.ambiguous);
    barElements[i].classList.toggle('is-uncertain',touched&&info.ambiguous);
    barElements[i].setAttribute('aria-label',item.key.toUpperCase()+' · '+item.info.textContent);
   }
   trackingTitle.textContent=info.label+
    (lastAudit?.state==='COMPLETE'?' · 4/4 H1':
     lastAudit?.state==='PARTIAL'?' · '+lastAudit.observedHours+'/4 H1':'');
  }
  up.addEventListener('click',()=>{direction='UP';redraw();});
  down.addEventListener('click',()=>{direction='DOWN';redraw();});
  const actionBar=create('div','forecast-visual-actions');
  const follow=create('button','forecast-follow',tracked?
   '✓ В отмеченных':'☆ Добавить в отмеченные');
  follow.type='button';follow.setAttribute('aria-pressed',String(tracked));
  follow.addEventListener('click',()=>onToggle?.(row.id));
  const copyAll=create('button','forecast-copy-all','▢ Скопировать уровни');
  copyAll.type='button';
  copyAll.addEventListener('click',()=>void doCopy(scenarioCopyText(row,plan,direction)));
  actionBar.append(follow,copyAll);card.append(actionBar);
  redraw();
  // Only source-complete, originally stored Room H1 may mark touched levels.
  // Missing or ambiguous bars must never become "wins".
  void sourceH1(row.asset).then(archive=>{
   if(!card.isConnected)return;
   if(!archive.native||archive.error||!archive.complete){
    trackingTitle.textContent='Проверенных данных для касаний пока нет.';
    return;
   }
   const result=analyzeResearchLevelSequence(plan,archive.candles,{now:Date.now()});
   if(result.state==='COMPLETE'||result.state==='PARTIAL'){
    lastAudit=result;redraw();
   }else trackingTitle.textContent='Не удалось проверить исходные H1: '+result.reason;
  }).catch(()=>{
   if(card.isConnected)trackingTitle.textContent='Локальная история H1 недоступна.';
  });
 }
 const tools=create('div','forecast-card-actions');
 const open=create('button','forecast-open','Открыть актив');
 open.type='button';open.addEventListener('click',()=>onOpen?.(row.asset,row.id));
 tools.append(open);
 const details=create('details','forecast-record-details');
 const summary=create('summary','','Источники, график и подробный H1-аудит');
 details.append(summary);
 const chart=create('div','forecast-mini-chart');
 chart.dataset.sparkSymbol=row.asset;
 details.append(chart);getMini?.(row.asset,chart);
 const rows=create('div','forecast-info');
 let data=null;
 try{data=typeof row.hypothesis==='string'?JSON.parse(row.hypothesis):row.hypothesis;}
 catch{}
 if(data&&typeof data.bandLow==='number'&&typeof data.bandHigh==='number'){
  rows.append(create('div','forecast-band',
   priceText(data.bandLow)+' — '+priceText(data.bandHigh)+' USDT'));
 }
 for(const [label,value] of [
  ['Опубликован',date(row.publishedAt)],
  ['Срок проверки',date(trace.targetCloseAt)],
  ['Источник','Binance Spot · закрытые H1']]){
  const line=create('div','data-row');
  line.append(create('span','',label),create('strong','',value));
  rows.append(line);
 }
 details.append(rows);
 details.append(renderLevelSequence(row));
 const {panel:progress}=timelineForForecast(row);
 details.append(progress);
 if(trace.result){
  details.append(create('div','forecast-result',
   (trace.result.outcome==='WITHIN_RANGE'?
    'Итоговое закрытие внутри исходного диапазона':
    'Итоговое закрытие вне исходного диапазона')+
   ' · '+priceText(trace.result.actualClose)+' USDT · '+date(trace.result.evaluatedAt)));
 }
 card.append(tools,details);
 return card;
}
export function initFavoriteResearch({
 getSelectedSymbol,onSelectSymbol,onForecastStage,onExplainSymbol,onOpenRadar
}){
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
 let undoSymbol=null,undoTimer=0,summaryNotice=null;
 const radarSummary=id('favorites-radar-summary');
 radarSummary.addEventListener('click',()=>{
  if(summaryNotice)onOpenRadar?.(summaryNotice.symbol,summaryNotice.interval);
 });
 function radarNotices(){
  let storage=null;
  try{storage=globalThis.localStorage||null;}catch{}
  return getFavoriteRadarNotices(favorites,readRadarChanges(storage),{now:Date.now()});
 }
 function renderRadarSummary(notices){
  summaryNotice=notices[0]||null;
  radarSummary.hidden=!summaryNotice;
  if(!summaryNotice)return;
  id('favorites-radar-summary-text').textContent=summarizeFavoriteRadar(notices).text;
 }
 window.addEventListener('apex-radar-updated',()=>{
  if(document.body.dataset.view==='overview')renderFavorites();
 });
 function hideUndo(){clearTimeout(undoTimer);id('favorites-toast').hidden=true;undoSymbol=null;}
 function offerUndo(symbol){
  undoSymbol=symbol;id('favorites-toast-text').textContent=symbol+' удалён из избранного';
  id('favorites-toast').hidden=false;clearTimeout(undoTimer);
  undoTimer=setTimeout(hideUndo,6500);
 }
 id('favorites-undo').addEventListener('click',()=>{
  const symbol=undoSymbol;hideUndo();
  if(symbol)void updateFavorite(symbol,true);
 });
 function enableSwipeRemoval(card,symbol){
  return bindFavoriteHoldSwipe(card,{
   onRemove:()=>void updateFavorite(symbol,false),
   onOpen:()=>onSelectSymbol(symbol)
  });
 }

 function renderFavorites(){
  const rail=id('favorite-rail');
  const previousScrollLeft=rail.scrollLeft;
  const focused=document.activeElement;
  const focusedCard=focused?.closest?.('.favorite-card');
  const focusedSymbol=focusedCard?.dataset.symbol;
  const focusedRole=focused?.classList?.contains('favorite-radar-link')?
   'radar':focused?.classList?.contains('favorite-open')?'open':
    focused?.classList?.contains('favorite-explain')?'explain':'card';
  clear(rail);
  const notices=radarNotices();
  const bySymbol=new Map(notices.map(x=>[x.symbol,x]));
  renderRadarSummary(notices);
  id('favorites-count').textContent=favorites.length+' / '+FAVORITES_MAX;
  id('forecast-favorites-count').textContent=favorites.length+' / '+FAVORITES_MAX;
  if(!favorites.length){
   rail.append(create('p','muted',native
    ?'Избранное пока пусто. Найдите интересующий актив и нажмите «☆ Добавить в избранное».'
    :'Избранное хранится в Android-приложении.'));
  }else for(const symbol of favorites){
   const wrapper=create('div','asset-chip favorite-card');
   wrapper.dataset.symbol=symbol;
   wrapper.setAttribute('role','listitem');
   wrapper.tabIndex=0;
   wrapper.setAttribute('aria-label',symbol+' · открыть Enter; удалить удержанием и свайпом вверх либо Delete');
   if(symbol===getSelectedSymbol())wrapper.classList.add('selected');
   const notice=bySymbol.get(symbol);
   if(notice)wrapper.classList.add('has-radar-update');
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
   enableSwipeRemoval(wrapper,symbol);
   wrapper.addEventListener('click',(e)=>{
    if(e.target?.closest?.('.favorite-remove, .favorite-explain, .favorite-radar-link'))return;
    onSelectSymbol(symbol);
   });
   const explain=create('button','favorite-explain','Почему?');
   explain.type='button';
   explain.setAttribute('aria-label',
    'Объяснить исторические исследования '+symbol);
   explain.addEventListener('click',event=>{
    event.stopPropagation();
    onExplainSymbol?.(symbol);
   });
   wrapper.append(open,explain);
   if(notice){
    const radar=create('button','favorite-radar-link',
     '◉ '+notice.frame+' · '+notice.label);
    radar.type='button';
    radar.title='Событие Радара по закрытым свечам · '+notice.label;
    radar.setAttribute('aria-label','Открыть подтверждённое изменение в Радаре: '+
     symbol+' '+notice.frame+' '+notice.label);
    radar.addEventListener('click',event=>{
     event.stopPropagation();
     onOpenRadar?.(symbol,notice.interval);
    });
    wrapper.append(radar);
   }
   rail.append(wrapper);
  }
  // Rebuilding a card for a refreshed badge must not jump the carousel to BTC.
  rail.scrollLeft=previousScrollLeft;
  if(focusedSymbol&&document.body.dataset.view==='overview'){
   for(const item of rail.children){
    if(item.dataset.symbol!==focusedSymbol)continue;
    const target=focusedRole==='radar'?item.querySelector('.favorite-radar-link'):
     focusedRole==='open'?item.querySelector('.favorite-open'):
      focusedRole==='explain'?item.querySelector('.favorite-explain'):item;
    if(target?.focus)target.focus({preventScroll:true});
    break;
   }
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
  if(!native||busy)return false;
  busy=true;renderFavorites();
  try{
   const result=await changeMobileFavorite(symbol,add);
   favorites=sanitizeFavorites(result.favorites);
   renderFavorites();
   if(!add)offerUndo(symbol);
   await loadJournal();
   if(add)void sync(true);
   return true;
  }catch(e){
   status('Не удалось изменить избранное: '+String(e?.message||e));
   return false;
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
  hasFavorite:symbol=>favorites.includes(symbol),
  isNative:()=>native,
  toggleSymbol:symbol=>updateFavorite(symbol,!favorites.includes(symbol)),
  getScenarioRows,
  refreshJournal:loadJournal,
  renderMini,
  openOverviewSummary:()=>{renderFavorites();void loadJournal();}
 };
}
