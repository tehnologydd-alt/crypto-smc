/**
 * APEX Radar page — research-only market discovery.
 * No orders, AI votes, or fabricated confidence. Automatic research scans
 * only saved favorites and only confirmed closed candle timeframes.
 */
import {fetchCandles} from './candles.mjs';
import {getMobileRadarHistory} from './mobile-bridge.mjs';
import {validateRadarObservation} from './radar-changes.mjs';
import {createRadarDisplayCache} from './radar-display-cache.mjs';
import {readRadarAutoCheckpoints,writeRadarAutoCheckpoint,
 selectRadarAutoFrame} from './radar-auto-policy.mjs';
import {analyzeMarketFrame,compareMarketFrames,MARKET_FRAMES} from './market-core.mjs';
import {readRadarChanges,saveRadarChanges,mergeRadarObservation,
 createRadarObservation,radarChangeCount} from './radar-changes.mjs';
import {getFavoriteRadarNotices} from './favorite-radar.mjs';
import {fetchRadarUniverse,describeRadarFrame,filterRadarRows,
 RADAR_LIMIT,validRadarInterval} from './radar-core.mjs';

const id=name=>document.getElementById(name);
const create=(tag,className='',value)=>{
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(value!==undefined)el.textContent=String(value);
 return el;
};
const fmt=(n,d=2)=>Number.isFinite(n)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n):'—';
const shortMoney=n=>Number.isFinite(n)?
 new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD',
  notation:'compact',maximumFractionDigits:2}).format(n):'—';
const date=n=>Number.isSafeInteger(n)?
 new Date(n).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit'}):'—';
const nicePair=s=>s.endsWith('USDT')?s.slice(0,-4)+'/USDT':s;
const DIRECTION=Object.freeze({UP:'↑ Рост',DOWN:'↓ Снижение',FLAT:'→ Боковое',UNKNOWN:'—'});
const MODE=Object.freeze({DIRECTIONAL:'Направленный участок',RANGE:'Диапазон',MIXED:'Смешанный',UNKNOWN:'—'});
const FRAME=Object.freeze({'15m':'M15','1h':'H1','4h':'H4','1d':'D1'});
const UNIVERSE_MS=8*60000;
const ALIGNMENT_STATE=Object.freeze({
 INSUFFICIENT:'Недостаточно подтверждений',DIVERGENT:'Разнонаправленные таймфреймы',
 UP_CONTEXT:'Преобладает наблюдаемый рост',
 DOWN_CONTEXT:'Преобладает наблюдаемое снижение',
 MIXED:'Смешанное движение'
});
const FRAME_STATUS=Object.freeze({
 OK:'Подтверждено',STALE:'Устарело',GAP:'Пропуски',
 INVALID:'Ошибка данных',OFFLINE:'Нет сети',RATE_LIMITED:'Лимит API',
 INSUFFICIENT:'Мало свечей',MISSING:'Нет данных'
});
const DIRECTION_FULL=Object.freeze({UP:'Рост',DOWN:'Снижение',FLAT:'Боковое',UNKNOWN:'—'});
const EVENT_TEXT=Object.freeze({
 DIRECTION:'Смена направления',MODE:'Смена режима',
 SPEED_UP:'Усиление движения',SPEED_DOWN:'Ослабление движения',
 VOLUME_UP:'Рост относительного объёма',VOLUME_DOWN:'Снижение относительного объёма'
});

