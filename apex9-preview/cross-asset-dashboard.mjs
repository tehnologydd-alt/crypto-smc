/**
 * Cross-Asset Research: opt-in, phone-local BTC/ETH/SOL H1 comparison.
 * All archives are read independently, then aligned to exactly equal clock
 * timestamps. No remote calls, live trading, simulated data or speculation.
 */
import {getMobileCandleArchive} from './mobile-bridge.mjs';
import {analyzeCrossAssetRegimes,CROSS_ASSETS, CROSS_RULES} from './cross-asset-research.mjs';
import {REGIME_TYPES} from './research-regimes.mjs';

const el=id=>document.getElementById(id);
const node=(tag,cls='',value)=>{
 const item=document.createElement(tag);
 if(cls)item.className=cls;
 if(value!==undefined)item.textContent=String(value);
 return item;
};
const fmt=(n,d=0)=>Number.isFinite(n)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n):'—';
const percent=n=>Number.isFinite(n)?fmt(n*100,1)+'%':'—';
const clock=t=>Number.isSafeInteger(t)?
 new Date(t).toLocaleDateString('ru-RU'):'—';
const abbr={BTCUSDT:'BTC',ETHUSDT:'ETH',SOLUSDT:'SOL'};
const short={DIRECTIONAL:'Направленное',RANGE:'Боковик',TRANSITION:'Переход'};

