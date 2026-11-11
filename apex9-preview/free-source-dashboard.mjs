/** Lightweight public-source UI. Triggered only when a relevant page is opened.
 * No market orders, API keys or background jobs. Provider results stay separate.
 */
import {createFreeSourceBudget,FREE_POLICY} from './free-source-budget.mjs';
import {fetchFearGreed,fetchDexPairs,fetchGeckoPools,
 fetchOkxTicker,dexTokenReference,fetchPaprikaTicker} from './free-source-adapters.mjs';
import {KEYED_NEWS_PROVIDERS} from './news-source-fusion.mjs';
import {personalNewsStatus,personalNewsDiagnosticLabel} from './personal-news-client.mjs';
import {initPersonalNewsControls} from './personal-news-controls.mjs';
import {fetchCmcKeyless} from './cmc-keyless.mjs';
import {reconcileSources,SOURCE_GROUPS} from './source-reconciliation.mjs';
import {sourceHealth} from './source-health.mjs';
import {createSourceReliability} from './source-reliability.mjs';
import {createOverviewCache} from './overview-cache.mjs';
const el=id=>document.getElementById(id);
const div=(tag,cls='',content)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(content!==undefined)node.textContent=String(content);
 return node;
};
const nice=t=>Number.isSafeInteger(t)&&t>0?
 new Date(t).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
 hour:'2-digit',minute:'2-digit'}):'неизвестно';
