/**
 * APEX Radar page — research-only market discovery.
 * No orders, AI votes, fabricated confidence, or hidden background scanning.
 * One timeframe and at most 12 pairs / 3 concurrent candle requests.
 */
import {fetchCandles} from './candles.mjs';
import {analyzeMarketFrame} from './market-core.mjs';
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
const REFRESH_MS=3*60000,UNIVERSE_MS=8*60000;

export function initRadarDashboard({getCatalog=()=>[],onOpenAsset=()=>{}}={}){
 let interval='1h',filter='all',sort='turnover',request=0,controller=null,
  active=false,rows=[],lastScanAt=0,lastInterval=null,
  universe=null,universeAt=0,failures=0,total=0;
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
  const root=id('radar-results');root.replaceChildren();
  const valid=rows.filter(row=>row.analysis?.state==='OK');
  id('radar-coverage').textContent=valid.length+' из '+total+' проверенных активов';
  const sorted=filterRadarRows(rows,{filter,sort});
  if(!sorted.length){
   root.append(create('p','radar-empty',rows.length?
    'По выбранному фильтру нет подтверждённых наблюдений.':
    'После проверки рыночных данных здесь появятся активы.'));
   return;
  }
  for(const row of sorted){
   const card=create('article','radar-record');
   const top=create('div','radar-record-top');
   const names=create('div','radar-record-name');
   names.append(create('strong','',nicePair(row.symbol)),
    create('small','',FRAME[interval]+' · Binance Spot'));
   const direction=create('span','radar-direction dir-'+row.analysis.direction.toLowerCase(),
    DIRECTION[row.analysis.direction]||'—');
   top.append(names,direction);card.append(top);
   const metrics=create('div','radar-record-metrics');
   const items=[
    ['Режим',MODE[row.analysis.mode]||'—'],
    ['Скорость · %/свеча',(row.analysis.movement>0?'+':'')+fmt(row.analysis.movement,3)+'%'],
    ['Объём / медиана',fmt(row.analysis.volumeRatio,2)+'×'],
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
     (row.change24h>0?'+':'')+fmt(row.change24h,2)+'%'));
   card.append(meta);
   const open=create('button','radar-open','Открыть подробный анализ');
   open.type='button';open.setAttribute('aria-label','Анализ актива '+nicePair(row.symbol));
   open.addEventListener('click',()=>onOpenAsset(row.symbol));
   card.append(open);root.append(card);
  }
 }
 function clearRun(){
  if(controller){controller.abort();controller=null;}
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
  lastScanAt=0;lastInterval=null;
  render();id('radar-refresh').disabled=true;
  status('Запрашиваем публичный список торговых пар…');
  const catalog=getCatalog();
  if(!catalog?.length){
   status('Каталог Spot загружается. Радар начнёт проверку после получения списка.',true);
   if(generation===request){controller=null;id('radar-refresh').disabled=false;}
   return;
  }
  try{
   const fresh=force||!universe||Date.now()-universeAt>UNIVERSE_MS;
   if(fresh){
    universe=await fetchRadarUniverse({catalog,signal:local.signal});
    if(universe.state==='OK')universeAt=Date.now();
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
     rows.push({...item.ticker,analysis:item.analysis});
    }
    render();
    status('Проверено '+Math.min(offset+batch.length,total)+' из '+total+
     ' · доступны '+rows.length+(failures?' · без подтверждения '+failures:'')+
     ' · '+FRAME[chosen],Boolean(failures));
    if(stopForLimit)break;
   }
   if(generation!==request||local.signal.aborted)return;
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
  open(){active=true;void scan();},
  close(){active=false;if(controller)clearRun();},
  catalogChanged(){if(active&&!controller&&!rows.length)void scan();}
 };
}
