/**
 * APEX Research Synthesis dashboard. Read-only, manual, Android Room.
 * Only original complete closed-H1 archives are inputs to the pure core.
 * The result is explicitly historical and includes limitations and sources.
 */
import {getMobileCandleArchive} from './mobile-bridge.mjs';
import {CROSS_ASSETS} from './cross-asset-research.mjs';
import {synthesizeResearch} from './research-synthesis.mjs';

const get=id=>document.getElementById(id);
const el=(tag,className='',value)=>{
 const element=document.createElement(tag);
 if(className)element.className=className;
 if(value!==undefined)element.textContent=String(value);
 return element;
};
const int=n=>Number.isFinite(n)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n):'—';
const date=x=>Number.isSafeInteger(x)?
 new Date(x).toLocaleDateString('ru-RU'):'—';
const short=x=>x?.replace(/USDT$/,'')||x;

export function initResearchSynthesisDashboard(){
 const run=get('synthesis-run'),cancel=get('synthesis-cancel'),
  status=get('synthesis-status'),summary=get('synthesis-summary'),
  cards=get('synthesis-cards'),select=get('evidence-asset');
 let serial=0,busy=false;
 const announce=(message,warning=false)=>{
  status.textContent=message;
  status.classList.toggle('is-offline',warning);
 };
 const clear=()=>{summary.replaceChildren();cards.replaceChildren();};
 const lock=active=>{
  busy=active;
  run.disabled=active;cancel.disabled=!active;
 };
 const metric=(heading,value)=>{
  const item=el('div','synthesis-metric');
  item.append(el('span','',heading),el('strong','',value));
  summary.append(item);
 };
 const group=(label,entries,cls)=>{
  const section=el('section','synthesis-group '+cls);
  section.append(el('h5','',label));
  for(const record of entries){
   const card=el('article','synthesis-evidence');
   card.append(el('strong','',record.title),
    el('p','',record.detail));
   if(record.source)card.append(el('small','','Источник: '+record.source));
   section.append(card);
  }
  cards.append(section);
 };
 function render(report){
  clear();
  if(report.state!=='DESCRIPTIVE'){
   cards.append(el('p','regimes-warning',
    report.reason||'Исходный H1-архив не прошёл проверку'));
   for(const item of report.missing){
    cards.append(el('p','synthesis-note',item.title+': '+item.detail));
   }
   return;
  }
  metric('Актив',short(report.asset));
  metric('Закрытые H1-свечи',int(report.source.closedBars));
  metric('Исследованные 4H-окна',int(report.source.windows));
  metric('Исторический период',
   date(report.source.firstAt)+' — '+date(report.source.lastAt));
  const modes=report.coverage;
  const statuses=el('div','synthesis-audits');
  for(const [label,state] of [
   ['Режимы',modes.regimes],
   ['Хронология',modes.stability],
   ['Переходы',modes.transitions],
   ['Поздняя выборка',modes.holdout],
   ['Другие активы',modes.crossAsset]
  ]){
   const item=el('div','synthesis-audit');
   item.append(el('span','',label),el('strong','',
    state==='VERIFIED'?'Источник проверен':
    state==='DESCRIPTIVE'?'История исследована':
    state==='INSUFFICIENT'?'Мало наблюдений':
    state==='NOT_APPLICABLE'?'Не применяется':
    'Проверка недоступна'));
   statuses.append(item);
  }
  cards.append(statuses);
  group('Что наблюдалось в проверенной истории',
   report.observations,'synthesis-observed');
  if(report.differences.length){
   group('Где обнаружены исторические расхождения',
    report.differences,'synthesis-differences');
  }else{
   const pane=el('section','synthesis-group synthesis-differences');
   pane.append(el('h5','','Исторические расхождения'),
    el('p','synthesis-note',
     'По заранее заданным описательным порогам заметных расхождений '+
     'не выделено. Это не подтверждение стабильности или прогностической точности.'));
   cards.append(pane);
  }
  group('Что нельзя подтвердить и чего не хватает',
   report.missing,'synthesis-missing');
  cards.append(el('p','synthesis-disclaimer',report.note));
 }
 async function readRecord(asset,seq){
  announce('Читаем '+short(asset)+
   ' · оригинальный локальный архив H1 Android Room…');
  const archive=await getMobileCandleArchive(asset,'1h',{
   onProgress:(done,total)=>{if(seq===serial)
    announce(short(asset)+': '+int(done)+' / '+int(total)+
     ' проверяемых H1-свечей…');}
  });
  return {asset,native:archive.native===true,
   archiveComplete:archive.complete===true,
   candles:archive.candles,error:archive.error||null};
 }
 async function start(){
  if(busy||!select.value)return;
  const asset=select.value,seq=++serial;
  clear();lock(true);
  try{
   const primary=await readRecord(asset,seq);
   if(seq!==serial||select.value!==asset)return;
   const peers=[];
   if(primary.native&&primary.archiveComplete&&!primary.error&&
    CROSS_ASSETS.includes(asset)){
    for(const other of CROSS_ASSETS){
     if(other===asset)continue;
     if(seq!==serial||select.value!==asset)return;
     peers.push(await readRecord(other,seq));
    }
   }
   if(seq!==serial||select.value!==asset)return;
   announce('Сверяем источники, хронологию, расхождения и ограничения…');
   const report=synthesizeResearch({asset,primary,peers,now:Date.now()});
   if(seq!==serial||select.value!==asset)return;
   render(report);
   announce(report.state==='DESCRIPTIVE'?
    'Готово: объяснение исторических исследований '+asset+
    '. Прогнозная точность этим не подтверждается.':
    'Нет достаточных проверенных данных для синтеза '+asset+
    ': '+report.reason,report.state!=='DESCRIPTIVE');
  }catch(error){
   if(seq===serial){
    clear();
    announce('Не удалось завершить исследование: '+
     String(error?.message||error),true);
   }
  }finally{
   if(seq===serial)lock(false);
  }
 }
 run.addEventListener('click',()=>void start());
 cancel.addEventListener('click',()=>{
  if(!busy)return;
  serial++;lock(false);clear();
  announce('Остановлено. Незавершённые исследования не показаны.',true);
 });
 select.addEventListener('change',()=>{
  serial++;lock(false);clear();
  announce('Изменён актив. Запустите исследование для нового актива.');
 });
 return {open(){}};
}