const fmt=(num,d=3)=>Number.isFinite(num)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(num):'—';
const caps=(name,r)=>{
 const q=r?.quota;
 if(!q)return ' · квота не определена';
 return ' · '+q.used+'/'+FREE_POLICY[name].daily+' сегодня'+
  ' · '+q.monthlyUsed+'/'+FREE_POLICY[name].monthly+' за месяц';
};
const isPresent=r=>['OK','STALE','EMPTY'].includes(r?.state);
export function initFreeSourceDashboard({getSymbol,storage:provided}={}){
 let storage=provided??null;
 if(!storage)try{storage=window.localStorage;}catch{}
 const reliability=createSourceReliability({storage});
 const budget=createFreeSourceBudget({storage,onNetworkResult:({provider,result,at,latencyMs})=>{
  reliability.record({provider,result,at,latencyMs});
  renderReliability();
 }});
 const overviewCache=createOverviewCache({storage});
 const latest=new Map();
 let assetSeq=0,globalSeq=0,checkingPublic=null;
 let personalNews={native:false,providers:{}};
 const personalChecks=new Map();
 let assetMeasurements=null,contextMeasurements=null,marketMeasurements=null;
 let fearMeasurement=null,socialMeasurement=null;
 function annotate(mode,r,asset=null){
  latest.set(mode,sourceHealth(r,{asset}));
  refreshCenter();
 }
 /** The ledger is observational. Source agreement is NOT accuracy. */
 function renderReliability(){
  const box=el('api-reliability-list');
  const status=el('api-reliability-status');
  if(!box||!status)return;
  const report=reliability.overview();
  const names={fear:'Alternative.me',dex:'DEX Screener',
   gecko:'GeckoTerminal',okx:'OKX Spot',paprika:'CoinPaprika',
   cmc:'CoinMarketCap','binance-ticker':'Binance Spot · цена',
   'binance-depth':'Binance Spot · стакан',
   'bybit-depth':'Bybit Spot · стакан',
   'coingecko-global':'CoinGecko · рынок',
   'bitcoin-mempool':'mempool.space · BTC',
   'gdelt-news':'GDELT · новости'};
  box.replaceChildren();
  let mature=0,attempts=0;
  for(const row of report.rows){
   attempts+=row.attempts;
   if(row.state==='OBSERVED')mature++;
   const item=div('article','api-reliability-row');
   const header=div('div','api-reliability-heading');
   header.append(div('strong','',names[row.provider]),
    div('span','',row.state==='OBSERVED'?
     'Доступность '+row.availabilityPercent+'%':
     'Накопление данных'));
   const details=div('p','',
    'Сетевых запросов '+row.attempts+' · проверенных ответов '+
    row.ok+' · ошибок '+row.failures+
    ' (формат '+row.invalid+', лимит '+row.rateLimited+')');
   item.append(header,details);
   if(row.state==='OBSERVED'){
    const track=div('div','api-reliability-track');
    track.setAttribute('role','meter');
    track.setAttribute('aria-label',names[row.provider]+': доля проверенных ответов');
    track.setAttribute('aria-valuemin','0');
    track.setAttribute('aria-valuemax','100');
    track.setAttribute('aria-valuenow',String(row.availabilityPercent));
    const bar=div('span','api-reliability-fill');
    bar.style.width=row.availabilityPercent+'%';
    track.append(bar);item.append(track);
   }else item.append(div('small','',
    'Для процентной оценки требуется минимум 12 сетевых ответов за 2 разных дня.'));
   const diagnostics=[];
   if(row.latencyMedianMs!==null)
    diagnostics.push('медиана ответа '+row.latencyMedianMs+' мс');
   if(row.freshness.checked)
    diagnostics.push('время поставщика: свежих '+row.freshness.confirmed+
     '/'+row.freshness.checked);
   else diagnostics.push('свежесть по метке поставщика пока не подтверждена');
   if(row.trend)
    diagnostics.push('последние 10 / предыдущие 10: '+
     row.trend.latestPercent+'% / '+row.trend.priorPercent+'%');
   item.append(div('small','',diagnostics.join(' · ')));
   box.append(item);
  }
  const comp=report.comparisons;
  status.textContent='Операционная статистика за 30 дней · '+attempts+
   ' фактических запросов · '+mature+' из '+report.rows.length+
   ' с достаточной выборкой. '+
   (report.persisted?'История сохранена на устройстве.':
   'Хранилище недоступно: история только в текущем сеансе.');
  const comparison=el('api-reliability-comparison');
  if(comparison)comparison.textContent=comp.count?
   'CoinPaprika ↔ CoinMarketCap: '+comp.count+
   ' одновременных проверок USD · медианное расхождение '+
   comp.medianDeltaPercent.toFixed(3)+
   '%. Без независимого эталона нельзя определить, кто ошибся.':
   'Расхождение USD-оценок: ждём два реальных сопоставимых сетевых ответа.';
 }
 function refreshCenter(){
  renderReliability();
  const container=el('free-provider-center'),timeStatus=el('free-provider-center-status');
  if(!container||!timeStatus)return;
  container.replaceChildren();
  let ok=0;
  const names={
   fear:'Alternative.me · Fear & Greed',
   dex:'DEX Screener · WETH / WSOL',
   gecko:'GeckoTerminal · WETH / WSOL',
   okx:'OKX · Spot ticker',
   paprika:'CoinPaprika · рыночная сводка',
   cmc:'CoinMarketCap · публичная USD-оценка'
  };
  for(const mode of ['fear','dex','gecko','okx','paprika','cmc']){
   const q=budget.status(mode),name=names[mode],last=latest.get(mode);
   const row=div('article','free-source-center-row');
   row.append(div('strong','',name),
    div('span','',q.state==='OK'?
     'День '+q.used+'/'+q.limit+' · месяц '+
      q.monthlyUsed+'/'+q.monthlyLimit:
     'Локальный учёт недоступен'),
    div('small','',last?.message||'Проверка ещё не запускалась'));
   container.append(row);
   if(last?.usable)ok++;
  }
  const keyed=[
   ['cryptopanic','CryptoPanic · новости',
    'Тариф и доступ конкретного API-ключа не проверены',
    'Нужны действующий доступ и безопасная настройка ключа'],
   ['newsdata','NewsData.io · новости',
    'Free: 200 кредитов/сутки · публикации задержаны примерно на 12 часов',
    'В APEX внутренний предел 180/сутки; серверный ключ ещё не настроен'],
   ['reddit','Reddit · обсуждения',
    'До 100 запросов/мин для одобренного OAuth-клиента',
    'Требуется одобрение доступа и OAuth; прямое мобильное подключение не реализовано']
  ];
  for(const [id,name,terms,access] of keyed){
   const p=KEYED_NEWS_PROVIDERS[id];
   const row=div('article','free-source-center-row');
   const configured=personalNews.native&&personalNews.providers?.[id]?.configured;
   const tested=personalChecks.get(id);
   row.append(div('strong','',name),
    div('span','',terms),
    div('small','',tested?'Проверка API: '+personalNewsDiagnosticLabel(tested):
     configured?'Личный ключ сохранён в Android · ответ API ещё не проверен':
     access+' · '+p.state));
   container.append(row);
  }
  timeStatus.textContent=(checkingPublic?'Выполняются реальные запросы. ':'')+
   ok+' из 6 публичных API: есть проверенный ответ или кеш. '+
   'Для остальных указана фактическая причина, а не статус подключения по наличию кода.';
 }
 function showFear(r){
  const status=el('free-fear-status'),value=el('free-fear-value');
  const label=el('free-fear-label'),track=el('free-fear-track');
  const needle=el('free-fear-needle');
  if(!status||!value||!label||!track||!needle)return;
  if(r?.state==='OK'&&r?.data)overviewCache.saveFear(r.data);
  const saved=overviewCache.readFear();
  const hasLive=r?.state==='OK'&&r?.data;
  const snapshot=hasLive?r.data:saved?.value;
  if(!snapshot){
   value.textContent='—';
   label.textContent='Нет подтверждённого значения';
   track.setAttribute('aria-valuenow','');
   needle.style.left='0%';
   status.textContent='Alternative.me · '+(r?.state||'ожидание ответа')+
    ' · нет сохранённых сведений';
   return;
  }
  const score=snapshot.value;
  value.textContent=score+' / 100';
  const name=score<=24?'Экстремальный страх':
   score<=44?'Страх':score<=55?'Нейтрально':
   score<=74?'Жадность':'Экстремальная жадность';
  label.textContent=name;
  track.setAttribute('aria-valuenow',String(score));
  track.setAttribute('aria-valuetext',name);
  needle.style.left=score+'%';
  const freshness=hasLive?'Свежий ответ':saved?'Сохранённый индекс':'Исторический';
  status.textContent='Alternative.me · '+freshness+
   ' · наблюдение '+nice(snapshot.observedAt)+
   (hasLive?'':r?.state?' · новый ответ: '+r.state:'');
 }
 function cardResult(mode,result,symbol){
  const outer=div('article','free-source-result');
  const label={okx:'OKX Spot',dex:'DEX Screener',gecko:'GeckoTerminal',
   paprika:'CoinPaprika',cmc:'CoinMarketCap Keyless'}[mode];
  outer.append(div('strong','',label));
  if(!isPresent(result)||!result.data){
   const reason=(mode==='dex'||mode==='gecko')&&!dexTokenReference(symbol)?
    'Для этого символа нет проверенного контракта, запрос не выполнялся':
    (result.reason||result.state||'Источник недоступен');
   outer.append(div('small','',reason+caps(mode,result)));
   return outer;
  }
  const data=result.data;
  if(mode==='okx'){
   outer.append(div('span','free-source-figure',
    'Spot: '+fmt(data.price,7)+' USDT'),
    div('small','',
     'Bid '+fmt(data.bid,7)+' · Ask '+fmt(data.ask,7)));
  }else if(mode==='paprika'||mode==='cmc'){
   outer.append(div('span','free-source-figure',
    'Цена: '+fmt(data.priceUsd,7)+' USD'),
    div('small','',
     'Капитализация $'+fmt(data.marketCapUsd,0)+
     ' · объём 24 ч $'+fmt(data.volume24hUsd,0)));
  }else{
   outer.append(div('span','free-source-figure',
    data.tokenLabel+' · '+fmt(data.priceUsd,7)+' USD'),
    div('small','',
     'DEX-пул · ликвидность $'+fmt(data.liquidityUsd,0)+
     ' · объём 24 ч $'+fmt(data.volume24hUsd,0)));
  }
  outer.append(div('small','',
   'Получено '+nice(result.fetchedAt)+
   (result.state==='STALE'?' · архив':'')+caps(mode,result)));
  return outer;
 }
 function renderReconciliation(symbol){
  const status=el('source-reconciliation-status');
  const list=el('source-reconciliation-list');
  if(!status||!list||getSymbol?.()!==symbol)return;
  list.replaceChildren();
  const context=contextMeasurements?.symbol===symbol?
   Object.fromEntries((contextMeasurements.sources||[]).map(x=>[x.id,x])):{};
  const assetResults=assetMeasurements?.symbol===symbol?
   assetMeasurements.results:{};
  const market=marketMeasurements?.symbol===symbol?
   Object.fromEntries((marketMeasurements.sources||[]).map(x=>[x.id,x])):{};
  const social=socialMeasurement?.symbol===symbol?{bluesky:socialMeasurement.result}:{};
  const observations={...market,...context,...assetResults,
   ...(fearMeasurement?{fear:fearMeasurement}:{}),...social};
  const report=reconcileSources(symbol,observations);
  status.textContent='Проверено '+report.checked+' источников · '+report.usable+
   ' со временем наблюдения · без искусственного рейтинга точности.';
  const groups=Object.entries(report.byGroup);
  if(!groups.length){
   list.append(div('small','','Сведения появятся после проверки публичных API.'));
   return;
  }
  for(const [key,count] of groups){
   const row=div('article','source-reconciliation-row');
   row.append(div('strong','',SOURCE_GROUPS[key]||key),
    div('small','',count.valid+'/'+count.checked+
     ' подтверждены по формату и времени наблюдения'));
   list.append(row);
  }
  const compare=div('p','source-reconciliation-comparison');
  if(report.comparison.state==='INSUFFICIENT')
   compare.textContent='Сравнение двух USD-агрегаторов пока недоступно.';
  else compare.textContent='CoinPaprika / CoinMarketCap: расхождение '+
   report.comparison.deltaPercent.toFixed(3)+'%'+
   (report.comparison.state==='DIFFERENT'?' · оценки заметно различаются':
    ' · оценки близки')+
   '. Это не биржевой спред и не независимое подтверждение.';
  list.append(compare);
 }
 function setSocial(symbol,result){
  if(getSymbol?.()!==symbol)return;
  socialMeasurement={symbol,result};
  renderReconciliation(symbol);
 }
 function setSnapshot(symbol,snapshot){
  if(getSymbol?.()!==symbol)return;
  marketMeasurements=snapshot&&snapshot.symbol===symbol?snapshot:null;
  if(marketMeasurements&&Array.isArray(marketMeasurements.sources)){
   for(const source of marketMeasurements.sources)
    reliability.record({provider:source.id,result:source});
   renderReliability();
  }
  renderReconciliation(symbol);
 }
 function setContext(symbol,context){
  if(getSymbol?.()!==symbol)return;
  contextMeasurements=context&&context.symbol===symbol?context:null;
  if(contextMeasurements&&Array.isArray(contextMeasurements.sources)){
   for(const source of contextMeasurements.sources){
    // Memoized network gates and budget fallbacks are not new API attempts.
    if(source.access==='CACHE'||source.source==='CACHE'||
     source.source==='STALE_CACHE')continue;
    reliability.record({provider:source.id,result:source});
   }
   renderReliability();
  }
  renderReconciliation(symbol);
 }
 async function openOverview(){
  const seq=++globalSeq;
  const status=el('free-fear-status');
  if(status&&!overviewCache.readFear())status.textContent='Проверяем Alternative.me и кеш…';
  const r=await budget.load('fear',()=>fetchFearGreed());
  if(seq!==globalSeq)return;
  fearMeasurement=r;
  showFear(r);annotate('fear',r);
  renderReconciliation(getSymbol?.());
 }
 async function openAsset(symbol=getSymbol?.()){
  const seq=++assetSeq;
  const list=el('free-asset-market-results');
  const status=el('free-asset-market-status');
  if(!list||!status)return;
  list.replaceChildren();
  status.textContent='Проверяем бесплатные источники и суточные лимиты…';
  const supportsDex=Boolean(dexTokenReference(symbol));
  const sourceCalls=[
   budget.load('okx',()=>fetchOkxTicker(symbol),{key:symbol}),
   budget.load('paprika',()=>fetchPaprikaTicker(symbol),{key:symbol}),
   budget.load('cmc',()=>fetchCmcKeyless(symbol),{key:symbol}),
   supportsDex?budget.load('dex',()=>fetchDexPairs(symbol),{key:symbol}):
    Promise.resolve({state:'UNSUPPORTED'}),
   supportsDex?budget.load('gecko',()=>fetchGeckoPools(symbol),{key:symbol}):
    Promise.resolve({state:'UNSUPPORTED'})
  ];
  const responses=await Promise.all(sourceCalls);
  if(seq!==assetSeq||getSymbol?.()!==symbol)return;
  const modes=['okx','paprika','cmc','dex','gecko'];
  assetMeasurements={symbol,results:Object.fromEntries(modes.map((k,i)=>[k,responses[i]]))};
  const paprika=assetMeasurements.results.paprika,cmc=assetMeasurements.results.cmc;
  const t1=paprika?.data?.observedAt,t2=cmc?.data?.observedAt;
  if(paprika?.source==='NETWORK'&&cmc?.source==='NETWORK'&&
   paprika.state==='OK'&&cmc.state==='OK'&&
   Number.isSafeInteger(t1)&&Number.isSafeInteger(t2)&&
   Math.abs(t1-t2)<=2*3600000){
   reliability.compareUsd({asset:symbol,one:paprika.data.priceUsd,
    two:cmc.data.priceUsd});
   renderReliability();
  }
  for(const [i,mode] of modes.entries()){
   const r=responses[i];
   list.append(cardResult(mode,r,symbol));
   annotate(mode,r,(mode==='dex'||mode==='gecko')&&supportsDex?symbol:
    ['okx','paprika','cmc'].includes(mode)?symbol:null);
  }
  const good=responses.filter(x=>x.state==='OK').length;
  status.textContent=symbol+' · проверено '+good+'/5 источников'+
   (!supportsDex?' · без DEX: нет надёжного контракта':'')+
   '. DEX-цены обёрнутых токенов не равны ценам нативных активов.';
  renderReconciliation(symbol);
 }
 /**
  * Real public API checks initiated when the Sources view is opened or its
  * explicit retry button is pressed. Existing quota/cache rules still apply.
  * Wrapped-token DEX is checked on ETH reference if selected coin has no map.
  */
 async function checkPublicSources(symbol=getSymbol?.()){
  if(checkingPublic)return checkingPublic;
  if(typeof symbol!=='string'||!/^[A-Z0-9]{5,20}$/.test(symbol))
   return {state:'INVALID_ASSET'};
  const button=el('free-check-all');
  if(button)button.disabled=true;
  const work=(async()=>{
   try{
    await Promise.all([openOverview(),openAsset(symbol)]);
    if(!dexTokenReference(symbol)){
     const anchor='ETHUSDT';
     const [dex,gecko]=await Promise.all([
      budget.load('dex',()=>fetchDexPairs(anchor),{key:anchor}),
      budget.load('gecko',()=>fetchGeckoPools(anchor),{key:anchor})
     ]);
     annotate('dex',dex,'WETH/ETH');
     annotate('gecko',gecko,'WETH/ETH');
    }
    return {state:'CHECKED',symbol};
   }finally{
    checkingPublic=null;
    if(button)button.disabled=false;
    refreshCenter();
   }
  })();
  checkingPublic=work;
  refreshCenter();
  return work;
 }
 async function refreshPersonalStatus(){
  personalNews=await personalNewsStatus();
  refreshCenter();
 }
 initPersonalNewsControls({getSymbol,
  onChange:()=>{personalChecks.clear();void refreshPersonalStatus();},
  onTest:(provider,result)=>{personalChecks.set(provider,result);refreshCenter();}});
 void refreshPersonalStatus();
 el('free-check-all')?.addEventListener('click',()=>void checkPublicSources());
 el('free-fear-refresh')?.addEventListener('click',()=>void openOverview());
 el('free-asset-market-refresh')?.addEventListener('click',
  ()=>void openAsset(getSymbol?.()));
 const storedFear=overviewCache.readFear();
 if(storedFear)showFear({state:'STALE',data:storedFear.value});
 refreshCenter();
 return {openOverview,openAsset,checkPublicSources,refreshCenter,setContext,setSnapshot,setSocial};
}