export function initRadarDashboard({getCatalog=()=>[],getFavorites=()=>[],onOpenAsset=()=>{}}={}){
 let lastUniverseSymbols='',interval='1h',filter='all',sort='turnover',request=0,controller=null,
  active=false,started=false,rows=[],lastScanAt=0,lastInterval=null,
  universe=null,universeAt=0,failures=0,total=0;
 const storage=(()=>{try{return globalThis.localStorage||null;}catch{return null;}})();
 const history=readRadarChanges(storage);
 const displayCache=createRadarDisplayCache({storage});
 const checkpoints=readRadarAutoCheckpoints(storage);
 const frameRows=new Map(),frameChecked=new Map();
 let timer=null;
 function uiRows(frame){
  return frameRows.get(frame)||displayCache.read(frame,getFavorites());
 }
 function syncUi(){
  if(!active)return;
  rows=uiRows(interval);
  render();
  const latest=frameChecked.get(interval);
  const label=latest?date(latest):
   rows.length?'Сохранённые наблюдения, обновление будет после закрытой свечи':
   'Ожидаются первые автоматические проверки';
  status(latest?'Последняя проверка · '+label+' · '+FRAME[interval]+
   ' · только завершённые свечи':label);
 }
 const alignment=new Map();
 let alignmentController=null,alignmentGeneration=0,alignmentSymbol=null;
 let focusedSymbol=null,focusedInterval=null;
 function renderFocus(){
  const panel=id('radar-focus-panel');
  panel.replaceChildren();panel.hidden=!focusedSymbol;
  if(!focusedSymbol)return;
  const notices=getFavoriteRadarNotices([focusedSymbol],history,{now:Date.now()});
  const detail=notices.find(x=>x.interval===focusedInterval);
  const head=create('div','radar-focus-head');
  head.append(create('strong','',
   nicePair(focusedSymbol)+' · '+(FRAME[focusedInterval]||focusedInterval)));
  const dismiss=create('button','radar-focus-dismiss','Закрыть');
  dismiss.type='button';dismiss.setAttribute('aria-label','Закрыть выбранное событие');
  dismiss.addEventListener('click',()=>{
   focusedSymbol=null;focusedInterval=null;renderFocus();
  });
  head.append(dismiss);panel.append(head);
  if(!detail){
   panel.append(create('p','radar-focus-note',
    'Последнее событие больше не считается актуальным или его исходные данные недоступны.'));
   return;
  }
  const timing=create('p','radar-focus-timing',
   'Сравнение двух закрытых свечей · '+date(detail.beforeAt)+' → '+date(detail.candleAt));
  panel.append(timing);
  const events=create('div','radar-focus-events');
  for(const event of detail.events){
   const tile=create('div','radar-focus-event');
   tile.append(create('strong','',event.label),create('span','',event.description));
   events.append(tile);
  }
  panel.append(events);
  panel.append(create('p','radar-focus-note',
   'Проверены только избранные активы. Сохранённое сравнение завершённых свечей не является прогнозом.'));
  const action=create('button','radar-focus-open','Открыть страницу актива');
  action.type='button';
  action.addEventListener('click',()=>onOpenAsset(focusedSymbol));
  panel.append(action);
 }

 function cancelAlignment(){
  if(alignmentController){alignmentController.abort();alignmentController=null;}
  alignmentGeneration++;
  if(alignmentSymbol&&alignment.get(alignmentSymbol)?.state==='LOADING')
   alignment.set(alignmentSymbol,{state:'CANCELLED'});
  alignmentSymbol=null;
 }
 async function inspectAlignment(symbol){
  if(!active||!rows.some(row=>row.symbol===symbol))return;
  cancelAlignment();
  const generation=alignmentGeneration,local=new AbortController();
  alignmentController=local;alignmentSymbol=symbol;
  const frameResults={};
  alignment.set(symbol,{state:'LOADING',checked:0});render();
  let limited=false;
  try{
   // On-demand and sequential: four genuine, fresh closed-bar histories, not 48 automatic requests.
   for(const frame of MARKET_FRAMES){
    if(local.signal.aborted||generation!==alignmentGeneration)break;
    const result=await fetchCandles(symbol,frame,{signal:local.signal,limit:64});
    if(local.signal.aborted||generation!==alignmentGeneration)break;
    let state=result.state;
    let summary=null;
    if(result.state==='OK'){
     summary=analyzeMarketFrame(result.candles,frame,{
      now:result.receivedAt,source:'Binance Spot'
     });
     state=summary.status;
    }
    frameResults[frame]={asset:symbol,interval:frame,state,
     summary:state==='OK'?summary:null};
    if(state==='RATE_LIMITED')limited=true;
    alignment.set(symbol,{state:'LOADING',checked:Object.keys(frameResults).length});
    render();
    if(limited)break;
   }
   if(local.signal.aborted||generation!==alignmentGeneration)return;
   const checked=compareMarketFrames(frameResults,{asset:symbol});
   alignment.set(symbol,{state:'COMPLETE',checked,limited});
   render();
  }catch(error){
   if(local.signal.aborted||generation!==alignmentGeneration)return;
   alignment.set(symbol,{state:'ERROR',
    reason:'Не удалось сверить таймфреймы: '+String(error?.message||error).slice(0,120)});
   render();
  }finally{
   if(generation===alignmentGeneration){
    alignmentController=null;alignmentSymbol=null;
   }
  }
 }

 const status=(msg,warning=false)=>{
  const node=id('radar-status');node.textContent=msg;
  node.dataset.state=warning?'warning':'normal';
 };
 const updateButtons=()=>{
  for(const btn of document.querySelectorAll('[data-radar-frame]')){
   const on=btn.dataset.radarFrame===interval;
   btn.classList.toggle('active',on);
   btn.setAttribute('aria-pressed',String(on));
  }
  for(const btn of document.querySelectorAll('[data-radar-filter]')){
   const on=btn.dataset.radarFilter===filter;
   btn.classList.toggle('active',on);
   btn.setAttribute('aria-pressed',String(on));
  }
  id('radar-sort').value=sort;
 };
 function render(){
  updateButtons();
  renderFocus();
  const root=id('radar-results');root.replaceChildren();
  const valid=rows.filter(row=>row.analysis?.state==='OK');
  id('radar-coverage').textContent=valid.length+' из '+(getFavorites()?.length||0)+' избранных';
  id('radar-change-count').textContent=radarChangeCount(rows)+' с изменениями';
  const sorted=filterRadarRows(rows,{filter,sort});
  if(!sorted.length){
   root.append(create('p','radar-empty',rows.length?
    filter==='events'?
     'Между проверенными свечами пока не обнаружено значимых изменений.':
     'По выбранному фильтру нет подтверждённых наблюдений.':
    'После проверки рыночных данных здесь появятся активы.'));
   return;
  }
  for(const row of sorted){
   const card=create('article','radar-record');
   const top=create('div','radar-record-top');
   const names=create('div','radar-record-name');
   names.append(create('strong','',nicePair(row.symbol)),
    create('small','',FRAME[interval]+' · Binance Spot'+
     (row.saved?' · сохранённый снимок':'')));

   const direction=create('span','radar-direction dir-'+row.analysis.direction.toLowerCase(),
    DIRECTION[row.analysis.direction]||'—');
   top.append(names,direction);card.append(top);
   const metrics=create('div','radar-record-metrics');
   const items=[
    ['Режим',MODE[row.analysis.mode]||'—'],
    ['Скорость · %/свеча',(row.analysis.movement>0?'+':'')+fmt(row.analysis.movement,3)+'%'],
    ['Ускорение · п.п./свеча²',row.analysis.acceleration===null?'—':
      (row.analysis.acceleration>0?'+':'')+fmt(row.analysis.acceleration,4)],
    ['Объём / медиана',row.analysis.volumeRatio===null?'—':fmt(row.analysis.volumeRatio,2)+'×'],
    ['Оборот · 24 ч',shortMoney(row.quoteVolume)]
   ];
   for(const [label,value] of items){
    const metric=create('div','radar-record-metric');
    metric.append(create('span','',label),create('strong','',value));
    metrics.append(metric);
   }
   card.append(metrics);
   const meta=create('div','radar-record-meta');
   meta.append(create('small','','Закрытие свечи: '+date(row.analysis.lastClosedAt)),
    create('small','','Изменение тикера 24 ч: '+
     (Number.isFinite(row.change24h)?(row.change24h>0?'+':'')+fmt(row.change24h,2)+'%':'нет снимка')));
   card.append(meta);
   const changeBox=create('div','radar-change-box');
   const compare=row.change;
   if(compare?.state==='CHANGED'){
    changeBox.classList.add('has-changes');
    changeBox.append(create('strong','radar-change-title',
     'Изменения между закрытыми свечами: '+date(compare.beforeAt)+
     ' → '+date(compare.afterAt)));
    const tags=create('div','radar-change-tags');
    for(const item of compare.events){
     const tag=create('span','radar-change-tag change-'+item.kind.toLowerCase(),
      EVENT_TEXT[item.kind]||item.description);
     tag.title=item.description;tags.append(tag);
    }
    changeBox.append(tags);
   }else{
    changeBox.append(create('span','radar-no-change',
     compare?.reason||'Изменения ещё не проверены'));
   }
   card.append(changeBox);
   const compareBtn=create('button','radar-align-button','Сверить M15 · H1 · H4 · D1');
   compareBtn.type='button';
   compareBtn.setAttribute('aria-label','Сверить четыре таймфрейма '+nicePair(row.symbol));
   compareBtn.disabled=alignment.get(row.symbol)?.state==='LOADING';
   compareBtn.addEventListener('click',()=>void inspectAlignment(row.symbol));
   card.append(compareBtn);
   const inspected=alignment.get(row.symbol);
   if(inspected){
    const panel=create('div','radar-alignment-result');
    if(inspected.state==='LOADING'){
     panel.append(create('p','radar-alignment-status',
      'Сверяем закрытые свечи: '+inspected.checked+' из 4 таймфреймов'));
    }else if(inspected.state==='COMPLETE'){
     const result=inspected.checked;
     panel.append(create('strong','radar-alignment-status',
      (ALIGNMENT_STATE[result.state]||'Не определено')+
      ' · проверено '+result.available+' из 4'));
     const frames=create('div','radar-alignment-frames');
     for(const frame of result.frames){
      const item=create('div','radar-alignment-frame'+(frame.status==='OK'?' is-ok':''));
      item.append(create('b','',FRAME[frame.interval]||frame.interval),
       create('span','',frame.status==='OK'?
        DIRECTION_FULL[frame.direction]:FRAME_STATUS[frame.status]||frame.status));
      frames.append(item);
     }
     panel.append(frames);
     if(inspected.limited)panel.append(create('p','radar-alignment-note',
      'Биржа ограничила запросы: часть горизонтов не проверена.'));
     panel.append(create('p','radar-alignment-note',
      'Согласованность прошлых свечей не является вероятностью прогноза.'));
    }else{
     panel.append(create('p','radar-alignment-status',
      inspected.state==='CANCELLED'?'Проверка прервана':
       inspected.reason||'Проверка недоступна'));
    }
    card.append(panel);
   }
   const open=create('button','radar-open','Открыть подробный анализ');
   open.type='button';open.setAttribute('aria-label','Анализ актива '+nicePair(row.symbol));
   open.addEventListener('click',()=>onOpenAsset(row.symbol));
   card.append(open);root.append(card);
  }
 }
 function clearRun(){
  if(controller){controller.abort();controller=null;}
  cancelAlignment();
  request++;
  id('radar-refresh').disabled=false;
 }
 /** Merge only validated native closed-candle observations for currently
  * saved favorites, never synthesize a tick or relabel a historical record.
  */
 async function syncNative(){
  const native=await getMobileRadarHistory();
  if(!native.native)return;
  const allowed=new Set(getFavorites());
  let updated=false;
  for(const pair of native.records){
   const latest=pair?.latest,previous=pair?.previous;
   if(!validateRadarObservation(latest)||!allowed.has(latest.symbol))continue;
   const key=latest.symbol+'|'+latest.interval;
   const old=history[key];
   if(old?.latest?.candleAt>=latest.candleAt)continue;
   if(validateRadarObservation(previous)&&
    previous.symbol===latest.symbol&&previous.interval===latest.interval&&
    (!old||old.latest.candleAt<previous.candleAt)){
    mergeRadarObservation(history,previous);
   }
   mergeRadarObservation(history,latest);
   updated=true;
  }
  if(!updated)return;
  saveRadarChanges(storage,history);
  for(const frame of ['15m','1h','4h','1d']){
   const selected=new Set(getFavorites());
   const entries=Object.values(history).filter(item=>
    item?.latest?.interval===frame&&selected.has(item.latest.symbol));
   if(entries.length)displayCache.save(frame,entries);
   frameRows.delete(frame);
  }
  syncUi();
  window.dispatchEvent(new CustomEvent('apex-radar-updated'));
 }
 function progress(frame,message,warning=false){
  if(active&&interval===frame)status(message,warning);
 }
 async function scan({force=false,frame=interval}={}){
  if(!started||document.hidden)return;
  // Manual refresh may replace one background request, not create another.
  if(controller){
   if(!force)return;
   clearRun();
  }
  const favorites=getFavorites();
  const allowed=new Set(favorites);
  const catalog=[...allowed].filter(symbol=>/^[A-Z0-9]{2,16}USDT$/.test(symbol));
  if(!catalog.length){
   progress(frame,'Радар наблюдает только избранные. Добавьте актив в каталоге.');
   return;
  }
  const generation=++request,local=new AbortController();
  controller=local;
  if(active&&interval===frame)id('radar-refresh').disabled=true;
  const selectedFrame=frame,desired=catalog.slice().sort().join(',');
  progress(frame,'Проверяем завершённые свечи '+FRAME[frame]+' у избранных…');
  try{
   const fresh=force||!universe||Date.now()-universeAt>UNIVERSE_MS||
    lastUniverseSymbols!==desired;
   if(fresh){
    const next=await fetchRadarUniverse({catalog,signal:local.signal});
    if(next.state==='OK'){
     universe=next;universeAt=Date.now();lastUniverseSymbols=desired;
    }else if(!universe||lastUniverseSymbols!==desired){
     progress(frame,'Публичные тикеры недоступны: '+next.reason,true);
     return;
    }
   }
   if(generation!==request||local.signal.aborted)return;
   const candidate=universe.rows.filter(row=>allowed.has(row.symbol));
   const freshRows=[], failures=[];
   let stopForLimit=false;
   for(let offset=0;offset<candidate.length;offset+=3){
    if(local.signal.aborted||generation!==request)break;
    const batch=candidate.slice(offset,offset+3);
    const checked=await Promise.all(batch.map(async ticker=>{
     const received=await fetchCandles(ticker.symbol,selectedFrame,{
      signal:local.signal,limit:64
     });
     if(received.state!=='OK')return {ticker,state:received.state};
     const measured=analyzeMarketFrame(received.candles,selectedFrame,{
      now:received.receivedAt,source:'Binance Spot'
     });
     const analysis=describeRadarFrame(measured);
     return {ticker,state:analysis.state,analysis};
    }));
    if(local.signal.aborted||generation!==request)break;
    for(const item of checked){
     if(item.state==='RATE_LIMITED')stopForLimit=true;
     if(item.state!=='OK'){failures.push(item.ticker.symbol+': '+item.state);continue;}
     // A favorite may have been removed while the HTTP request was in flight.
     if(!getFavorites().includes(item.ticker.symbol))continue;
     const row={...item.ticker,analysis:item.analysis,saved:false};
     const observation=createRadarObservation(row,selectedFrame,{now:Date.now()});
     row.change=observation?mergeRadarObservation(history,observation):
      {state:'INVALID',events:[],reason:'Снимок не прошёл проверку истории'};
     freshRows.push(row);
    }
    if(stopForLimit)break;
   }
   if(generation!==request||local.signal.aborted)return;
   const still=new Set(getFavorites());
   const preserved=displayCache.read(selectedFrame,getFavorites());
   const byName=new Map(preserved.map(row=>[row.symbol,row]));
   for(const row of freshRows)if(still.has(row.symbol))byName.set(row.symbol,row);
   const merged=[...byName.values()].filter(row=>still.has(row.symbol));
   frameRows.set(selectedFrame,merged);
   frameChecked.set(selectedFrame,Date.now());
   if(freshRows.length){
    saveRadarChanges(storage,history);
    displayCache.save(selectedFrame,Object.values(history).filter(pair=>
     pair?.latest?.interval===selectedFrame&&still.has(pair.latest.symbol)));
    window.dispatchEvent(new CustomEvent('apex-radar-updated'));
   }
   if(active&&interval===selectedFrame){
    rows=merged;render();
   }
   progress(selectedFrame,'Автопроверка '+FRAME[selectedFrame]+' · '+freshRows.length+
    ' свежих из '+catalog.length+
    (failures.length?' · '+failures.length+' без подтверждения':'')+
    ' · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),
    Boolean(failures.length));
  }catch(e){
   if(generation===request&&!local.signal.aborted)
    progress(frame,'Проверка недоступна: '+String(e?.message||e).slice(0,125),true);
  }finally{
   if(generation===request){
    controller=null;id('radar-refresh').disabled=false;
   }
  }
 }
 function autoTick(){
  if(!started||document.hidden||controller)return;
  const plan=selectRadarAutoFrame(getFavorites(),checkpoints,{now:Date.now()});
  if(plan.state!=='DUE')return;
  writeRadarAutoCheckpoint(storage,checkpoints,plan,Date.now());
  void scan({frame:plan.frame});
 }
 for(const button of document.querySelectorAll('[data-radar-frame]')){
  button.addEventListener('click',()=>{
   const next=button.dataset.radarFrame;
   if(!validRadarInterval(next)||interval===next)return;
   interval=next;rows=uiRows(next);updateButtons();syncUi();
  });
 }
 for(const button of document.querySelectorAll('[data-radar-filter]')){
  button.addEventListener('click',()=>{
   filter=button.dataset.radarFilter;render();
  });
 }
 id('radar-sort').addEventListener('change',event=>{
  sort=event.target.value;render();
 });
 id('radar-refresh').addEventListener('click',()=>void scan({force:true,frame:interval}));
 // Do not call render() here: favorites manager initializes later in app.mjs.
 // start() renders only AFTER native favorites have loaded, avoiding a TDZ crash.
 return {
  start(){
   if(started)return;
   started=true;
   for(const frame of ['15m','1h','4h','1d']){
    const restored=displayCache.read(frame,getFavorites());
    if(restored.length)frameRows.set(frame,restored);
   }
   rows=uiRows(interval);render();
   void syncNative();
   autoTick();
   timer=setInterval(autoTick,60000);
   document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){void syncNative();autoTick();}
    else if(controller){controller.abort();}
   });
  },
  open(){active=true;syncUi();void syncNative();},
  focus(symbol,frame){
   if(typeof symbol!=='string'||!/^[A-Z0-9]{5,20}$/.test(symbol)||
    !validRadarInterval(frame))return false;
   if(!getFavorites().includes(symbol))return false;
   focusedSymbol=symbol;focusedInterval=frame;interval=frame;filter='all';
   rows=uiRows(frame);syncUi();
   return true;
  },
  close(){active=false;cancelAlignment();},
  favoritesChanged(){
   const allowed=new Set(getFavorites());
   for(const [frame,list] of frameRows)
    frameRows.set(frame,list.filter(row=>allowed.has(row.symbol)));
   rows=uiRows(interval);
   // Never display removed favorites or keep stale archive entries as current.
   syncUi();
   autoTick();
  },
  syncNative,
  catalogChanged(){},
  autoTick
 };
}
