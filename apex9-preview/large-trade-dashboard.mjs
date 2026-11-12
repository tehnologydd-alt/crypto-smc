/**
 * APEX: another public evidence stream inside Whale Intelligence.
 * Market taker executions are not blockchain transfers and never infer owners.
 */
import {createLargeTradeStream,largeTradeStreamUrl,
 LARGE_TRADE_MIN_USDT} from './large-trade-stream.mjs';
import {saveMobileLargeTrade,getMobileLargeTradeHistory,
 hasMobileObservationStorage} from './mobile-bridge.mjs';

const node=id=>document.getElementById(id);
const mk=(tag,klass='',text='')=>{
 const x=document.createElement(tag);
 if(klass)x.className=klass;
 x.textContent=String(text);return x;
};
const money=x=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(x):'—';
const price=x=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8}).format(x):'—';
const clock=x=>Number.isSafeInteger(x)?
 new Date(x).toLocaleTimeString('ru-RU',{hour:'2-digit',
  minute:'2-digit',second:'2-digit'}):'—';

export function initLargeTradeDashboard({getFavorites=()=>[]}={}){
 let asset='',token=0,events=[],saved=0,failed=0,live=false;
 let filterAmount=LARGE_TRADE_MIN_USDT,search='';
 const stream=createLargeTradeStream({
  onTrade({asset:symbol,trade}){
   if(symbol!==asset)return;
   const key=trade.aggregateId;
   if(events.some(x=>x.aggregateId===key))return;
   events.unshift(trade);
   events=events.sort((a,b)=>b.tradeAt-a.tradeAt||
    b.aggregateId-a.aggregateId).slice(0,120);
   draw();
   void saveMobileLargeTrade(trade).then(result=>{
    if(symbol!==asset)return;
    if(result.saved)saved++;
    else if(result.error)failed++;
    statusNote();
   }).catch(()=>{if(symbol===asset){failed++;statusNote();}});
  },
  onStatus(event){
   if(event.asset!==asset)return;
   live=event.status==='LIVE';
   const label={
    LIVE:'Binance Spot WebSocket работает · крупные исполнения',
    CONNECTING:'Подключаем Binance Spot…',
    OFFLINE:'Соединение недоступно · история сохранена',
    STALE:'Поток не обновлялся · повторная проверка позже',
    RATE_CAPPED:'Слишком много сделок · сохраняется ограниченная выборка',
    UNSUPPORTED:'Spot-пара не поддержана этим источником'
   }[event.status]||'Ожидаем подтверждённые рыночные сделки';
   const n=node('large-trade-status');if(n)n.textContent=label;
  }
 });
 function statusNote(){
  const n=node('large-trade-persist');
  if(n)n.textContent='За текущий просмотр: сохранено '+saved+
   (failed?' · ошибки Room '+failed:'')+
   ' · лимит записи до 60 событий/мин. Частичная выборка.';
 }
 function draw(){
  const root=node('large-trade-list');if(!root)return;
  const items=events.filter(x=>x.quoteNotional>=filterAmount&&
   (!search||String(x.aggregateId).includes(search))).slice(0,30);
  const frag=document.createDocumentFragment();
  if(!items.length){
   frag.append(mk('p','muted',
    'Крупных исполнений по текущему фильтру ещё нет. Это не означает отсутствия китов или переводов.'));
  }
  for(const trade of items){
   const card=mk('article','large-trade-card');
   const head=mk('div','large-trade-head');
   const buy=trade.takerSide==='BUY_TAKER';
   head.append(mk('strong','',buy?'↑ Агрессивная покупка':'↓ Агрессивная продажа'),
    mk('span','',clock(trade.tradeAt)));
   card.append(head);
   card.append(mk('strong','large-trade-usdt',money(trade.quoteNotional)+' USDT'));
   card.append(mk('p','large-trade-meta',
    'Цена '+price(trade.price)+' · количество '+price(trade.quantity)+
    ' · Binance Spot · aggTrade #'+trade.aggregateId));
   frag.append(card);
  }
  root.replaceChildren(frag);
  const count=node('large-trade-count');
  if(count)count.textContent=items.length+' показано · '+events.length+
   ' получено/архив';
 }
 async function refresh(next){
  if(next!==asset){
   stream.stop();asset=next;events=[];saved=0;failed=0;live=false;
   token++;draw();statusNote();
  }
  const current=asset,expected=++token;
  if(!largeTradeStreamUrl(current)){
   const n=node('large-trade-status');
   if(n)n.textContent='Для этого актива нет подтверждённой USDT Spot-пары Binance.';
   stream.stop();return;
  }
  const stored=await getMobileLargeTradeHistory(current,90);
  if(expected!==token||current!==asset)return;
  if(stored.complete){
   const seen=new Set(events.map(x=>x.aggregateId));
   for(const tx of stored.events){
    if(!seen.has(tx.aggregateId)){events.push(tx);seen.add(tx.aggregateId);}
   }
   events.sort((a,b)=>b.tradeAt-a.tradeAt||
    b.aggregateId-a.aggregateId);events=events.slice(0,120);
   draw();
  }else{
   const n=node('large-trade-persist');
   if(n)n.textContent='История Room пока недоступна: '+
    String(stored.error||'требуется Android');
  }
  sync();
 }
 function sync(){
  const enabled=stream.sync({
   symbol:asset,visible:!document.hidden&&document.body.dataset.view==='asset',
   favorite:getFavorites().includes(asset),
   native:hasMobileObservationStorage(),
   dataArea:node('view-asset')?.dataset.assetArea==='data'
  });
  if(enabled)stream.tick();
 }
 function clear(next=''){
  stream.stop();token++;asset=next;events=[];saved=0;failed=0;
  live=false;draw();statusNote();
  const n=node('large-trade-status');
  if(n)n.textContent='Откройте «Данные» избранного актива для поиска крупных Spot-сделок.';
 }
 node('large-trade-threshold')?.addEventListener('change',event=>{
  const x=Number(event.target.value);
  if([150000,500000,1000000].includes(x)){filterAmount=x;draw();}
 });
 node('large-trade-search')?.addEventListener('input',event=>{
  const value=String(event.target.value||'').trim();
  search=/^\d{0,20}$/.test(value)?value:'';draw();
 });
 node('large-trade-archive')?.addEventListener('click',()=>void refresh(asset));
 return {refresh,clear,sync,tick:()=>stream.tick()};
}
