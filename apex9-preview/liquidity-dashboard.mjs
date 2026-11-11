/**
 * APEX on-phone Liquidity history UI. No remote data requests.
 * Historical order-book depth is NEVER labeled live or tradable.
 */
import {getMobileLiquidityHistory} from './mobile-bridge.mjs';
import {studyVisibleLiquidity} from './liquidity-core.mjs';
import {describeDepthAvailability} from './source-availability.mjs';
import {renderLevelObserver} from './level-dashboard.mjs';

const get=id=>document.getElementById(id);
const text=(id,value)=>{get(id).textContent=value;};
const fmt=(n,d=2)=>Number.isFinite(n)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n):'—';
const create=(tag,cls,value)=>{
 const element=document.createElement(tag);
 if(cls)element.className=cls;
 if(value!==undefined)element.textContent=String(value);
 return element;
};
const timestamp=n=>Number.isSafeInteger(n)?
 new Date(n).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const VENUES={binance:'Binance Spot',okx:'OKX Spot',bybit:'Bybit · архив'};
const statusLabels={
 OBSERVED:'Последние наблюдения',
 HISTORICAL:'Только история',
 LOW_COVERAGE:'Мало наблюдений',
 NO_SAMPLES:'Пока нет снимков'
};
function describeVenue(v,source){
 const available=describeDepthAvailability(v.venue,source,v.samples);
 const card=create('div','liquidity-venue-card');
 const title=create('div','liquidity-venue-header');
 title.append(create('strong','',VENUES[v.venue]||v.venue),
  create('span','liquidity-age '+(v.status==='OBSERVED'?'fresh':'historical'),
   v.samples?(statusLabels[v.status]||v.status):available.label));
 card.append(title);
 if(!v.samples){
  card.append(create('p','muted',available.reason));
  return card;
 }
 const value=create('div','liquidity-imbalance',
  (v.imbalance>0?'+':'')+fmt(v.imbalance*100,1)+'%');
 card.append(value,create('div','liquidity-im-label','Соотношение видимых заявок · исторический снимок'));
 const details=create('div','liquidity-venue-details');
 const metrics=[
  ['Спред',fmt(v.spreadBps,2)+' б.п.'],
  ['Снимков в выборке',fmt(v.samples,0)],
  ['В последнем непрерывном участке',fmt(v.continuousSamples??v.samples,0)],
  ['Последний',timestamp(v.lastCollectedAt)],
  ['Глубина выборки',v.quantityScope||'Неизвестно'],
  ['Способ получения',v.collectionMethod==='WS'?
   'WebSocket · отдельные снимки, не все обновления':
   v.collectionMethod==='REST'?'REST · периодический срез':
    'Архив · метод не подтверждён'],
  ['Охват цены',v.snapshotLevelsMax?
   'До '+v.snapshotLevelsMax+' уровней на сторону':
   'Ограниченный, точное число неизвестно']
 ];
 if(v.imbalanceChange!==null)
  metrics.push(['Изменение дисбаланса',
   (v.imbalanceChange>0?'+':'')+fmt(v.imbalanceChange*100,1)+' п.п.']);
 if(v.spreadChangeBps!==null)
  metrics.push(['Изменение спреда',
   (v.spreadChangeBps>0?'+':'')+fmt(v.spreadChangeBps,2)+' б.п.']);
 for(const [label,value] of metrics){
  const line=create('div','data-row');
  line.append(create('span','',label),create('strong','',value));
  details.append(line);
 }
 card.append(details);
 if(v.status!=='OBSERVED'){
  card.append(create('p','liquidity-coverage-note',
   v.status==='HISTORICAL'
    ?'Неактуальная запись: снимок не отражает текущий стакан.'
    :'Пока недостаточно последовательной истории: '+v.continuousSamples+
     ' снимков в текущем участке за '+fmt(v.spanMs/60000,1)+
     ' мин. Нужно минимум три за две минуты без разрывов более часа.'));
 }
 if(available.state!=='OBSERVED')
  card.append(create('p','liquidity-coverage-note',
   'Проверка источника: '+available.reason));
 return card;
}
/** Canvas time series with honest gaps; never connects missing intervals. */
function draw(canvas,points){
 const rect=canvas.getBoundingClientRect();
 const w=Math.max(60,Math.round(rect.width)),h=Math.max(90,Math.round(rect.height));
 const dpr=Math.min(3,Math.max(1,globalThis.devicePixelRatio||1));
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const c=canvas.getContext('2d');
 if(!c)return;
 c.setTransform(dpr,0,0,dpr,0,0);
 c.clearRect(0,0,w,h);
 c.fillStyle='#071a21';c.fillRect(0,0,w,h);
 const padL=38,padR=9,padT=16,padB=26;
 const innerW=w-padL-padR,innerH=h-padT-padB;
 const y=v=>padT+innerH*(1-(v+1)/2);
 c.font='11px system-ui,sans-serif';
 for(const n of [-1,-.5,0,.5,1]){
  c.beginPath();c.strokeStyle=n===0?'#507981':'#25434c';
  c.setLineDash(n===0?[4,3]:[]);
  c.moveTo(padL,y(n));c.lineTo(w-padR,y(n));c.stroke();
  c.setLineDash([]);
  c.fillStyle='#94b0b8';c.textAlign='right';c.textBaseline='middle';
  c.fillText((n*100).toFixed(0)+'%',padL-6,y(n));
 }
 if(!points.length){
  c.fillStyle='#9ebbc3';c.textAlign='center';
  c.fillText('Нет сохранённой истории стакана',w/2,h/2);return;
 }
 const last=points.at(-1).observedAt;
 // Limit visualization to last 24 hours, never connect venues or long gaps.
 const minT=Math.max(points[0].observedAt,last-86400000);
 const filtered=points.filter(p=>p.observedAt>=minT);
 const min=filtered[0]?.observedAt??minT;
 const max=filtered.at(-1)?.observedAt??min;
 const x=t=>padL+(max>min?(t-min)/(max-min):.5)*innerW;
 const colors={binance:'#4de3dd',okx:'#e1ba8b'};
 for(const venue of ['binance','okx']){
  const rows=filtered.filter(p=>p.venue===venue);
  c.strokeStyle=colors[venue];c.lineWidth=2;
  c.beginPath();
  for(let i=0;i<rows.length;i++){
   const p=rows[i],px=x(p.observedAt),py=y(p.imbalance);
   if(i===0||p.observedAt-rows[i-1].observedAt>3600000)c.moveTo(px,py);
   else c.lineTo(px,py);
  }
  c.stroke();
  for(const p of rows){
   c.fillStyle=colors[venue];c.beginPath();c.arc(x(p.observedAt),y(p.imbalance),2.9,0,2*Math.PI);c.fill();
  }
 }
 c.fillStyle='#94b0b8';c.font='10px system-ui,sans-serif';c.textBaseline='bottom';
 c.textAlign='left';c.fillText(timestamp(min),padL,h-3);
 c.textAlign='right';c.fillText(timestamp(max),w-padR,h-3);
}

