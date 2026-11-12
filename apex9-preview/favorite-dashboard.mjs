/**
 * APEX Android First — dynamic on-device favorites and automatic research journal.
 * User selects up to 10 assets; no UI for manually authoring predictions.
 * Sync is foreground and (when opted-in) via Android WorkManager.
 */
import {getMobileFavorites,changeMobileFavorite,
 syncMobileFavoriteResearch,getMobileResearchForecasts,
 getMobileMarkedResearchForecasts,setMobileSettings,normalizeAlertMarkedIds,getMobileCandles,
 getMobileCandleArchive,getMobileM5Window,getMobileM1Window} from './mobile-bridge.mjs';
import {stageNotificationLabel} from './forecast-notification-route.mjs';
import {whaleCheckCoverage,whaleShadowOutcomes} from './forecast-whale-check.mjs';
import {sanitizeFavorites,journalCounts,forecastStage,
 FORECAST_STAGES,FORECAST_STAGE_LABELS,FAVORITES_MAX} from './favorite-logic.mjs';
import {attachSparkline} from './sparkline.mjs';
import {attachAssetLogo} from './asset-logo.mjs';
import {createFavoriteTickerFeed} from './favorite-ticker.mjs';
import {journalObservedStats} from './journal-stats.mjs';
import {scenarioJournalState,scenarioJournalRows} from './scenario-journal-state.mjs';
import {directionalQualitySummary,verifiedDirectionalEvidence} from './forecast-quality.mjs';
import {summarizeAssetQuality} from './asset-quality.mjs';
import {compareScenarioConditions} from './scenario-condition-compare.mjs';
import {inspectResearchTimeline} from './research-timeline.mjs';
import {planResearchLevels,analyzeResearchLevelSequence} from './research-level-sequence.mjs';
import {displayPair,priceText,stagePresentation,
 observedLevelSummary,scenarioCopyText,SIDE_LABEL} from './forecast-card-ux.mjs';
import {readRadarChanges} from './radar-changes.mjs';
import {getFavoriteRadarNotices,summarizeFavoriteRadar} from './favorite-radar.mjs';
import {directionalHypothesis} from './directional-scenario.mjs';
import {directionalForecastCard,legacyRangeCard} from './forecast-directional-card.mjs';
import {multiFrameHypothesis,multiFrameForecastCard,multiFrameQuality,
 multiFrameAgreement,multiFrameEvidence} from './forecast-multiframe.mjs';
