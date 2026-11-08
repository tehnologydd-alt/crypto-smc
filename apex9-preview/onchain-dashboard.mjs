/**
 * APEX Android First — public BTC / ETH network telemetry display.
 * User device owns the cache. Do not infer price direction or wallet actions.
 */
import {chainForAsset,collectOnChainNetwork,summarizeOnChainHistory,
 parseOnChainHistory} from './onchain-core.mjs';
import {getMobileOnChainHistory,saveMobileOnChainObservation} from './mobile-bridge.mjs';
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
const chainNames={bitcoin:'Bitcoin · сеть BTC',ethereum:'Ethereum · сеть ETH'};
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
 const field=chain==='bitcoin'?'mempoolCount':'transactionsToday';
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
 async function refresh(asset,force=false){
  const chain=chainForAsset(asset);
  if(asset!==lastAsset){
   generation++;abort?.abort();abort=null;rows=[];activeChain=null;lastFetchedAt=0;
   lastAsset=asset;
  }
  const seq=++generation;
  if(!chain){
   get('network-name').textContent='Адаптер сети не подключён';
   get('network-history-count').textContent='0 записей';
   get('network-history-note').textContent='Не используем данные BTC или ETH для других монет.';
   renderMetrics(null,null,true);
   rows=[];activeChain=null;redraw();
   setStatus('Для '+asset+' нет прямого проверенного ончейн-источника. История другой сети не подставляется.',true);
   return;
  }
  get('network-name').textContent=chainNames[chain];
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
  lastFetchedAt=0;rows=[];activeChain=null;
  get('network-metrics').replaceChildren();
  get('network-history-count').textContent='0 записей';
  get('network-name').textContent='Выбран '+asset;
  setStatus('Переключаем сетевой источник…');
  redraw();
 }};
}