export function initLiquidityDashboard(){
 let generation=0,lastAsset='',lastPoints=[];
 let latestSources={};
 let chartFrame=0;
 const canvas=get('liquidity-history-canvas');
 function paint(){
  if(chartFrame)return;
  chartFrame=requestAnimationFrame(()=>{chartFrame=0;draw(canvas,lastPoints);});
 }
 const observer=typeof ResizeObserver!=='undefined'
  ?new ResizeObserver(paint):null;
 observer?.observe(canvas);
 if(!observer)window.addEventListener('resize',paint);
 function clear(asset){
  generation++;lastAsset=asset;lastPoints=[];latestSources={};
  text('liquidity-history-status','Проверяем историю видимых заявок '+asset+'…');
  get('liquidity-history-venues').replaceChildren();
  get('level-observer-content').replaceChildren();
  text('level-observer-status','Проверяем ценовые уровни '+asset+'…');
  paint();
 }
 async function refresh(asset){
  if(typeof asset!=='string'||!/^[A-Z0-9]{5,20}$/.test(asset))return;
  const n=++generation;lastAsset=asset;
  try{
   const history=await getMobileLiquidityHistory(asset,160);
   if(n!==generation)return;
   const venueContainer=get('liquidity-history-venues');
   venueContainer.replaceChildren();
   if(!history.native){
    text('liquidity-history-status',
     'Локальная история доступна в установленном Android APK.');
    renderLevelObserver([],asset);
    lastPoints=[];paint();return;
   }
   if(history.error){
    text('liquidity-history-status','Нет доступа к локальной истории: '+history.error);
    renderLevelObserver([],asset);
    lastPoints=[];paint();return;
   }
   const analysis=studyVisibleLiquidity(history.rows,{asset,now:Date.now()});
   renderLevelObserver(history.rows,asset);
   lastPoints=analysis.points;
   for(const venue of analysis.venues)
    venueContainer.append(describeVenue(venue,latestSources[venue.venue]));
   text('liquidity-history-status',analysis.samples
    ?'Снимков в выборке: '+analysis.samples+
     ' · '+asset+' · до 80 последних Binance и OKX; Bybit остаётся архивом в Room'
    :'История '+asset+' пока пуста. Откройте актив при доступном интернете, чтобы накопить снимки.');
   paint();
  }catch(e){
   if(n!==generation)return;
   text('liquidity-history-status','Не удалось открыть историю: '+String(e?.message||e));
   renderLevelObserver([],asset);
   lastPoints=[];paint();
  }
 }
 paint();
 return {refresh,clear,
  setSourceStatuses(asset,sources){
   if(asset!==lastAsset||!Array.isArray(sources))return;
   // Partial depth refreshes touch only due providers. Preserve the
   // last diagnostic for other venues until they are explicitly checked.
   for(const venue of ['binance','okx']){
    const data=sources.find(s=>s?.id===venue+'-depth');
    if(data)latestSources[venue]={
     state:typeof data.state==='string'?data.state:'INVALID',
     error:typeof data.error==='string'?data.error:''
    };
   }
  },
  getLastAsset:()=>lastAsset};
}
