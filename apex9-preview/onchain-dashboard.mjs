/**
 * APEX Android First — public BTC / ETH network telemetry display.
 * User device owns the cache. Do not infer price direction or wallet actions.
 */
import {chainForAsset,collectOnChainNetwork,summarizeOnChainHistory,
 parseOnChainHistory} from './onchain-core.mjs';
import {getMobileOnChainHistory,saveMobileOnChainObservation} from './mobile-bridge.mjs';
import {initOnChainMarketDashboard} from './onchain-market-dashboard.mjs';
import {chainHeadSourceForAsset,collectChainHead,createChainHeadCache} from './onchain-chain-head.mjs';
import {collectDexMarket} from './onchain-dex-discovery.mjs';
const get=id=>document.getElementById(id);
const fmt=(v,digits=2)=>Number.isFinite(v)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(v):'—';
const stamp=v=>Number.isSafeInteger(v)?new Date(v).toLocaleString('ru-RU'):'—';
function node(tag,cls,text){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
const chainNames={
 bitcoin:'Bitcoin · сеть BTC',
 ethereum:'Ethereum · сеть ETH',
 ton:'GRAM · сеть TON'
};
const keys={
 bitcoin:[
  ['Ожидают в mempool','mempoolCount',' транзакций'],
  ['Объём очереди','mempoolVBytes',' vB'],
  ['Сумма комиссий в mempool','mempoolFeesSats',' sat'],
  ['Оценка комиссии ~1 ч','hourFee',' sat/vB']
 ],
 ethereum:[
  ['Транзакций за сегодня','transactionsToday',''],
  ['Всего обработано транзакций','totalTransactions',''],
  ['Загрузка сети','networkUtilizationPct','%'],
  ['Среднее время блока','averageBlockTimeSeconds',' с'],
  ['Средняя оценка gas','averageGasGwei',' Gwei']
 ],
 ton:[
  ['Последний номер блока masterchain','masterchainSeqno','']
 ]
};
function draw(canvas,rows,chain){
 const {width,height}=canvas.getBoundingClientRect();
 const w=Math.max(60,Math.round(width)),h=Math.max(80,Math.round(height));
 const dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext('2d');
 if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#071923';ctx.fillRect(0,0,w,h);
 const field=chain==='bitcoin'?'mempoolCount':
  chain==='ethereum'?'transactionsToday':chain==='ton'?'masterchainSeqno':'chainHeight';
 const sorted=rows.filter(x=>Number.isFinite(x[field])).slice(-80);
 ctx.font='11px system-ui';ctx.fillStyle='#99b8be';
 if(sorted.length<2){
  ctx.textAlign='center';ctx.fillText('Для истории нужны минимум два реальных наблюдения',w/2,h/2);
  return;
 }
 const first=sorted[0].collectedAt,last=sorted.at(-1).collectedAt;
 const min=Math.min(...sorted.map(x=>x[field]));
 const max=Math.max(...sorted.map(x=>x[field]));
 const padL=56,padR=9,padT=17,padB=29;
 const areaW=Math.max(5,w-padL-padR),areaH=Math.max(5,h-padT-padB);
 const y=v=>padT+(max>min?(max-v)/(max-min):.5)*areaH;
 const x=t=>padL+(last>first?(t-first)/(last-first):.5)*areaW;
 ctx.strokeStyle='#274a53';ctx.lineWidth=1;
 for(let i=0;i<4;i++){
  const level=min+(max-min)*(3-i)/3,yy=y(level);
  ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(w-padR,yy);ctx.stroke();
  ctx.textAlign='right';ctx.textBaseline='middle';
  ctx.fillText(fmt(level,0),padL-5,yy);
 }
 ctx.strokeStyle='#55d9da';ctx.lineWidth=2;
 ctx.beginPath();
 for(let i=0;i<sorted.length;i++){
  const sample=sorted[i];
  if(i===0||sample.collectedAt-sorted[i-1].collectedAt>90*60000)
   ctx.moveTo(x(sample.collectedAt),y(sample[field]));
  else ctx.lineTo(x(sample.collectedAt),y(sample[field]));
 }
 ctx.stroke();
 for(const row of sorted){
  ctx.fillStyle='#8deae8';ctx.beginPath();
  ctx.arc(x(row.collectedAt),y(row[field]),2.5,0,2*Math.PI);ctx.fill();
 }
 ctx.fillStyle='#9fbec2';ctx.textBaseline='alphabetic';ctx.font='10px system-ui';
 ctx.textAlign='left';ctx.fillText(new Date(first).toLocaleDateString('ru-RU'),padL,h-7);
 ctx.textAlign='right';ctx.fillText(new Date(last).toLocaleDateString('ru-RU'),w-padR,h-7);
}
function renderMetrics(chain,latest,stale){
 const container=get('network-metrics');container.replaceChildren();
 if(!latest){
  container.append(node('p','muted','Проверенных наблюдений сети пока нет.'));
  return;
 }
 for(const [label,field,unit] of keys[chain]){
  const line=node('div','network-stat');
  const value=field==='hourFee'?latest.feeRates?.hourFee:latest[field];
  line.append(node('span','',label),
   node('strong','',Number.isFinite(value)?fmt(value,field==='averageGasGwei'?3:2)+unit:'Не получено'));
  container.append(line);
 }
 if(stale)container.append(node('p','network-warning',
  'Снимок из локальной истории. Значения не являются текущими данными сети.'));
}
export function initOnChainDashboard(){
 const marketComparison=initOnChainMarketDashboard();
 let storage=null;
 try{storage=globalThis.localStorage;}catch{}
 const headCache=createChainHeadCache({storage});
 const dexCache=new Map(); // bounded foreground-only snapshots
 let generation=0,lastAsset='',lastFetchedAt=0,abort=null,rows=[],activeChain=null;
 const canvas=get('network-history-chart');
 const redraw=()=>draw(canvas,rows,activeChain);
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(redraw):null;
 observer?.observe(canvas);
 if(!observer)window.addEventListener('resize',redraw);
 const setStatus=(value,warning=false)=>{
  get('network-status').textContent=value;
  get('network-status').classList.toggle('is-offline',warning);
 };
 async function readCache(asset,chain,seq){
  const cached=await getMobileOnChainHistory(asset,100);
  if(seq!==generation)return;
  const stats=summarizeOnChainHistory(cached.rows,{chain,now:Date.now()});
  rows=stats.points||[];
  activeChain=chain;
  get('network-history-count').textContent=stats.samples+' записей';
  get('network-history-note').textContent=stats.samples?
   'Только реально сохранённые наблюдения · последнее получение: '+stamp(stats.lastCapturedAt)+
   ' · разрывы длиннее 90 мин не соединяются':
   'Локальная история для этого актива пока не накоплена.';
  renderMetrics(chain,stats.latest,stats.state!=='OBSERVED');
  redraw();
  return stats;
 }
 async function refreshHead(asset,force,seq){
  const source=chainHeadSourceForAsset(asset);
  if(!source)return false;
  activeChain=source.chain;
  get('network-name').textContent=source.label+' · публичный узел';
  get('network-supported-chains').textContent=source.label;
  const history=headCache.history(asset);
  function showSaved(values,label){
   if(!values.length)return;
   rows=values;activeChain=source.chain;
   const latest=values.at(-1);
   renderHead(latest,true);
   get('network-history-count').textContent=values.length+' записей';
   get('network-history-note').textContent=
    'Сохранённые публичные номера блоков/слотов · не история транзакций токена';
   redraw();
   setStatus(label+' · архив от '+stamp(latest.collectedAt),true);
  }
  showSaved(history,'Сведения из локального кеша');
  if(!force&&lastFetchedAt&&Date.now()-lastFetchedAt<4*60000)return true;
  if(force&&lastFetchedAt&&Date.now()-lastFetchedAt<90000){
   setStatus('Последняя проверка недавно · пока показываем сохранённый снимок');
   return true;
  }
  lastFetchedAt=Date.now();
  abort?.abort();
  const controller=new AbortController();abort=controller;
  const timeout=setTimeout(()=>controller.abort(),11000);
  setStatus('Проверяем публичный номер блока/слота '+source.label+'…');
  try{
   const result=await collectChainHead(asset,{now:()=>Date.now(),
    signal:controller.signal});
   if(seq!==generation)return true;
   if(!['OK','STALE'].includes(result.state)||!result.data){
    setStatus(source.label+' · '+result.state+' · '+(result.reason||'нет ответа')+
     (history.length?' · отображается сохранённый снимок':''),true);
    return true;
   }
   renderHead(result.data,result.state!=='OK');
   if(result.state==='OK')headCache.store(asset,result);
   rows=headCache.history(asset);
   if(!rows.length)rows=[result.data];
   get('network-history-count').textContent=rows.length+' записей';
   get('network-history-note').textContent=
    'Источник '+source.provider+' · время ответа '+stamp(result.data.collectedAt)+
    ' · номер блока не является данными кошелька или токена';
   redraw();
   setStatus(source.label+' · '+result.state+' · '+stamp(result.data.collectedAt),
    result.state!=='OK');
  }catch(e){
   if(seq===generation)setStatus('Свежий ответ сети недоступен · '+String(e?.message||e),true);
  }finally{
   clearTimeout(timeout);
   if(seq===generation)abort=null;
  }
  return true;
 }
 function renderHead(data,isArchive){
  const metric=get('network-metrics');metric.replaceChildren();
  for(const [label,value] of [
   [data.unit==='слот'?'Последний слот':'Последний блок',fmt(data.chainHeight,0)],
   ['Сеть',data.label],
   ['Источник',data.provider],
   ['Время получения',stamp(data.collectedAt)]
  ]){
   const line=node('div','network-stat');
   line.append(node('span','',label),node('strong','',value));metric.append(line);
  }
  metric.append(node('p','network-warning',isArchive?
   'Архивная запись; свежий блок пока не подтверждён.':
   'Номер блока — состояние сети, не движения токена и не торговый прогноз.'));
 }
 function renderDexReport(report){
  const container=get('network-metrics');
  container.replaceChildren();
  for(const source of report.sources){
   const provider=source.provider==='dexscreener'?'DEX Screener':'GeckoTerminal';
   const section=node('section','network-warning');
   section.append(node('strong','',provider+' · '+source.state));
   if(source.state==='CANDIDATES'){
    section.append(node('p','',
     'Совпадений тикера: '+source.candidatesTotal+
     '. Контракты не подтверждены.'));
    for(const pool of source.pools){
     const line=node('div','network-stat');
     line.append(node('span','',
      pool.pair+' · '+pool.chain+' · '+(pool.dex||'DEX')+
      ' · ликвидность USD '+fmt(pool.liquidityUsd,0)+
      ' · объём 24 ч USD '+fmt(pool.volume24hUsd,0)+
      (pool.lowActivityWarning?
       ' · ВНИМАНИЕ: крупная заявленная ликвидность при очень малой активности, требуется проверка контракта':'')
     ));
     section.append(line);
    }
   }else section.append(node('p','',source.reason||
    'Поставщик не вернул проверенных кандидатов.'));
   container.append(section);
  }
  container.append(node('p','network-warning',report.note));
 }
 async function refreshDex(asset,force,seq){
  activeChain=null;rows=[];redraw();
  get('network-name').textContent='Публичный DEX-рынок · '+asset;
  get('network-supported-chains').textContent='DEX Screener / GeckoTerminal';
  get('network-history-count').textContent='0 сетевых записей';
  get('network-history-note').textContent=
   'DEX-пулы — не транзакции токена; они не сохраняются как ончейн-история Room.';
  const cached=dexCache.get(asset);
  const at=Date.now();
  if(cached&&at-cached.at<(force?90000:240000)){
   renderDexReport(cached.report);
   setStatus('DEX-пулы · сохранённый результат · '+stamp(cached.at),
    cached.report.state!=='CANDIDATES');
   return;
  }
  const controller=new AbortController();abort?.abort();abort=controller;
  const timer=setTimeout(()=>controller.abort(),11000);
  setStatus('Получаем публичные DEX-пулы для '+asset+'…');
  try{
   const report=await collectDexMarket(asset,{
    signal:controller.signal,now:()=>Date.now()
   });
   if(seq!==generation)return;
   dexCache.delete(asset);
   dexCache.set(asset,{at:Date.now(),report});
   if(dexCache.size>8)dexCache.delete(dexCache.keys().next().value);
   renderDexReport(report);
   const message=report.state==='CANDIDATES'?
    'Найдены DEX-пулы ('+report.totalCandidates+
    ') · совпадение лишь по тикеру, контракт не проверен':
    report.state==='NO_MATCH'?
     'Пулы с точным базовым тикером не обнаружены':
     'Публичные DEX-источники недоступны или ответили частично';
   setStatus(message,report.state!=='CANDIDATES');
  }catch(e){
   if(seq===generation)setStatus(
    'Не удалось проверить DEX-пулы: '+String(e?.message||e).slice(0,100),true);
  }finally{
   clearTimeout(timer);
   if(seq===generation)abort=null;
  }
 }
 async function refresh(asset,force=false){
  const chain=chainForAsset(asset);
  if(asset!==lastAsset){
   generation++;abort?.abort();abort=null;rows=[];activeChain=null;lastFetchedAt=0;
   lastAsset=asset;
   marketComparison.setAsset(asset);
  }
  const seq=++generation;
  if(!chain){
   if(chainHeadSourceForAsset(asset)){
    await refreshHead(asset,force,seq);
    return;
   }
   await refreshDex(asset,force,seq);
   return;
  }
  get('network-supported-chains').textContent=chainNames[chain];
  get('network-name').textContent=chainNames[chain];
  marketComparison.runAuto();
  setStatus('Проверяем сохранённые наблюдения '+chainNames[chain]+'…');
  let cached=null;
  try{cached=await readCache(asset,chain,seq);}catch(e){
   if(seq===generation)setStatus('Локальная история недоступна: '+String(e?.message||e),true);
  }
  if(seq!==generation)return;
  if(!force&&lastFetchedAt&&Date.now()-lastFetchedAt<4*60000){
   if(cached?.latest)setStatus('Показаны наблюдения сети из локальной базы · '+stamp(cached.lastCapturedAt));
   return;
  }
  lastFetchedAt=Date.now();
  abort?.abort();
  const controller=new AbortController();abort=controller;
  const timeout=setTimeout(()=>controller.abort(),11000);
  setStatus('Получаем публичные сетевые показатели '+chainNames[chain]+'…');
  try{
   const result=await collectOnChainNetwork(asset,{
    now:()=>Date.now(),signal:controller.signal
   });
   if(seq!==generation)return;
   if(result.state!=='OK'){
    setStatus('Источник недоступен ('+result.state+'). '+
     (cached?.latest?'Отображается исторический снимок с телефона.':'Свежих сведений нет.'),true);
    return;
   }
   // Render real provider data even if Android storage is not available.
   renderMetrics(chain,result.data,false);
   const saved=await saveMobileOnChainObservation(asset,result);
   if(seq!==generation)return;
   if(saved.native&&saved.saved){
    await readCache(asset,chain,seq);
    if(seq!==generation)return;
    setStatus(chainNames[chain]+' · данные получены и сохранены · '+stamp(result.data.collectedAt));
   }else{
    setStatus(chainNames[chain]+' · получены '+stamp(result.data.collectedAt)+
     ' · локальное сохранение недоступно'+(saved.error?': '+saved.error:''));
   }
  }catch(e){
   if(seq===generation)setStatus('Сбой источника, исторические наблюдения сохранены: '+
    String(e?.message||e),true);
  }finally{
   clearTimeout(timeout);
   if(seq===generation)abort=null;
  }
 }
 get('network-refresh').addEventListener('click',()=>void refresh(lastAsset,true));
 return {refresh,clear(asset){
  generation++;abort?.abort();abort=null;lastAsset=asset;
  marketComparison.setAsset(asset);
  lastFetchedAt=0;rows=[];activeChain=null;
  const source=chainHeadSourceForAsset(asset);
  const saved=source?headCache.history(asset):[];
  if(saved.length){rows=saved;activeChain=source.chain;renderHead(saved.at(-1),true);}
  else get('network-metrics').replaceChildren();
  const nativeChain=chainForAsset(asset);
  get('network-history-count').textContent=String(rows.length)+' записей';
  get('network-name').textContent=source?.label||
   (nativeChain?chainNames[nativeChain]:'DEX-пулы · '+asset);
  get('network-supported-chains').textContent=source?.label||
   (nativeChain?chainNames[nativeChain]:'DEX Screener / GeckoTerminal');
  setStatus(source||nativeChain?
   'Источник выбран · откройте сведения сети для обновления':
   'Доступен поиск DEX-пулов двух публичных источников; '+
    'контракт токена пока не подтверждён.',!source&&!nativeChain);
  get('network-history-note').textContent=source||nativeChain?
   (rows.length?'Сохранённые сетевые снимки':'Сетевые наблюдения пока не получены'):
   '0 сетевых записей · DEX-пулы показываются отдельно от истории блокчейна';
  redraw();
 }};
}