import {evidenceCohorts} from './forecast-evidence-context.mjs';
import {initFeatureHoldoutDashboard} from './forecast-feature-dashboard.mjs';
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
const M5_WINDOW_CACHE=new Map(),M5_INFLIGHT=new Map();
/** Exactly the closed M5 bars belonging to the published 24h scenario. */
async function sourceM5(plan){
 const STEP=plan.evaluationInterval==='1m'?60000:300000;
 const start=plan.anchorCloseAt+1;
 const end=Math.min(plan.targetCloseAt+1,
  Math.floor(Date.now()/STEP)*STEP);
 if(end<=start)return {native:true,complete:true,candles:[]};
 const key=plan.asset+':'+plan.evaluationInterval+':'+start+':'+end;
 const cached=M5_WINDOW_CACHE.get(key);
 if(cached&&Date.now()-cached.at<45000)return cached.data;
 if(M5_INFLIGHT.has(key))return M5_INFLIGHT.get(key);
 const request=(plan.evaluationInterval==='1m'?
  getMobileM1Window(plan.asset,start,end):
  getMobileM5Window(plan.asset,start,end))
  .then(data=>{
   if(data.native&&data.complete&&!data.error){
    if(M5_WINDOW_CACHE.size>35)M5_WINDOW_CACHE.clear();
    M5_WINDOW_CACHE.set(key,{at:Date.now(),data});
   }
   return data;
  }).finally(()=>M5_INFLIGHT.delete(key));
 M5_INFLIGHT.set(key,request);
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
 if(multiFrameHypothesis(row))
  return multiFrameForecastCard(row,{tracked,onToggle,onOpen,copyText:copyResearchText});
 if(directionalHypothesis(row))
  return directionalForecastCard(row,{tracked,onToggle,onOpen,getMini,
   sourceH1,sourceM5,sourceM1:sourceM5,copyText:copyResearchText});
 return legacyRangeCard(row,{tracked,onToggle,onOpen,getMini});
}
function unusedLegacyForecastVisual(row,{tracked,onToggle,onOpen,getMini}={}){
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
 getSelectedSymbol,onSelectSymbol,onForecastStage,onExplainSymbol,onOpenRadar,
 onFavoritesChanged,onResearchSynced
}){
 let favorites=[],native=false,busy=false,syncing=false,lastSyncAt=0,
  stage='PENDING_CONFIRMATION',stageTouched=false,journalMode='all',journalGeneration=0,
  archiveExpanded=false,lastRows=[],lastTotal=0,
  markedRows=[],markedMissing=[],markedReadyFor=null,
  markedLoading=false,markedError=null,markedFetchGeneration=0;
 const featureAudit=initFeatureHoldoutDashboard({getFavorites:()=>favorites.slice()});
 const MINI_CACHE=new Map(),MINI_LOADING=new Set(),MINI_AT=new Map();
 let localStore=null;
 try{localStore=globalThis.localStorage;}catch{}
 const favoriteTickers=createFavoriteTickerFeed({storage:localStore});
 let priceRequest=0;
 function paintFavoritePrice(symbol,card=null){
  const target=card||[...document.querySelectorAll('.favorite-card')]
   .find(node=>node.dataset.symbol===symbol);
  if(!target)return;
  const price=target.querySelector('.favorite-price-value');
  const change=target.querySelector('.favorite-price-change');
  if(!price||!change)return;
  const data=favoriteTickers.cached(favorites)[symbol];
  price.textContent=data?fmt(data.price,data.price<1?8:4)+' USDT':'Цена недоступна';
  price.dataset.state=data?'ARCHIVE':'UNAVAILABLE';
  const stamp=data?new Date(data.observedAt).toLocaleTimeString('ru-RU',
   {hour:'2-digit',minute:'2-digit'}):'';
  const delayed=data&&Date.now()-data.observedAt>3*60000;
  change.textContent=data?(data.changePercent24h>0?'+':'')+
   fmt(data.changePercent24h,2)+'% / 24ч · '+
   (delayed?'архив ':'по Binance ')+stamp:'Проверяем цену';
  change.className='favorite-price-change'+
   (data?.changePercent24h>0?' positive':data?.changePercent24h<0?' negative':'');
 }
 function refreshFavoritePrices({force=false}={}){
  if(!favorites.length)return;
  const selected=favorites.slice(),sequence=++priceRequest;
  for(const symbol of selected)paintFavoritePrice(symbol);
  void favoriteTickers.refresh(selected,{force}).then(result=>{
   if(sequence!==priceRequest)return;
   for(const symbol of favorites)paintFavoritePrice(symbol);
   const badge=id('favorites-price-status');
   if(badge)badge.textContent=result.state==='OK'?
    'Цены Binance · обновлено':result.state==='CACHE'?'Цены из кеша':
    Object.keys(result.prices||{}).length?'Показаны сохранённые цены':
    'Цены Binance недоступны';
  });
 }
 let hidden=new Set();
 try {
  const items=JSON.parse(localStorage.getItem('apex9_hidden_research_ids_v1')||'[]');
  if(Array.isArray(items))
   hidden=new Set(items.filter(x=>typeof x==='string'&&
    /^(direction2|direction3|range1):[A-Z0-9]{5,20}:(1h|15m|4h):\d{10,16}$/.test(x))
    .slice(-300));
 }catch{}
 const persistHidden=()=>{
  try{localStorage.setItem('apex9_hidden_research_ids_v1',
   JSON.stringify([...hidden].slice(-300)));}catch{}
 };
 let selected=new Set();
 try{
  const stored=JSON.parse(localStorage.getItem('apex9_selected_research_ids_v1')||'[]');
  if(Array.isArray(stored))selected=new Set(stored.filter(x=>typeof x==='string').slice(0,300));
 }catch{}
 // Keep one serialized native copy for notifications while WebView is closed.
 // The journal's localStorage remains the source of UI bookmark selection.
 let markSync=Promise.resolve();
 const syncNativeMarks=()=>{
  if(!native)return Promise.resolve();
  const ids=normalizeAlertMarkedIds([...selected]);
  markSync=markSync.catch(()=>{}).then(()=>
   setMobileSettings({alertMarkedIds:ids})).catch(error=>{
    const status=id('apex-settings-alert-status');
    if(status)status.textContent='Не удалось синхронизировать отмеченные уведомления: '+
     String(error?.message||error);
   });
  return markSync;
 };
 const persistSelected=()=>{
  try{localStorage.setItem('apex9_selected_research_ids_v1',
   JSON.stringify([...selected].slice(-300)));}catch{}
  void syncNativeMarks();
 };
 const selectedKey=()=>[...selected].sort().join('|');
 const displayedJournal=()=>scenarioJournalRows(lastRows,markedRows,{
  mode:journalMode
 });
 function renderMini(symbol,slot){
  const prior=MINI_CACHE.get(symbol);
  if(prior)attachSparkline(slot,prior);
  else attachSparkline(slot,[]);
  const at=Date.now();
  if(MINI_LOADING.has(symbol)||MINI_AT.has(symbol)&&
   at-MINI_AT.get(symbol)<5*60000)return;
  MINI_LOADING.add(symbol);MINI_AT.set(symbol,at);
  void getMobileCandles(symbol,'1h',60).then(r=>{
   const rows=Array.isArray(r?.candles)?r.candles.filter(x=>x?.closed===true):[];
   // A temporary missing/failed Room read must never erase a real old chart.
   if(!r?.native||r.error||rows.length<3)return;
   MINI_CACHE.set(symbol,rows);MINI_AT.set(symbol,Date.now());
   for(const n of document.querySelectorAll('[data-spark-symbol]'))
    if(n.dataset.sparkSymbol===symbol)attachSparkline(n,rows);
  }).catch(()=>{}).finally(()=>MINI_LOADING.delete(symbol));
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

 function updateFavoriteControls(){
  id('favorites-count').textContent=favorites.length+' / '+FAVORITES_MAX;
  id('forecast-favorites-count').textContent=favorites.length+' / '+FAVORITES_MAX;
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
 function renderFavorites(){
  const rail=id('favorite-rail');
  const previousScrollLeft=rail.scrollLeft;
  const focused=document.activeElement;
  const focusedCard=focused?.closest?.('.favorite-card');
  const focusedSymbol=focusedCard?.dataset.symbol;
  const focusedRole=focused?.classList?.contains('favorite-radar-link')?
   'radar':focused?.classList?.contains('favorite-open')?'open':
    focused?.classList?.contains('favorite-explain')?'explain':'card';
  const existing=[...rail.children].filter(x=>x.classList?.contains('favorite-card'));
  const unchanged=favorites.length>0&&existing.length===favorites.length&&
   existing.every((card,i)=>card.dataset.symbol===favorites[i]);
  if(unchanged){
   const updates=radarNotices(),bySymbol=new Map(updates.map(x=>[x.symbol,x]));
   renderRadarSummary(updates);
   for(const card of existing){
    const symbol=card.dataset.symbol,notice=bySymbol.get(symbol);
    card.classList.toggle('selected',symbol===getSelectedSymbol());
    card.classList.toggle('has-radar-update',Boolean(notice));
    const old=card.querySelector('.favorite-radar-link');
    const key=notice?notice.frame+':'+notice.interval+':'+notice.label:null;
    if(old&&old.dataset.noticeKey!==key)old.remove();
    if(notice&&!card.querySelector('.favorite-radar-link')){
     const btn=create('button','favorite-radar-link',
      '◉ '+notice.frame+' · '+notice.label);
     btn.type='button';btn.dataset.noticeKey=key;
     btn.title='Изменение Радара по закрытым свечам · '+notice.label;
     btn.addEventListener('click',e=>{
      e.stopPropagation();onOpenRadar?.(symbol,notice.interval);
     });
     card.append(btn);
    }
    paintFavoritePrice(symbol,card);
   }
   updateFavoriteControls();
   return;
  }
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
   const icon=create('span','coin-mark '+token.toLowerCase());
   attachAssetLogo(icon,symbol,mark);
   const labels=create('span','favorite-names');
   labels.append(create('strong','',label),create('small','',symbol));
   open.append(icon,labels);
   const priceBox=create('div','favorite-price-box');
   const priceValue=create('strong','favorite-price-value','Цена недоступна');
   const priceChange=create('small','favorite-price-change','Проверяем цену');
   priceBox.append(priceValue,priceChange);
   const spark=create('span','favorite-chart');
   spark.setAttribute('aria-label','График завершённых H1 свечей '+symbol);
   spark.dataset.sparkSymbol=symbol;
   const market=create('div','favorite-market-row');
   market.append(priceBox,spark);
   wrapper.append(market);
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
   paintFavoritePrice(symbol,wrapper);
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
  updateFavoriteControls();
 }
 async function updateFavorite(symbol,add){
  if(!native||busy)return false;
  busy=true;renderFavorites();
  try{
   const result=await changeMobileFavorite(symbol,add);
   favorites=sanitizeFavorites(result.favorites);
   onFavoritesChanged?.(favorites.slice());
   priceRequest++;
   renderFavorites();
   if(add)refreshFavoritePrices({force:true});
   if(!add){MINI_CACHE.delete(symbol);MINI_AT.delete(symbol);offerUndo(symbol);}
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
  const now=Date.now(),chosen=[...selected];
  const scopedJournal=displayedJournal();
  const stats=journalObservedStats(scopedJournal,{
   selectedIds:chosen,
   totalPublished:journalMode==='tracked'?null:lastTotal,now
  });
  const quality=directionalQualitySummary(scopedJournal,{selectedIds:chosen,now});
  const scopedRows=journalMode==='tracked'?
   scopedJournal.filter(row=>selected.has(row.id)):scopedJournal;
  const live=scenarioJournalState(scopedJournal,{
   selectedIds:chosen,mode:journalMode,stage,now
  });
  const comparisons=compareScenarioConditions(scopedRows,{now});
  const byAsset=summarizeAssetQuality(scopedRows,{now,
   totalLoaded:journalMode==='tracked'?scopedRows.length:lastTotal});
  id('forecast-quality-current-scope').textContent=
   journalMode==='tracked'?'Отмеченные':'Все прогнозы';
  for(const [name,value] of [['all',stats.all],['tracked',stats.tracked]]){
   const slot=id('forecast-stat-'+name);slot.replaceChildren();
   slot.hidden=name!==journalMode;
   if(name!==journalMode)continue;
   const useM1=quality.m1.published>0;
   const frameLabel=useM1?'M1':'M5 · архив';
   const q=useM1?(name==='all'?quality.m1:quality.trackedM1):
    (name==='all'?quality.all:quality.tracked);
   const study=create('section','forecast-quality-summary');
   study.setAttribute('aria-label','Качество прогнозов · H1 → '+frameLabel);
   const heading=create('div','forecast-quality-heading');
   heading.append(create('strong','','Качество прогнозов · H1 → '+frameLabel+' · история'),
    create('small','',name==='tracked'?'Отмеченные · Room':'Все · Room'));
   study.append(heading);
   const unavailable=q.invalid+q.unverified;
   const evidenceLabel=stats.truncated?'Частичный журнал · последние '+lastRows.length+' записей':
    unavailable?'Есть записи без полной проверки':
    !q.finished?'Нет завершённых '+frameLabel:
    q.finished<12?'Мало завершённых наблюдений':
    'Описательная статистика '+frameLabel;
   study.append(create('p','forecast-quality-coverage',evidenceLabel));
   if(!q.published){
    study.append(create('p','forecast-quality-empty',
     'Пока нет подтверждённых исследований по '+frameLabel+'. Новые наблюдения появятся '+
     'после публикации направленного прогноза и проверки реальных свечей.'));
   }
   const basics=create('div','forecast-quality-kpis');
   for(const [label,count] of [
    ['Опубликовано H1',q.published],
    ['В работе сейчас · все ТФ',live.inWork],
    ['Завершено H1',q.finished]]){
    const metric=create('div','forecast-quality-kpi');
    metric.append(create('span','',label),
     create('strong','',fmt(count,0)));basics.append(metric);
   }
   study.append(basics);
   const levels=create('div','forecast-quality-targets');
   levels.append(create('strong','forecast-quality-subtitle',
    'Касания TP · по закрытым '+frameLabel));
   const tracks=create('div','forecast-quality-tracks');
   for(const [label,number] of [
    ['TP1',q.tp1],['TP2',q.tp2],['TP3',q.tp3]]){
    const item=create('div','forecast-quality-track');
    const labels=create('div','forecast-quality-track-title');
    labels.append(create('span','',label),
     create('strong','',fmt(number,0)+' / '+fmt(q.entered,0)));
    const bar=create('div','forecast-quality-track-bar');
    const fill=create('span','forecast-quality-track-fill');
    fill.style.width=(q.entered?Math.min(100,100*number/q.entered):0)+'%';
    bar.append(fill);item.append(labels,bar);tracks.append(item);
   }
   levels.append(tracks);
   levels.append(create('p','forecast-quality-note',
    'Число касаний / число сценариев с подтверждённой опорной ценой. '+
    'Достижение TP не означает, что сценарий завершился на TP.'));
   study.append(levels);
   const quick=create('p','forecast-quality-resolution');
   quick.append(create('span','','Завершения:'),
    create('strong','','TP3 '+fmt(q.tp3Outcome,0)),
    create('strong','','SL '+fmt(q.stop,0)),
    create('span','','Другие '+fmt(q.ambiguous+q.notEntered+q.expired,0)));
   study.append(quick);
   const details=create('details','forecast-quality-details');
   details.append(create('summary','','Подробнее: исходы, сравнение, архив'));
   const outcomes=create('div','forecast-quality-outcomes');
   outcomes.append(create('strong','forecast-quality-subtitle',
    'Итоги завершённых наблюдений'));
   const outcomeGrid=create('div','forecast-quality-outcome-grid');
   for(const [label,count] of [
    ['TP3 · завершён',q.tp3Outcome],['SL · завершён',q.stop],
    ['Порядок неизвестен',q.ambiguous],['Без входа',q.notEntered],
    ['Истёк срок',q.expired]]){
    const node=create('div','forecast-quality-outcome');
    node.append(create('span','',label),create('strong','',fmt(count,0)));
    outcomeGrid.append(node);
   }
   outcomes.append(outcomeGrid);
   outcomes.append(create('p','forecast-quality-note',
    'TP3 и SL — разные конечные исходы. TP1–TP2 могут быть достигнуты '+
    'раньше SL; неопределённый порядок не считается успехом.'));
   details.append(outcomes);
   details.append(create('p','forecast-quality-note',
    'Касание входа за всю историю H1 → '+frameLabel+': '+q.entered+
    ' (включая завершённые сценарии). Это не число прогнозов в работе. '+
    '«В работе сейчас» относится только к видимому журналу выбранного режима.'));
   if(q.invalid||q.unverified){
    study.append(create('p','forecast-quality-warning',
     'Не включены в расчёт: несогласованные записи · '+q.invalid+
     ', неподтверждённые · '+q.unverified+'.'));
   }
   if(quality.archivedH1&&name==='all')
    study.append(create('p','forecast-quality-note',
     'Направленных сценариев со старой проверкой H1: '+
     quality.archivedH1+'. Они не смешиваются со статистикой '+frameLabel+'.'));
   if(quality.archivedM5&&useM1)
    study.append(create('p','forecast-quality-note',
     'Архивные сценарии с проверкой M5: '+quality.archivedM5+
     '. Они не смешиваются с новым набором M1.'));
   details.append(create('p','forecast-quality-method',
    'Исследовательские наблюдения, а не исполненные ордера. '+
    'Оценка по сохранённым событиям закрытых '+frameLabel+'; '+
    'при пропусках данных исход не засчитывается.'));
   // Compare cohorts with verified, immutable M5 evidence and only
   // H1 characteristics recorded before later outcomes.
   {
    const panel=create('section','forecast-condition-comparison');
    panel.append(create('strong','forecast-quality-subtitle',
     'Сравнение условий формирования · архив H1 → M5'));
    panel.append(create('p','forecast-quality-note',
     'Группы по направлению H1 и ширине диапазона при публикации. '+
     'TP и SL здесь — наблюдения, не исполненные сделки.'));
    if(!comparisons.included)panel.append(create('p','forecast-quality-empty',
     'Проверенных сценариев M5 пока нет.'));
    for(const comparison of comparisons.dimensions){
     panel.append(create('h5','forecast-condition-group-title',
      comparison.title+(comparison.note?' · '+comparison.note:'')));
     const groups=create('div','forecast-condition-groups');
     for(const x of comparison.groups){
      const group=create('div','forecast-condition-group');
      group.append(create('strong','',x.label),
       create('small','','Завершено '+x.finished+' / '+x.published),
       create('span','','С входом '+x.entered+' · TP1 '+x.tp1),
       create('span','','TP3 '+x.tp3+' · SL '+x.stop+' · ? '+x.ambiguous));
      groups.append(group);
     }
     panel.append(groups);
     if(!comparison.sufficient)panel.append(create('p','forecast-quality-note',
      'Недостаточно завершённых активных наблюдений для сравнения долей: '+
      'от '+comparisons.minPerGroup+' в каждой группе.'));
    }
    if(comparisons.excluded)panel.append(create('p','forecast-quality-warning',
     'Записи без полной проверки не включены: '+comparisons.excluded+'.'));
    details.append(panel);
   }
   slot.append(study);
   const detailByAsset=create('details','forecast-asset-comparison');
   detailByAsset.append(create('summary','',
    'По активам · '+byAsset.assets.length+' с направленными прогнозами'));
   detailByAsset.append(create('p','forecast-quality-note',
    'Сортировка по объёму наблюдений, а не доходности. '+
    'TP1–TP3 — касания, SL — конечный исход.'));
   if(byAsset.partial)detailByAsset.append(create('p','forecast-quality-warning',
    'Частичная история: загружено '+byAsset.scanned+' из '+lastTotal+
    ' записей журнала. Показатели не полные.'));
   if(!byAsset.assets.length)detailByAsset.append(
    create('p','forecast-quality-empty','Недостаточно M5-истории по активам.'));
   for(const item of byAsset.assets){
    const card=create('section','forecast-asset-quality-row');
    card.append(create('strong','',item.symbol),
     create('small','','Опубликовано '+item.published+
      ' · с входом '+item.entered+' · завершено '+item.finished+
      ' · ещё наблюдаются '+item.awaiting),
     create('span','','TP1 '+item.tp1+' · TP2 '+item.tp2+
      ' · TP3 '+item.tp3+' (касания)'),
     create('span','','Завершения: TP3 '+item.tp3Outcome+
      ' · SL '+item.stop+' · неопределённо '+item.ambiguous),
     create('small','',item.note+(item.invalid||item.unverified?
      ' · без проверки '+(item.invalid+item.unverified):'')));
    detailByAsset.append(card);
   }
   slot.append(detailByAsset);
   const archived=create('section','forecast-quality-archive');
   archived.append(create('strong','forecast-quality-subtitle',
    'Общий журнал и архивные исследования'));
   const line=create('div','forecast-stat-line');
   for(const [label,count] of [
    ['Всего',value.total],
    ['В работе',value.waiting+value.confirmed+value.active],
    ['Завершено',value.completed],
    ['Проверен итог',value.verifiedOutcomes],
    ['В диапазоне V1',value.within],['Вне диапазона V1',value.outside],
    ['Ждут данных',value.unverifiedDue],
    ['Несогласованные',value.inconsistent]]){
    const metric=create('div','forecast-stat-value');
    metric.append(create('span','',label),create('strong','',fmt(count,0)));
    line.append(metric);
   }
   archived.append(line);details.append(archived);
   slot.append(details);
   if(stats.truncated)slot.append(create('p','forecast-quality-warning',
    'Показатели рассчитаны только по загруженным '+lastRows.length+
    ' из '+lastTotal+' записей. Общая история больше открытой выборки.'));
   // Summary is the default view. Keep original Room evidence, per-asset
   // comparisons and archived methods available without a crowded screen.
   const glance=create('div','forecast-quality-glance');
   glance.setAttribute('aria-label','Касания целей и исходы');
   for(const [label,count] of [
    ['TP1 · касания',q.tp1],['TP2 · касания',q.tp2],
    ['TP3 · касания',q.tp3],['SL · исход',q.stop]]){
    const metric=create('div','forecast-quality-glance-item');
    metric.append(create('span','',label),create('strong','',fmt(count,0)));
    glance.append(metric);
   }
   basics.after(glance);
   const full=create('details','forecast-quality-expansion');
   full.append(create('summary','',
    'Развернуть все результаты и методику'));
   // Preserve all existing nested evidence panels, including incomplete
   // and archived observations. Nothing in this change alters counts.
   const essential=new Set([heading,basics,glance]);
   for(const child of [...study.children]){
    if(essential.has(child)||child.classList.contains('forecast-quality-coverage')||
     child.classList.contains('forecast-quality-empty'))continue;
    full.append(child);
   }
   for(const child of [...slot.children]){
    if(child!==study)full.append(child);
   }
   study.append(full);
   slot.replaceChildren(study);
  }
 }
 function renderMultiFrame(){
  featureAudit.refresh();
  const summary=id('forecast-confluence-summary');
  const qualitySlot=id('forecast-multiframe-quality');
  if(!summary||!qualitySlot)return;
  summary.replaceChildren();qualitySlot.replaceChildren();
  const scoped=journalMode==='tracked'?
   displayedJournal().filter(x=>selected.has(x.id)):lastRows;
  const stats=multiFrameQuality(scoped);
  for(const [frame,label] of [['15m','M15'],['4h','H4']]){
   const record=stats[frame],tile=create('div','forecast-confluence-kpi');
   tile.append(create('strong','',label),
    create('span','','Прогнозов: '+record.published),
    create('span','','С входом: '+record.entered),
    create('span','','Завершено: '+record.completed),
    create('small','','TP3 '+record.tp3+' · SL '+record.stop+
     ' · другие '+record.unknown));
   qualitySlot.append(tile);
  }
  const evidenceSlot=id('forecast-evidence-cohorts');
  if(evidenceSlot){
   evidenceSlot.replaceChildren();
   const cohorts=evidenceCohorts(scoped);
   const feedNames={market:'Рынок',liquidity:'Стакан',onchain:'Сеть',
    news:'Новости',macro:'Макро',social:'Соцсети'};
   for(const [frame,label] of [['15m','M15'],['1h','H1'],['4h','H4']]){
    const q=cohorts[frame],tile=create('section','forecast-evidence-cohort');
    tile.append(create('strong','',label+' · снимки '+q.verified+'/'+q.published),
     create('small','',
      'Сохранённые завершения: '+q.completed+
      ' · TP3 '+q.tp3+' · SL '+q.sl+
      ' · прочие '+q.other));
    const names=create('div','forecast-evidence-feeds');
    for(const key of ['market','liquidity','onchain','news','macro','social']){
     const item=q.feeds[key];
     names.append(create('span','',
      feedNames[key]+': '+item.observed+'/'+q.verified));
    }
    tile.append(names,create('small','',
     'Радар M15/H1/H4/D1: '+
     ['15m','1h','4h','1d'].map(tf=>
      q.frames[tf].observed+'/'+q.verified).join(' · ')));
    if(q.legacy||q.invalid)
     tile.append(create('small','forecast-quality-warning',
      'Без снимка: '+q.legacy+' · повреждённых: '+q.invalid));
    evidenceSlot.append(tile);
   }
   if(journalMode==='all'&&lastTotal>lastRows.length)
    evidenceSlot.append(create('p','forecast-quality-warning',
     'Анализ частичный: доступны только загруженные '+lastRows.length+
     ' из '+lastTotal+' записей. Это не оценка эффективности модели.'));
   evidenceSlot.append(create('p','forecast-confluence-caveat',
    'Числа означают наличие своевременно сохранённых источников. '+
    'Новости и соцсети не считаются подтверждённым настроением; '+
    'TP не равен результату реальной сделки.'));
  }
  if(journalMode==='all'&&lastTotal>lastRows.length)
   summary.append(create('p','forecast-quality-warning',
    'Частичный журнал: загружены последние '+lastRows.length+
    ' из '+lastTotal+' записей. Совпадения могут быть неполными.'));
  if(!favorites.length){
   summary.append(create('p','muted','Добавьте активы в избранное.'));
   return;
  }
  for(const asset of favorites){
   const evidence=multiFrameAgreement(scoped,asset);
   const line=create('section','forecast-confluence-row');
   line.append(create('strong','',displayPair(asset)),
    create('span','forecast-confluence-state'+
     (evidence.aligned?' is-aligned':evidence.conflict?' is-conflict':''),
     evidence.aligned?
      'Совпадают '+evidence.active+'/3 · '+(evidence.side==='UP'?'рост':'снижение'):
      evidence.conflict?'Направления расходятся':
      'Нет двух актуальных направлений'));
   const frames=create('div','forecast-confluence-frames');
   for(const signal of evidence.signals){
    const title=signal.frame==='15m'?'M15':signal.frame==='4h'?'H4':'H1';
    frames.append(create('small','',title+': '+
     (signal.side==='UP'?'↑':signal.side==='DOWN'?'↓':'—')));
   }
   line.append(frames);summary.append(line);
  }
 }
 /**
  * Restore only the saved Room IDs, even when they are years older than the
  * 75 recent journal entries. Keep it on-demand to protect Android resources.
  */
 async function loadMarkedRows({force=false}={}){
  const key=selectedKey();
  if(markedLoading&&!force)return;
  if(!force&&markedReadyFor===key&&!markedError){
   if(journalMode==='tracked')renderRows();
   return;
  }
  const token=++markedFetchGeneration;
  markedLoading=true;markedError=null;markedReadyFor=null;
  markedRows=[];markedMissing=[];
  if(journalMode==='tracked')renderRows();
  const result=await getMobileMarkedResearchForecasts([...selected]);
  if(token!==markedFetchGeneration||key!==selectedKey())return;
  markedLoading=false;
  if(result.error||result.complete!==true){
   markedError=result.error||'Не удалось прочитать сохранённые сценарии.';
  }else{
   markedRows=result.forecasts;
   markedMissing=result.missingIds;
   markedReadyFor=key;
  }
  if(journalMode==='tracked'){
   const view=scenarioJournalState(displayedJournal(),{
    selectedIds:[...selected],hiddenIds:[...hidden],mode:journalMode,stage
   });
   if(!view.counts[stage]&&view.scenarios.length)
    stage=view.preferred;
   renderRows();
  }
 }
 let notificationFocusRequest=0;
 /**
  * Open an exact immutable Room forecast, including one older than the
  * ordinary journal page or not starred by the user. Never show another
  * scenario as a fallback to a missing notification ID.
  */
 async function openNotificationForecast(target){
  const container=id('forecast-notification-focus');
  if(!container)return false;
  const request=++notificationFocusRequest;
  container.hidden=false;
  container.dataset.forecastId=target.forecastId;
  container.replaceChildren(create('p','forecast-notification-state',
   'Открываем сценарий из уведомления · '+target.asset+
   ' · '+stageNotificationLabel(target.stage)+'…'));
  const result=await getMobileMarkedResearchForecasts([target.forecastId]);
  if(request!==notificationFocusRequest)return false;
  container.replaceChildren();
  const heading=create('div','forecast-notification-heading');
  const intro=create('div');
  intro.append(create('strong','','Из уведомления · '+target.asset),
   create('small','',stageNotificationLabel(target.stage)+
    ' · запись из локального журнала Room'));
  const close=create('button','ghost forecast-notification-close','Закрыть');
  close.type='button';
  close.addEventListener('click',()=>{
   notificationFocusRequest++;
   container.hidden=true;container.replaceChildren();
  });
  heading.append(intro,close);container.append(heading);
  if(result?.complete!==true||result.error||
   result.forecasts?.length!==1||
   result.forecasts[0]?.id!==target.forecastId||
   result.forecasts[0]?.asset!==target.asset){
   container.append(create('p','forecast-quality-warning',
    'Точная карточка сценария недоступна в Room. '+
    'Другой прогноз вместо неё не подставляется.'));
  }else{
   const record=result.forecasts[0];
   const observed=Array.isArray(record.stageEvents)&&
    record.stageEvents.some(event=>event.stage===target.stage);
   if(!observed)container.append(create('p','forecast-quality-warning',
    'Этап '+target.stage+' пока не подтверждён загруженным журналом Room. '+
    'Показан исходный сценарий без выдуманного события.'));
   const card=cardForForecast(record,{
    tracked:selected.has(record.id),
    onToggle:key=>{
     if(selected.has(key))selected.delete(key);else selected.add(key);
     persistSelected();renderRows();
     void openNotificationForecast(target);
    },
    onOpen:onSelectSymbol,getMini:renderMini
   });
   card.dataset.scenarioId=record.id;
   card.classList.add('forecast-notification-selected');
   for(const detail of card.querySelectorAll('details.forecast-compact-details, details.forecast-card-fold'))
    detail.open=true;
   container.append(card);
  }
  requestAnimationFrame(()=>{
   if(request!==notificationFocusRequest||container.hidden)return;
   container.scrollIntoView({behavior:'smooth',block:'start'});
   container.focus({preventScroll:true});
  });
  return result?.complete===true&&result.forecasts?.length===1;
 }
 function renderRows(){
  const box=id('research-forecast-list');box.replaceChildren();
  const journal=displayedJournal();
  const w=whaleCheckCoverage(journal);
  const shadow=whaleShadowOutcomes(journal,{
   evaluate:row=>row.interval==='1h'?
    verifiedDirectionalEvidence(row,{now:Date.now()}):
    multiFrameEvidence(row,{now:Date.now()})
  });
  const wSummary=id('forecast-whale-summary');
  if(wSummary)wSummary.textContent='W · проверка китов · '+
   (w.observed+w.noObservations)+'/'+w.published+
   ' проверено · наблюдения '+w.observed;
  const label=id('forecast-whale-coverage');
  if(label)label.textContent='W · проверка китов при публикации: '+
   (w.observed+w.noObservations)+' из '+w.published+
   ' доступных сценариев · с сохранёнными событиями '+w.observed+
   ' · без своевременных наблюдений '+w.noObservations+
   (w.legacy?' · старый архив без W '+w.legacy:'')+
   (w.invalid?' · требуют проверки '+w.invalid:'')+
   '. Проверенные завершения: с W '+shadow.withW.verifiedCompleted+
   ', без событий W '+shadow.withoutEvents.verifiedCompleted+
   '. История частичная; это не оценка вероятности или причины движения.';
  for(const b of document.querySelectorAll('[data-journal-stage]')){
   const on=b.dataset.journalStage===stage;
   b.classList.toggle('active',on);
   b.setAttribute('aria-pressed',on?'true':'false');
  }
  for(const b of document.querySelectorAll('[data-forecast-mode]')){
   const on=b.dataset.forecastMode===journalMode;
   b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on?'true':'false');
  }
  if(journalMode==='tracked'&&
    (markedLoading||markedError||markedReadyFor!==selectedKey())){
   const label=markedError?
    'Не удалось загрузить отмеченные сценарии из Room: '+markedError:
    'Загружаем все отмеченные прогнозы из Room, включая старый архив…';
   for(const key of FORECAST_STAGES)
    id('stage-count-'+key).textContent='—';
   id('forecast-pending-count').textContent='—';
   id('forecast-evaluated-count').textContent='—';
   id('forecast-quality-current-scope').textContent='Отмеченные';
   id('forecast-stat-all').replaceChildren();
   id('forecast-stat-all').hidden=true;
   const tracked=id('forecast-stat-tracked');
   tracked.hidden=false;
   tracked.replaceChildren(create('p','forecast-quality-note',label));
   id('forecast-multiframe-quality').replaceChildren();
   id('forecast-confluence-summary').replaceChildren();
   id('forecast-evidence-cohorts').replaceChildren();
   box.append(create('p','forecast-direction-empty',label));
   if(markedError){
    const retry=create('button','forecast-follow','Повторить чтение Room');
    retry.type='button';
    retry.addEventListener('click',()=>void loadMarkedRows({force:true}));
    box.append(retry);
   }
   return;
  }
  const view=scenarioJournalState(displayedJournal(),{
   selectedIds:[...selected],hiddenIds:[...hidden],mode:journalMode,stage
  });
  for(const [key,count] of Object.entries(view.counts))
   id('stage-count-'+key).textContent=String(count);
  // Header, badges and list refer to the same records and chosen mode.
  id('forecast-pending-count').textContent=String(view.inWork);
  id('forecast-evaluated-count').textContent=String(view.completed);
  const visible=view.visible;
  const directed=visible.filter(row=>Boolean(directionalHypothesis(row)));
  const multi=visible.filter(row=>Boolean(multiFrameHypothesis(row)));
  const legacy=view.archive;
  const expired=view.archiveUnverified;
  if(journalMode==='tracked'){
   box.append(create('p','forecast-marked-restored',
    'Сохранено отметок: '+selected.size+
    ' · найдено в Room: '+markedRows.length+
    (markedMissing.length?' · недоступно: '+markedMissing.length:'')+
    '. Архивные исследования показаны отдельно от этапов.'));
  }
  const renderCard=row=>{
   const card=cardForForecast(row,{
    tracked:selected.has(row.id),
    onToggle:key=>{
     if(selected.has(key))selected.delete(key);else selected.add(key);
     persistSelected();
     if(journalMode==='tracked')void loadMarkedRows({force:true});
     else renderRows();
    },
    onOpen:onSelectSymbol,getMini:renderMini
   });
   const tools=create('div','forecast-journal-row-tools');
   const remove=create('button','forecast-journal-hide',
    'Убрать из журнала');
   remove.type='button';
   remove.title='Скрыть карточку здесь, сохранив запись Room и статистику';
   remove.addEventListener('click',()=>{
    hidden.add(row.id);persistHidden();
    // Hidden rows never alter the immutable research log or result statistics.
    renderRows();
   });
   tools.append(remove);
   card.append(tools);
   return card;
  };
  if(journalMode==='tracked'&&markedMissing.length){
   box.append(create('p','forecast-quality-warning',
    'Не найдены в Room: '+markedMissing.length+
    ' сохранённых отметок. Они не удалены из настроек и не засчитаны как прогнозы.'));
  }
  if(!directed.length&&!multi.length&&!legacy.length&&!expired.length){
   box.append(create('p','forecast-direction-empty',
    journalMode==='tracked'?
     (selected.size?
      'Все сохранённые направленные сценарии загружены, но на этом этапе их нет. Выберите другой этап.':
      'Нет отмеченных сценариев. Отметить прогноз можно звёздочкой в журнале «Все».'):
     'На выбранном этапе нет направленных сценариев M15, H1 или H4.'));
  }else {
   for(const row of directed)box.append(renderCard(row));
   for(const row of multi)box.append(renderCard(row));
  }
  if(expired.length){
   const archive=create('details','forecast-expired-archive');
   archive.append(create('summary','forecast-range-archive-title',
    'Просроченные · без подтверждённого исхода · '+expired.length),
    create('p','forecast-range-archive-note',
     'Это не завершённые сделки. Срок исследования истёк, но Room '+
     'не подтвердил итог. История сохранена для проверки.'));
   for(const row of expired){
    const card=renderCard(row);
    card.prepend(create('p','forecast-expired-label',
     'Архив без результата · '+row.archiveReason));
    archive.append(card);
   }
   box.append(archive);
  }
  if(hidden.size){
   const undo=create('details','forecast-hidden-archive');
   undo.append(create('summary','forecast-range-archive-title',
    'Скрытые карточки · '+hidden.size+' · восстановить'));
   undo.append(create('p','forecast-range-archive-note',
    'Скрытие убирает карточку с экрана, не удаляет исходный прогноз из Room.'));
   const allHidden=[...hidden].slice(-300).reverse();
   for(const key of allHidden){
    const row=displayedJournal().find(x=>x.id===key);
    const line=create('div','forecast-hidden-row');
    const title=create('small','',row?
     displayPair(row.asset)+' · '+row.interval+' · '+
      new Date(row.publishedAt).toLocaleString('ru-RU'):
      'ID '+key);
    const restore=create('button','ghost','Вернуть');
    restore.type='button';
    restore.addEventListener('click',()=>{
     hidden.delete(key);persistHidden();renderRows();
    });
    line.append(title,restore);undo.append(line);
   }
   const all=create('button','ghost forecast-hidden-restore-all','Вернуть все');
   all.type='button';
   all.addEventListener('click',()=>{hidden.clear();persistHidden();renderRows();});
   undo.append(all);box.append(undo);
  }
  if(legacy.length){
   const archive=create('details','forecast-range-archive');
   archive.open=journalMode==='tracked'||archiveExpanded;
   archive.append(create('summary','forecast-range-archive-title',
    'Архив прежних диапазонов · '+legacy.length),
    create('p','forecast-range-archive-note',
     'Старые исследования сохранены без изменения направления или TP/SL. Они не блокируют новые направленные сценарии.'));
   for(const row of legacy)archive.append(renderCard(row));
   archive.addEventListener('toggle',()=>{archiveExpanded=archive.open;});
   box.append(archive);
  }
  renderStats();
  renderMultiFrame();
 }
 async function loadJournal(){
  const seq=++journalGeneration;
  const data=await getMobileResearchForecasts(75);
  if(seq!==journalGeneration)return;
  if(!data.native||data.error){
   lastRows=[];lastTotal=0;
   for(const x of FORECAST_STAGES)id('stage-count-'+x).textContent='0';
   renderRows();
   // Unknown source is not zero live scenarios; keep the explicit offline mark.
   id('forecast-pending-count').textContent='—';
   id('forecast-evaluated-count').textContent='—';
   id('research-forecast-list').replaceChildren(create('p','muted',
    data.error?'Локальный журнал недоступен: '+data.error:
    'Журнал исследований доступен в Android APK.'));
   return;
  }
  lastRows=Array.isArray(data.forecasts)?data.forecasts:[];
  lastTotal=data.publishedCount||lastRows.length;
  const scope=scenarioJournalState(lastRows,{
   selectedIds:[...selected],hiddenIds:[...hidden],mode:journalMode,stage
  });
  if(!stageTouched&&journalMode==='all')stage=scope.preferred;
  for(const b of document.querySelectorAll('[data-forecast-stage]')){
   const on=b.dataset.forecastStage===stage;
   b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');
  }
  if(journalMode==='tracked')void loadMarkedRows({force:true});
  else renderRows();
 }
 function getScenarioRows(asset){
  return lastRows.filter(x=>x.asset===asset&&
   ['PENDING_CONFIRMATION','CONFIRMED','ACTIVE'].includes(forecastStage(x)));
 }
 function message(text,error=false){
  const node=id('forecast-action-status');
  node.textContent=text;node.classList.toggle('is-offline',error);
  // Routine diagnostics remain folded; real synchronization failures must
  // become visible so the user is not left with silently stale information.
  if(error){
   const details=id('forecast-system-details');
   if(details)details.open=true;
  }
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
   const unclear=result.reports.filter(x=>x.state==='NO_CLEAR_DIRECTION').length;
   const ongoing=result.reports.filter(x=>x.state==='UPDATED').length;
   message('Проверено активов: '+result.checked+
    (created?' · новых направленных сценариев: '+created:' · новых направленных сценариев нет')+
    (ongoing?' · уже наблюдаются: '+ongoing:'')+
    (unclear?' · направление не определено для '+unclear+' активов':'')+
    (missing.length?' · недостаточно исходных данных: '+missing.length:'')+
    '. TP1–TP3 и SL появляются только в новых направленных сценариях.');
  }catch(e){
   message('Проверка избранного: '+String(e?.message||e),true);
  }finally{
   syncing=false;await loadJournal();
   onResearchSynced?.();
   if(document.body.dataset.view==='overview')
    for(const symbol of favorites){
     MINI_AT.delete(symbol);
     const slot=[...document.querySelectorAll('[data-spark-symbol]')]
      .find(n=>n.dataset.sparkSymbol===symbol);
     if(slot)renderMini(symbol,slot);
    }
  }
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
   journalMode=button.dataset.forecastMode;
   if(journalMode==='tracked'){
    if(markedReadyFor===selectedKey()&&!markedError){
     const view=scenarioJournalState(displayedJournal(),{
      selectedIds:[...selected],hiddenIds:[...hidden],mode:journalMode,stage
     });
     if(!view.counts[stage]&&view.scenarios.length)
      stage=view.preferred;
     renderRows();
    }else void loadMarkedRows();
   }else{
    const view=scenarioJournalState(lastRows,{
     selectedIds:[...selected],hiddenIds:[...hidden],mode:journalMode,stage
    });
    if(!view.counts[stage])stage=view.preferred;
    renderRows();
   }
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
   // Reconcile existing stars with native DataStore after reinstall/upgrade.
   await syncNativeMarks();
   onFavoritesChanged?.(favorites.slice());
   renderFavorites();refreshFavoritePrices();await loadJournal();
   void sync(true);
  },
  selectChanged(){renderFavorites();},
  openForecasts(){void loadJournal();void sync(false);},
  openNotificationForecast,
  resume(){void sync(false);},
  getFavorites:()=>[...favorites],
  hasFavorite:symbol=>favorites.includes(symbol),
  isNative:()=>native,
  toggleSymbol:symbol=>updateFavorite(symbol,!favorites.includes(symbol)),
  getScenarioRows,
  refreshJournal:loadJournal,
  renderMini,
  openOverviewSummary:()=>{
   renderFavorites();refreshFavoritePrices();void loadJournal();
   for(const symbol of favorites){
    const slot=[...document.querySelectorAll('[data-spark-symbol]')]
     .find(n=>n.dataset.sparkSymbol===symbol);
    if(slot)renderMini(symbol,slot);
   }
  }
 };
}
