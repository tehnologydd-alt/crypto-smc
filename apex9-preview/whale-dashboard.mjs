/**
 * Whale Intelligence / Stage 1, existing Asset → Data screen.
 * All network requests are opt-in foreground and favorite-only.
 * No background polling, orders, wallet attribution, or trading signals.
 */
import {collectWhaleObservations,chainForWhaleAsset,
 formatNativeAmount,WHALE_MIN_ATOMIC} from './whale-observer.mjs';
import {getMobileWhaleHistory,saveMobileWhaleObservations,
 getMobileCandles,saveMobileCandles} from './mobile-bridge.mjs';
import {analyzeWhaleActivity,WHALE_STUDY_POLICY}
 from './whale-activity-analysis.mjs';
import {fetchCandles} from './candles.mjs';

const node=id=>document.getElementById(id);
const make=(tag,klass='',value='')=>{
 const el=document.createElement(tag);
 if(klass)el.className=klass;
 el.textContent=String(value);
 return el;
};
const short=x=>typeof x==='string'&&x.length>25?
 x.slice(0,12)+'…'+x.slice(-9):x||'—';
const time=x=>Number.isSafeInteger(x)&&x>0?
 new Date(x).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit'}):'—';
export function initWhaleDashboard({getFavorites=()=>[]}={}){
 let asset='',seq=0,abort=null,marketAbort=null;
 let latestEvents=[],marketBusy=false;
 const marketChecks=new Map(); // Per-asset explicit H1 requests, at most 10
 const requests=new Map(); // at most 10 recently selected favorites
 const setStatus=(msg,bad=false)=>{
  const n=node('whale-status');
  if(!n)return;
  n.textContent=msg;n.classList.toggle('is-offline',bad);
 };
 function summarize(asset,events,candles,token){
  if(token!==seq)return;
  const report=analyzeWhaleActivity(events,candles,{
   asset,now:Date.now()});
  const metrics=node('whale-analysis-metrics'),
   repeated=node('whale-analysis-repeated'),
   resultNode=node('whale-market-report'),
   status=node('whale-market-status');
  if(!metrics||!repeated||!resultNode||!status)return;
  const activity=report.activity;
  if(!activity){
   metrics.replaceChildren(make('p','muted','Нет подтверждённого адаптера.'));
   repeated.textContent='Нет данных об адресах.';
   status.textContent='Для выбранного актива исследование недоступно.';
   resultNode.replaceChildren();
   return;
  }
  const units=[
   ['Уникальных TX',activity.transactions],
   ['Снимков источника',activity.observedBatches],
   ['Замечено за 24 часа',activity.recent24h],
   ['Повторных адресов',activity.repeatAddresses.length]
  ];
  const frag=document.createDocumentFragment();
  for(const [name,value] of units){
   const card=make('div','whale-analysis-stat');
   card.append(make('small','',name),make('strong','',value));
   frag.append(card);
  }
  metrics.replaceChildren(frag);
  repeated.textContent=activity.repeatAddresses.length?
   'Повторно замечены (не доказана общая принадлежность): '+
   activity.repeatAddresses.map(x=>x.role+' '+short(x.address)+
    ' · '+x.transactions+' TX').join(' · '):
   'Повторяющиеся адреса пока не подтверждены. Отсутствие записей не доказывает отсутствие переводов.';
  const study=report.price;
  const counts='Независимых наблюдений '+study.eligibleIndependent+
   '/'+study.requiredIndependent+
   ' · без ценовых данных '+study.excludedMissingPrice+
   ' · горизонт не завершён '+study.excludedPendingFuture+
   ' · пересекающиеся окна '+study.excludedOverlapping+'. ';
  status.textContent=study.state==='DESCRIPTIVE'?
   counts+'Описательное сравнение готово; прогностическая польза НЕ установлена.':
   counts+(study.state==='INVALID_CANDLES'?
    'H1-архив требует проверки целостности.':
    study.state==='NO_CANDLES'?'Нет сохранённых H1-свечей.':
    'Нужно не меньше 8 независимых завершённых наблюдений в двух временных частях.');
  resultNode.replaceChildren();
  if(study.state!=='DESCRIPTIVE')return;
  const fragment=document.createDocumentFragment();
  for(const [name,cohort] of [
   ['Первая временная часть',study.cohortA],
   ['Следующая независимая часть',study.cohortB]]){
   const card=make('div','whale-market-cohort');
   const signed=x=>(x>0?'+':'')+x.toFixed(3)+'%';
   card.append(make('strong','',name+' · '+cohort.count+' событий'),
    make('p','',
     'Медиана изменения через 1ч: '+signed(cohort.medianAfter1hPct)+
     ' · через 4ч: '+signed(cohort.medianAfter4hPct)),
    make('small','',
     'Медиана |4ч после|: '+cohort.medianAbsoluteAfter4hPct.toFixed(3)+
     '% · |4ч до|: '+cohort.medianAbsoluteBefore4hPct.toFixed(3)+
     '% · рост/снижение: '+cohort.positiveAfter4h+
     '/'+cohort.negativeAfter4h));
   fragment.append(card);
  }
  resultNode.replaceChildren(fragment);
 }
 function draw(rows,{historical=true}={}){
  const place=node('whale-history');
  if(!place)return;
  const frag=document.createDocumentFragment();
  for(const event of rows.slice(0,35)){
   const card=make('article','whale-event');
   const heading=make('div','whale-event-title');
   heading.append(make('strong','',
    formatNativeAmount(event.amountAtomic,event.network)),
    make('span','',
     event.network==='bitcoin'?'BTC · выход транзакции':'ETH · перевод'));
   card.append(heading);
   const details=make('p','whale-event-identity',
    (event.network==='bitcoin'?'Адрес выхода (возможная сдача): ':
     'Отправитель: '+short(event.from)+' · Получатель: ')+short(event.to));
   card.append(details);
   card.append(make('small','whale-event-meta',
    (event.confirmation==='VALIDATED_AT_FETCH'?
     'Подтверждён при проверке':'Не подтверждён при проверке')+
    ' · '+(event.timeBasis==='CLIENT_SEEN'?'Замечен телефоном ':'Время блока ')+
    time(event.observedAt)+' · TX '+short(event.txid)+
    (historical?' · локальный архив':'')));
   frag.append(card);
  }
  if(!rows.length)frag.append(make('p','muted',
   'В сохранённой истории нет подходящих записей. Это не означает отсутствия крупных переводов в сети.'));
  place.replaceChildren(frag);
 }
 async function readLocal(current,token){
  const [read,candleCache]=await Promise.all([
   getMobileWhaleHistory(current,80),
   getMobileCandles(current,'1h',WHALE_STUDY_POLICY.maxCandles)
  ]);
  if(token!==seq||current!==asset)return null;
  latestEvents=read.complete?read.events:[];
  if(read.complete){
   draw(read.events);
   node('whale-count').textContent=read.events.length+' в выборке Room';
  }else{
   draw([]);
   node('whale-count').textContent='Нет локального архива';
  }
  summarize(current,latestEvents,candleCache.candles||[],token);
  return read;
 }
 async function refresh(next,{force=false}={}){
  if(typeof next!=='string'||next!==asset){
   seq++;abort?.abort();abort=null;asset=next;
  }
  const token=++seq,chain=chainForWhaleAsset(next);
  if(!chain){
   draw([]);node('whale-count').textContent='0';
   setStatus('Для этого актива пока нет проверенного адаптера переводов. BTC и ETH поддерживаются; данные другой монеты не подменяем.');
   return;
  }
  await readLocal(next,token);
  if(token!==seq)return;
  const favorites=getFavorites();
  if(!Array.isArray(favorites)||!favorites.includes(next)){
   setStatus('История доступна локально. Новые наблюдения собираются только для избранного актива.');
   return;
  }
  if(document.hidden||document.body.dataset.view!=='asset'||
   document.getElementById('view-asset')?.dataset.assetArea!=='data'){
   setStatus('История сохранена. Откройте «Актив → Данные» для нового опроса.');
   return;
  }
  const at=Date.now(),previous=requests.get(next)||0;
  const throttle=force?60000:5*60000;
  if(at-previous<throttle){
   setStatus('Последний запрос '+time(previous)+
    '. Следующая проверка не требует перезагрузки истории.');
   return;
  }
  requests.delete(next);requests.set(next,at);
  while(requests.size>10)requests.delete(requests.keys().next().value);
  abort?.abort();const local=new AbortController();abort=local;
  const timer=setTimeout(()=>local.abort(),11000);
  setStatus('Проверяем ограниченную страницу публичных переводов '+chain+'…');
  try{
   const report=await collectWhaleObservations(next,{
    signal:local.signal,now:()=>Date.now()});
   if(token!==seq||asset!==next||local.signal.aborted||
    !getFavorites().includes(next))return;
   if(!['OK','PARTIAL'].includes(report.state)){
    setStatus('Источник '+report.state+' · новых подтверждённых данных нет. '+
     'Исторические наблюдения не удалены.',true);
    return;
   }
   const saved=await saveMobileWhaleObservations(next,report);
   if(token!==seq||asset!==next||local.signal.aborted)return;
   const refreshed=await readLocal(next,token);
   if(token!==seq)return;
   const source=chain==='bitcoin'?'mempool.space · последние 10':'Blockscout · одна страница';
   setStatus(source+' · просмотрено '+report.scanned+
    ' · крупных событий в срезе '+report.events.length+
    ' · сохранено '+saved.saved+
    (report.state==='PARTIAL'?' · часть деталей недоступна':'')+
    (refreshed?.complete?' · архив Room':' · архив недоступен')+
    '. Это частичная выборка, не полный мониторинг сети.',
    report.state==='PARTIAL'||!refreshed?.complete);
   if(!refreshed?.complete&&report.events.length)
    draw(report.events,{historical:false});
  }catch(e){
   if(token===seq&&!local.signal.aborted)
    setStatus('Проверка источника не удалась. Локальная история сохранена.',true);
  }finally{
   clearTimeout(timer);
   if(abort===local)abort=null;
  }
 }
 async function checkMarket(){
  if(marketBusy||!chainForWhaleAsset(asset)||document.hidden||
   document.body.dataset.view!=='asset'||
   node('view-asset')?.dataset.assetArea!=='data'||
   !getFavorites().includes(asset))return;
  const at=Date.now();
  if(at-(marketChecks.get(asset)||0)<120000){
   node('whale-market-status').textContent=
    'Публичные H1 проверяются не чаще одного раза за 2 минуты на актив.';
   return;
  }
  marketChecks.delete(asset);marketChecks.set(asset,at);
  while(marketChecks.size>10)marketChecks.delete(marketChecks.keys().next().value);
  marketBusy=true;
  const current=asset,token=seq;
  marketAbort?.abort();
  const controller=new AbortController();marketAbort=controller;
  const timer=setTimeout(()=>controller.abort(),12000);
  const button=node('whale-market-check');
  button.disabled=true;
  node('whale-market-status').textContent=
   'Проверяем только реальные закрытые свечи Binance Spot H1…';
  try{
   const result=await fetchCandles(current,'1h',{
    limit:500,signal:controller.signal,now:()=>Date.now()});
   if(token!==seq||current!==asset||controller.signal.aborted||
    !getFavorites().includes(current))return;
   if(!['OK','STALE'].includes(result.state)||
    !result.candles?.length){
    node('whale-market-status').textContent='H1-источник '+result.state+
     ' · новая рыночная история не подтверждена. Сохранённая история не меняется.';
    return;
   }
   await saveMobileCandles(current,'1h',result.candles);
   if(token!==seq||current!==asset||controller.signal.aborted)return;
   // Preserve first-seen transfer times, including for old Blockscout pages.
   summarize(current,latestEvents,result.candles,token);
  }catch{
   if(token===seq&&!controller.signal.aborted)
    node('whale-market-status').textContent=
     'H1-источник недоступен. Старые наблюдения сохранены.';
  }finally{
   clearTimeout(timer);
   if(marketAbort===controller)marketAbort=null;
   marketBusy=false;
   button.disabled=false;
  }
 }
 node('whale-refresh')?.addEventListener('click',()=>void refresh(asset,{force:true}));
 node('whale-market-check')?.addEventListener('click',()=>void checkMarket());
 return {refresh,clear(next){
  seq++;abort?.abort();abort=null;marketAbort?.abort();marketAbort=null;
  asset=next;latestEvents=[];
  node('whale-count').textContent='—';draw([]);
  summarize(next,[],[],seq);
  setStatus('Сводка переводов ожидает проверки сети и локального архива.');
 }};
}
