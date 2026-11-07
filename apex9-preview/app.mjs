import {collectAsset,fetchSpotCatalog,normalizeSymbol} from './research.mjs';
import {collectContext} from './context-sources.mjs';

const el=(id)=>document.getElementById(id);
const fmt=(value,digits=8)=>Number.isFinite(value)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(value):'—';
const time=(ms)=>Number.isFinite(ms)
 ?new Date(ms).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const layerNames={
 market:'Рыночная цена',liquidity:'Видимая ликвидность',onchain:'Ончейн',
 news:'Новости',social:'Социальные настроения',macro:'Макроэкономика',
 cross_asset:'Взаимосвязи активов'
};
const sourceNames={
 'binance-ticker':'Binance · Spot 24h',
 'binance-depth':'Binance · Spot order book',
 'bybit-depth':'Bybit · Spot order book'
};
const assessmentNames={
 INSUFFICIENT:'Недостаточно данных',MIXED:'Противоречивый контекст',
 UPWARD_CONTEXT:'Положительный исторический контекст',
 DOWNWARD_CONTEXT:'Отрицательный исторический контекст'
};
let chosen='BTCUSDT',current=null,controller=null,catalog=[],pending=0,lastLoad=0;
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
function updateTab(view){
 document.body.dataset.view=view;
 for(const tab of document.querySelectorAll('[data-tab]')){
  const active=tab.dataset.tab===view;
  tab.classList.toggle('active',active);
  if(active)tab.setAttribute('aria-current','page');
  else tab.removeAttribute('aria-current');
 }
 for(const name of ['overview','asset','forecasts','sources'])
  el('view-'+name).classList.toggle('hidden',name!==view);
}
function navigate(view,targetId){
 updateTab(view);
 requestAnimationFrame(()=>{
  const node=targetId?el(targetId):el('view-'+view);
  if(node)node.scrollIntoView({behavior:'smooth',block:'start'});
 });
}
for(const button of document.querySelectorAll('[data-tab]'))
 button.addEventListener('click',()=>navigate(button.dataset.tab));
for(const button of document.querySelectorAll('[data-go]'))
 button.addEventListener('click',()=>navigate(button.dataset.go,button.dataset.target));
function markSelectedAsset(){
 for(const button of document.querySelectorAll('[data-symbol]')){
  const selected=button.dataset.symbol===chosen;
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',selected?'true':'false');
 }
}
for(const button of document.querySelectorAll('[data-symbol]'))
 button.addEventListener('click',()=>{
  const symbol=button.dataset.symbol;
  if(symbol===chosen){navigate('asset');return;}
  updateTab('overview');
  void investigate(symbol);
  window.scrollTo({top:0,behavior:'smooth'});
 });
updateTab('overview');
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
el('asset-input').addEventListener('input',(ev)=>suggestions(ev.target.value));

async function loadCatalog(){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9500);
 try{
  const result=await fetchSpotCatalog({
   fetchImpl:(url,opts)=>fetch(url,{...opts,signal:controller.signal})
  });
  if(result.state==='OK'){
   catalog=result.symbols;
   text('catalog-status','Каталог Binance Spot/USDT: '+fmt(catalog.length,0)+
    ' доступных пар. Можно вводить сокращение, например TON.');
   suggestions(el('asset-input').value);
  }else{
   text('catalog-status','Каталог недоступен ('+result.state+
    '). Ручной ввод символа работает, если доступен API.');
  }
 }finally{clearTimeout(timer);}
}

