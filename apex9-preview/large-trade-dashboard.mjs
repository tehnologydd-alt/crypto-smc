/**
 * APEX: six source-scoped public Spot execution streams.
 * Market trades are not wallet transfers or evidence of a common owner.
 * Both venue-by-venue tape and optional coincidence research stay descriptive.
 */
import {createLargeTradeStream,largeTradeStreamUrl,
 LARGE_TRADE_MIN_USDT} from './large-trade-stream.mjs';
import {createMultivenueStreams,MULTIVENUE} from './multivenue-trades.mjs';
import {findCrossVenueWindows,findNearbyChainObservations}
 from './trade-temporal-links.mjs';
import {saveMobileLargeTrade,getMobileLargeTradeHistory,
 saveMobileVenueTrade,getMobileVenueTradeHistory,getMobileWhaleHistory,
 hasMobileObservationStorage} from './mobile-bridge.mjs';

const node=id=>document.getElementById(id);
const mk=(tag,klass='',text='')=>{
 const el=document.createElement(tag);
 if(klass)el.className=klass;
 el.textContent=String(text);return el;
};
const money=x=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(x):'—';
const price=x=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8}).format(x):'—';
const clock=x=>Number.isSafeInteger(x)?
 new Date(x).toLocaleTimeString('ru-RU',
  {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const venueOf=t=>t?.venue||'binance';
const idOf=t=>String(t?.tradeId??t?.aggregateId??'');
const uniqueKey=t=>venueOf(t)+':'+idOf(t);
const quoteOf=t=>t?.quoteCurrency||(venueOf(t)==='coinbase'?'USD':'USDT');
const displayName=v=>({binance:'Binance',bybit:'Bybit',okx:'OKX',
 kraken:'Kraken',bingx:'BingX',coinbase:'Coinbase Exchange'}[v]||v);

export function initLargeTradeDashboard({getFavorites=()=>[]}={}){
 let asset='',generation=0,events=[],saved=0,failed=0,selectedVenue='all';
 let minAmount=LARGE_TRADE_MIN_USDT,search='',chainEvents=[];
 const stateByVenue=new Map();
 function stateReport(){
  const n=node('large-trade-venues-status');
  if(!n)return;
  n.replaceChildren();
  for(const v of ['binance',...MULTIVENUE]){
   const row=mk('span','large-trade-venue-status');
   row.dataset.state=stateByVenue.get(v)||'WAITING';
   row.textContent=displayName(v)+' · '+({
    WAITING:'ожидание',CONNECTING:'подключение',
    CONNECTED:'соединение',LIVE:'получение',
    OFFLINE:'недоступен',STALE:'нет обновлений',
    RATE_CAPPED:'ограничение',UNSUPPORTED:'не поддержан'
   }[row.dataset.state]||row.dataset.state);
   n.append(row);
  }
 }
 function mark(venue,state){
  stateByVenue.set(venue,state);
  stateReport();
  const n=node('large-trade-status');
  if(n)n.textContent='Бесплатные публичные Spot-потоки · '+
   [...stateByVenue.values()].filter(x=>x==='LIVE').length+
   ' подтверждённых источников крупных сделок за текущий просмотр.';
 }
 function statusNote(){
  const n=node('large-trade-persist');
  if(n)n.textContent='За текущий просмотр сохранено '+saved+
   (failed?' · ошибок записи '+failed:'')+
   ' · архив Room, только фактические данные. '+
   'Лента частичная при повышенной активности.';
 }
 function add(t,persist){
  if(!t||t.asset&&t.asset!==asset||t.symbol&&t.symbol!==asset)return;
  if(events.some(x=>uniqueKey(x)===uniqueKey(t)))return;
  events.unshift(t);
  events.sort((a,b)=>b.tradeAt-a.tradeAt||
   uniqueKey(b).localeCompare(uniqueKey(a)));
  events=events.slice(0,200);
  draw();mark(venueOf(t),'LIVE');
  const current=asset;
  void persist(t).then(result=>{
   if(current!==asset)return;
   if(result.saved)saved++;
   else if(result.error)failed++;
   statusNote();
  }).catch(()=>{if(current===asset){failed++;statusNote();}});
 }
 const binance=createLargeTradeStream({
  onTrade({asset:symbol,trade}){
   if(symbol===asset)add(trade,saveMobileLargeTrade);
  },
  onStatus(e){if(e.asset===asset)mark('binance',e.status)}
 });
 const rest=createMultivenueStreams({
  onTrades({asset:symbol,venue,trades}){
   if(symbol!==asset)return;
   for(const t of trades)add(t,saveMobileVenueTrade);
  },
  onStatus(e){if(e.asset===asset)mark(e.venue,e.state)}
 });
 function draw(){
  const root=node('large-trade-list');if(!root)return;
  const all=events.filter(t=>t.quoteNotional>=minAmount&&
   (selectedVenue==='all'||venueOf(t)===selectedVenue)&&
   (!search||idOf(t).includes(search))).slice(0,35);
  const frag=document.createDocumentFragment();
  if(!all.length)frag.append(mk('p','muted',
   'Крупных сделок по выбранному фильтру пока нет. Отсутствие записей не доказывает отсутствие крупных участников.'));
  for(const t of all){
   const card=mk('article','large-trade-card');
   const head=mk('div','large-trade-head');
   head.append(mk('strong','',
    (t.takerSide==='BUY_TAKER'?'↑ Покупка taker':'↓ Продажа taker')+
    ' · '+displayName(venueOf(t))),
    mk('span','',clock(t.tradeAt)));
   card.append(head,mk('strong','large-trade-usdt',
    money(t.quoteNotional)+' '+quoteOf(t)));
   card.append(mk('p','large-trade-meta',
    'Цена '+price(t.price)+' · количество '+price(t.quantity)+
    ' · '+(venueOf(t)==='binance'?'aggTrade':'Spot trade')+
    ' ID '+idOf(t)));
   frag.append(card);
  }
  root.replaceChildren(frag);
  const count=node('large-trade-count');
  if(count)count.textContent=all.length+' показано · '+events.length+' в выборке';
  drawLinks();
 }
 function drawLinks(){
  const n=node('large-trade-links-status');
  if(!n)return;
  const windows=findCrossVenueWindows(events);
  const near=findNearbyChainObservations(events,chainEvents);
  const latest=windows[0];
  n.replaceChildren(mk('p','',
   latest?'Совпадение по времени: '+latest.venues.map(displayName).join(', ')+
    ' · '+latest.events+' крупных исполнений за окно до 60 секунд · '+
    clock(latest.from)+'–'+clock(latest.to)+
    '. Это НЕ подтверждённая связь счетов или перевод средств.':
    'Совпадений крупных сделок на нескольких биржах в пределах 60 секунд пока не обнаружено.'));
  if(near.length)n.append(mk('p','',
   'Близкие по времени ончейн-наблюдения: '+near.length+
   ' в пределах ±5 минут. Это только временное совпадение, не маршрут средств и не доказательство причины.'));
 }
 function sync(){
  const gate={symbol:asset,
   visible:!document.hidden&&document.body.dataset.view==='asset',
   favorite:getFavorites().includes(asset),
   native:hasMobileObservationStorage(),
   dataArea:node('view-asset')?.dataset.assetArea==='data'};
  const a=binance.sync(gate),b=rest.sync(gate);
  if(a)binance.tick();
  if(b)rest.tick();
 }
 async function refresh(next){
  if(next!==asset){
   binance.stop();rest.stop();asset=next;events=[];
   saved=0;failed=0;chainEvents=[];stateByVenue.clear();
   generation++;draw();stateReport();statusNote();
  }
  const token=++generation,current=asset;
  if(!largeTradeStreamUrl(current)){
   const n=node('large-trade-status');
   if(n)n.textContent='Нет поддерживаемой публичной Spot-пары USDT.';
   binance.stop();rest.stop();return;
  }
  sync();
  const [binanceHistory,multiHistory,chainHistory]=await Promise.all([
   getMobileLargeTradeHistory(current,100),
   getMobileVenueTradeHistory(current,180),
   getMobileWhaleHistory(current,80)
  ]);
  if(token!==generation||current!==asset)return;
  const seen=new Set(events.map(uniqueKey));
  for(const source of [binanceHistory,multiHistory]){
   if(!source.complete)continue;
   for(const e of source.events){
    if(seen.has(uniqueKey(e)))continue;
    events.push(e);seen.add(uniqueKey(e));
   }
  }
  if(chainHistory?.complete)chainEvents=chainHistory.events||[];
  events.sort((a,b)=>b.tradeAt-a.tradeAt||
   uniqueKey(b).localeCompare(uniqueKey(a)));
  events=events.slice(0,200);
  draw();
  if(!binanceHistory.complete||!multiHistory.complete){
   const n=node('large-trade-persist');
   if(n)n.textContent='Часть локальной истории недоступна; живые данные продолжают обрабатываться. '+
    String(multiHistory.error||binanceHistory.error||'');
  }else statusNote();
 }
 function clear(next=''){
  binance.stop();rest.stop();generation++;asset=next;events=[];
  saved=0;failed=0;chainEvents=[];stateByVenue.clear();
  draw();stateReport();statusNote();
  const n=node('large-trade-status');
  if(n)n.textContent='Откройте «Данные» избранного актива для поиска публичных Spot-сделок.';
 }
 node('large-trade-threshold')?.addEventListener('change',e=>{
  const n=Number(e.target.value);
  if([150000,500000,1000000].includes(n)){minAmount=n;draw()}
 });
 node('large-trade-venue')?.addEventListener('change',e=>{
  const x=String(e.target.value);
  if(x==='all'||['binance',...MULTIVENUE].includes(x)){
   selectedVenue=x;draw();
  }
 });
 node('large-trade-search')?.addEventListener('input',e=>{
  search=String(e.target.value||'').trim().slice(0,80);draw();
 });
 node('large-trade-archive')?.addEventListener('click',()=>void refresh(asset));
 return {refresh,clear,sync,tick:()=>{binance.tick();rest.tick()}};
}
