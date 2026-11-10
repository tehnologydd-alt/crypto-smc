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
 async function scan({force=false}={}){
  if(!active)return;
  if(!force&&lastInterval===interval&&lastScanAt&&
   Date.now()-lastScanAt<REFRESH_MS){render();return;}
  clearRun();
  const generation=request,chosen=interval;
  const local=new AbortController();
  controller=local;rows=[];failures=0;total=0;
  alignment.clear();
  lastScanAt=0;lastInterval=null;
  render();id('radar-refresh').disabled=true;
  status('Запрашиваем публичный список торговых пар…');
  const favorites=getFavorites();
  const allow=new Set(Array.isArray(favorites)?favorites.slice(0,10):[]);
  const catalog=[...allow].filter(symbol=>/^[A-Z0-9]{2,16}USDT$/.test(symbol));
  if(!allow.size){
   status('Радар анализирует только избранное. Добавьте актив через каталог.');
   if(generation===request){controller=null;id('radar-refresh').disabled=false;}
   return;
  }
  if(!catalog.length){
   status('Для избранных Spot-пар пока нет подтверждённого каталога.',true);
   if(generation===request){controller=null;id('radar-refresh').disabled=false;}
   return;
  }
  try{
   const currentSet=catalog.slice().sort().join(',');
   const fresh=force||!universe||Date.now()-universeAt>UNIVERSE_MS||
    lastUniverseSymbols!==currentSet;
   if(fresh){
    universe=await fetchRadarUniverse({catalog,signal:local.signal});
    if(universe.state==='OK'){universeAt=Date.now();lastUniverseSymbols=currentSet;}
   }
   if(generation!==request||local.signal.aborted)return;
   if(universe.state!=='OK'){
    status('Проверка рынка недоступна: '+universe.reason,true);return;
   }
   total=universe.rows.length;render();
   status('Проверяем '+total+' активов · '+FRAME[chosen]+
    ' · не более трёх запросов одновременно.');
   let stopForLimit=false;
   // Bounded batches prevent phone bandwidth and API exhaustion.
   for(let offset=0;offset<universe.rows.length;offset+=3){
    if(local.signal.aborted||generation!==request)break;
    const batch=universe.rows.slice(offset,offset+3);
    const received=await Promise.all(batch.map(async ticker=>{
     const response=await fetchCandles(ticker.symbol,chosen,{
      signal:local.signal,limit:64
     });
     if(response.state!=='OK'){
      return {ticker,state:response.state,reason:response.error};
     }
     const raw=analyzeMarketFrame(response.candles,chosen,{
      now:response.receivedAt,source:'Binance Spot'
     });
     const analysis=describeRadarFrame(raw);
     return {ticker,state:analysis.state,analysis};
    }));
    if(generation!==request||local.signal.aborted)break;
    for(const item of received){
     if(item.state==='RATE_LIMITED')stopForLimit=true;
     if(item.state!=='OK'){failures++;continue;}
     const next={...item.ticker,analysis:item.analysis};
     const record=createRadarObservation(next,chosen,{now:Date.now()});
     next.change=record?mergeRadarObservation(history,record):
      {state:'INVALID',events:[],reason:'Снимок не прошёл проверку истории'};
     rows.push(next);
    }
    render();
    status('Проверено '+Math.min(offset+batch.length,total)+' из '+total+
     ' · доступны '+rows.length+(failures?' · без подтверждения '+failures:'')+
     ' · '+FRAME[chosen],Boolean(failures));
    if(stopForLimit)break;
   }
   if(generation!==request||local.signal.aborted)return;
   if(saveRadarChanges(storage,history)){
    // Same-document Android favorites react to committed, validated research only.
    window.dispatchEvent(new CustomEvent('apex-radar-updated'));
   }
   lastScanAt=Date.now();lastInterval=chosen;
   status('Сканирование завершено · '+rows.length+' из '+total+
    ' активов с актуальными свечами'+
    (stopForLimit?' · лимит API, часть пар не проверена':
      failures?' · '+failures+' без достаточных данных':'')+
    ' · '+new Date(lastScanAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),
    Boolean(failures));
  }catch(e){
   if(generation===request&&!local.signal.aborted)
    status('Не удалось проверить рынок: '+String(e?.message||e).slice(0,160),true);
  }finally{
   if(generation===request){controller=null;id('radar-refresh').disabled=false;}
  }
 }
 for(const button of document.querySelectorAll('[data-radar-frame]')){
  button.addEventListener('click',()=>{
   const next=button.dataset.radarFrame;
   if(!validRadarInterval(next)||interval===next)return;
   interval=next;lastScanAt=0;updateButtons();
   void scan({force:false});
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
 id('radar-refresh').addEventListener('click',()=>void scan({force:true}));
 render();
 return {
  open(){active=true;renderFocus();void scan();},
  focus(symbol,frame){
   if(typeof symbol!=='string'||!/^[A-Z0-9]{5,20}$/.test(symbol)||
    !validRadarInterval(frame))return false;
   if(!getFavorites().includes(symbol))return false;
   focusedSymbol=symbol;focusedInterval=frame;
   interval=frame;filter='all';lastScanAt=0;lastInterval=null;
   render();
   return true;
  },
  close(){active=false;
   if(controller)clearRun();
   else cancelAlignment();
  },
  catalogChanged(){if(active&&!controller&&!rows.length)void scan();}
 };
}