function renderDepth(snapshot){
 const list=el('depth-list');clear(list);
 if(!snapshot.depth.length){
  list.append(create('p','muted','Публичные стаканы сейчас недоступны.'));
  return;
 }
 for(const item of snapshot.depth){
  const row=create('div','source-line');
  const content=create('div');
  content.append(
   create('b','',item.venue==='binance'?'Binance Spot':'Bybit Spot'),
   create('small','', 'Bid '+fmt(item.bestBid)+' · Ask '+fmt(item.bestAsk)),
   create('small','', 'Видимый дисбаланс: '+fmt(item.visibleDepthImbalance*100,1)+'%'+
    ' · Спред '+fmt(item.spreadBps,2)+' б.п.')
  );
  row.append(content,create('span','source-state ok',time(item.receivedAt)));
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
 'bitcoin-mempool':'mempool.space · сеть Bitcoin',
 'gdelt-news':'GDELT · упоминания в СМИ'
};
const usd=(x)=>Number.isFinite(x)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(x):'—';
function appendLine(target,label,value){
 const line=create('div','data-row');
 line.append(create('span','',label),create('strong','',value));
 target.append(line);
}
function renderContext(context){
 const list=el('context-source-list'),global=el('global-context'),
  chain=el('btc-chain-context'),news=el('news-articles');
 for(const node of [list,global,chain,news])clear(node);
 if(!context){
  for(const node of [list,global,chain,news])
   node.append(create('p','muted','Нет проверенных сведений.'));
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
  let detail=item.state==='OK'?'Сведения получены':'Нет доступных сведений';
  if(item.state==='EMPTY')detail='Совпадений по запросу не найдено';
  if(item.state==='UNSUPPORTED')detail='Источник не подходит для этого актива';
  if(item.error)detail=item.error;
  list.append(sourceRow(contextSources[item.id]||item.id,item.state,detail));
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
 }else chain.append(create('p','muted',
  b?.state==='UNSUPPORTED'?'Показатели сети Bitcoin доступны только для BTC.':
  'mempool.space: '+(b?.state||'OFFLINE')+(b?.error?' · '+b.error:'')));
 const n=data['gdelt-news'];
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
 const srcOk=snapshot.sources.filter(s=>s.state==='OK').length;
 const pct=snapshot.ticker?.changePercent;
 text('market-price',snapshot.ticker?fmt(snapshot.ticker.price)+' USDT':'—');
 text('market-change',pct===undefined?'24 ч: —':(pct>0?'+':'')+fmt(pct,2)+'% / 24 ч');
 el('market-change').className='delta'+
  (pct>0?' positive':pct<0?' negative':'');
 text('updated-at','Последняя попытка обновления: '+time(snapshot.collectedAt));
 text('active-sources',srcOk+' / 3');
 text('daily-change',pct===undefined?'—':(pct>0?'+':'')+fmt(pct,2)+'%');
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
  setNotice('Введите корректный биржевой символ, например BTCUSDT или TON.',true);
  return;
 }
 if(controller)controller.abort();
 const active=++pending;
 controller=new AbortController();
 const local=controller;
 const deadline=setTimeout(()=>local.abort(),9000);
 chosen=symbol;
 markSelectedAsset();
 text('asset-name',chosen);
 el('asset-input').value=chosen;
 text('market-price','—');text('market-change','24 ч: —');
 text('top-status','Обновление…');
 text('updated-at','Запрос публичных источников…');
 text('active-sources','—');text('layer-coverage','—');
 text('hero-coverage','Покрытие: ожидание данных');
 text('daily-change','—');text('context-status','—');
 text('quote-volume','—');text('ticker-time','—');
 clear(el('depth-list'));clear(el('source-list'));clear(el('missing-layers'));
 renderContext(null);
 setNotice('Получаем публичные данные бирж, общий крипторынок, сведения о BTC и новостные упоминания.');
 el('search-button').disabled=true;
 el('refresh-button').disabled=true;
 try{localStorage.setItem('apex9_preview_asset',chosen);}catch{}
 try{
  const [snapshot,context]=await Promise.all([
   collectAsset(chosen,{signal:local.signal,now:()=>Date.now()}),
   collectContext(chosen,{signal:local.signal,now:()=>Date.now()})
  ]);
  if(active!==pending)return;
  renderSnapshot(snapshot);
  renderContext(context);
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
});
el('refresh-button').addEventListener('click',()=>void investigate(chosen));
setInterval(()=>{
 if(!document.hidden&&!controller&&lastLoad&&Date.now()-lastLoad>60000)
  void investigate(chosen);
},15000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&!controller&&lastLoad&&Date.now()-lastLoad>90000)
  void investigate(chosen);
});
void loadCatalog().catch(()=>{
 text('catalog-status','Каталог временно недоступен. Введите известный символ вручную.');
});
void investigate(chosen);