export function initCrossAssetDashboard(){
 const button=el('cross-run'),cancel=el('cross-cancel'),
  status=el('cross-status'),assets=el('cross-sources'),
  result=el('cross-result');
 let serial=0,busy=false;
 const message=(text,warn=false)=>{
  status.textContent=text;status.classList.toggle('is-offline',warn);
 };
 const clear=()=>{
  result.replaceChildren();assets.replaceChildren();
 };
 const lock=running=>{
  busy=running;button.disabled=running;cancel.disabled=!running;
 };
 const note=(text,css='cross-note')=>node('p',css,text);
 function render(report){
  assets.replaceChildren();
  for(const asset of report.statuses){
   const line=node('div','cross-source'+
    (asset.state==='VERIFIED'?' is-verified':' is-excluded'));
   line.append(node('strong','',abbr[asset.asset]||asset.asset),
    node('span','',asset.state==='VERIFIED'?
     fmt(asset.closedBars)+' проверенных H1-свечей':
     'Исключён: '+asset.reason));
   assets.append(line);
  }
  result.replaceChildren();
  if(report.state!=='DESCRIPTIVE'){
   result.append(note(report.reason+
    '. Сопоставление разных активов не опубликовано.','regimes-warning'));
   return;
  }
  const stats=node('div','cross-stats');
  for(const [label,value] of [
   ['Активов с полной историей',fmt(report.assets.length)+' / 3'],
   ['Общих 4H-окон',fmt(report.matchedWindows)],
   ['Общий временной участок',
    clock(report.commonStart)+' — '+clock(report.commonEnd)]
  ]){
   const tile=node('div','cross-stat');
   tile.append(node('span','',label),node('strong','',value));
   stats.append(tile);
  }
  result.append(stats);
  if(report.partial)result.append(note(
   'Частичное сравнение: один актив исключён. Доли относятся только к '+
   'двум проверенным архивам, а не ко всем трём.','regimes-warning'));
  result.append(node('h5','','Распределение режимов на одинаковой истории'));
  const overview=node('div','cross-assets-grid');
  for(const item of report.rows){
   const card=node('article','cross-asset-card');
   card.append(node('h6','',abbr[item.asset]+' · '+
    fmt(item.samples)+' окон'));
   for(const mode of item.modes){
    const bar=node('div','cross-mode');
    const head=node('div','cross-mode-head');
    head.append(node('span','',short[mode.id]),
     node('strong','',percent(mode.share)));
    const track=node('div','cross-track');
    const fill=node('span','cross-fill cross-'+mode.id.toLowerCase());
    fill.style.width=Math.max(0,Math.min(100,mode.share*100))+'%';
    track.append(fill);bar.append(head,track);
    card.append(bar);
   }
   overview.append(card);
  }
  result.append(overview);
  result.append(node('h5','','Совпадение режимов в одинаковые часы'));
  const pairs=node('div','cross-pairs');
  for(const item of report.pairs){
   const card=node('article','cross-pair');
   const head=node('div','cross-pair-head');
   head.append(node('strong','',
    abbr[item.a]+' ↔ '+abbr[item.b]),
    node('span','',percent(item.sameModeShare)));
   card.append(head,node('p','cross-mini',
    'Одинаковые исторические метки: '+fmt(item.matches)+
    ' из '+fmt(item.samples)+' четырёхчасовых окон'));
   const folds=node('div','cross-folds');
   for(const part of item.folds){
    const fold=node('div','cross-fold');
    fold.append(node('span','',part.label+' · '+
     fmt(part.matches)+'/'+fmt(part.samples)),
     node('strong','',percent(part.share)));
    folds.append(fold);
   }
   card.append(folds);pairs.append(card);
  }
  result.append(pairs);
  const details=node('details','cross-transition-details');
  details.append(node('summary','',
   'Сохранение режима через 4 часа · по активам'));
  details.append(note('Доли показываются только при не менее '+
   CROSS_RULES.minOriginPairsForRate+
   ' исторических переходах из каждого исходного режима. '+
   'Это не прогноз следующего состояния.','cross-mini'));
  for(const item of report.rows){
   const group=node('div','cross-transition-group');
   group.append(node('strong','',abbr[item.asset]));
   for(const mode of item.modes){
    const row=node('div','cross-transition-row');
    row.append(node('span','',short[mode.id]+
     ' · '+fmt(mode.stayed)+' / '+fmt(mode.transitions)),
     node('strong','',mode.persistenceShare===null?
      'Мало данных':percent(mode.persistenceShare)));
    group.append(row);
   }
   details.append(group);
  }
  result.append(details,note(report.note));
 }
 async function run(){
  if(busy)return;
  const seq=++serial,records=[];
  clear();lock(true);
  message('Проверяем BTC, ETH и SOL: локальные H1-архивы Android…');
  try{
   for(let i=0;i<CROSS_ASSETS.length;i++){
    if(seq!==serial)return;
    const asset=CROSS_ASSETS[i];
    message('Читаем '+(i+1)+' из 3 · '+abbr[asset]+
     ': используем только исходные закрытые H1-свечи…');
    const archive=await getMobileCandleArchive(asset,'1h',{
     onProgress:(n,total)=>{if(seq===serial)
      message(abbr[asset]+': '+fmt(n)+' / '+fmt(total)+
       ' H1-свечей · источник Android Room');}
    });
    if(seq!==serial)return;
    records.push({asset,native:archive.native===true,
     candles:archive.candles,archiveComplete:archive.complete===true,
     error:archive.error||null});
   }
   if(seq!==serial)return;
   message('Сопоставляем только совпадающие часы истории…');
   // Fixed now is shared across all archives to avoid unequal time cutoffs.
   const report=analyzeCrossAssetRegimes(records,{now:Date.now()});
   if(seq!==serial)return;
   render(report);
   message(report.state==='DESCRIPTIVE'?
    'Готово: '+fmt(report.matchedWindows)+' общих окон, '+
    fmt(report.assets.length)+' проверенных актива. История без прогнозных выводов.':
    report.reason,report.state!=='DESCRIPTIVE'||report.partial);
  }catch(error){
   if(seq===serial){
    clear();message('Сравнение не завершено: '+
     String(error?.message||error),true);
   }
  }finally{
   if(seq===serial)lock(false);
  }
 }
 button.addEventListener('click',()=>void run());
 cancel.addEventListener('click',()=>{
  if(!busy)return;
  serial++;lock(false);clear();
  message('Сравнение остановлено. Незавершённые результаты не показаны.',true);
 });
 return {open(){}};
}
