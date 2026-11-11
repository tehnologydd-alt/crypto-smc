/**
 * Whale Intelligence / Stage 1, existing Asset → Data screen.
 * All network requests are opt-in foreground and favorite-only.
 * No background polling, orders, wallet attribution, or trading signals.
 */
import {collectWhaleObservations,chainForWhaleAsset,
 formatNativeAmount,WHALE_MIN_ATOMIC} from './whale-observer.mjs';
import {getMobileWhaleHistory,saveMobileWhaleObservations}
 from './mobile-bridge.mjs';

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
 let asset='',seq=0,abort=null;
 const requests=new Map(); // at most 10 recently selected favorites
 const setStatus=(msg,bad=false)=>{
  const n=node('whale-status');
  if(!n)return;
  n.textContent=msg;n.classList.toggle('is-offline',bad);
 };
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
  const read=await getMobileWhaleHistory(current,80);
  if(token!==seq||current!==asset)return null;
  if(read.complete){
   draw(read.events);
   node('whale-count').textContent=read.events.length+' в выборке Room';
  }else{
   draw([]);
   node('whale-count').textContent='Нет локального архива';
  }
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
   if(token!==seq||asset!==next||local.signal.aborted)return;
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
 node('whale-refresh')?.addEventListener('click',()=>void refresh(asset,{force:true}));
 return {refresh,clear(next){
  seq++;abort?.abort();abort=null;asset=next;
  node('whale-count').textContent='—';draw([]);
  setStatus('Сводка переводов ожидает проверки сети и локального архива.');
 }};
}
