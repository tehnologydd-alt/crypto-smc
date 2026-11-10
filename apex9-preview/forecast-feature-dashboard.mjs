/**
 * Explicit user-initiated full-archive research audit.
 * One selected favorite per run: never auto-download all favorite archives
 * or silently promote associations to trading signals.
 */
import {getMobileAssetResearchArchive} from './mobile-bridge.mjs';
import {analyzeForecastFeatureHoldout} from './forecast-feature-holdout.mjs';

const get=id=>document.getElementById(id);
const node=(tag,klass='',value='')=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(value!==undefined)n.textContent=String(value);
 return n;
};
const pct=x=>typeof x==='number'&&Number.isFinite(x)?
 (100*x).toFixed(1)+'%':'—';
const pp=x=>typeof x==='number'&&Number.isFinite(x)?
 (x>0?'+':'')+x.toFixed(1)+' п.п.':'—';
const name={'15m':'M15','1h':'H1','4h':'H4'};
const counts=arm=>arm.tp3+' TP3 / '+arm.stop+' SL';
export function initFeatureHoldoutDashboard({getFavorites}={}){
 const select=get('feature-holdout-asset'),button=get('feature-holdout-run'),
  status=get('feature-holdout-status'),root=get('feature-holdout-report');
 if(!select||!button||!status||!root)return {refresh(){}};
 let running=false,serial=0;
 function refresh(){
  const raw=typeof getFavorites==='function'?getFavorites():[];
  const favorites=[...new Set((Array.isArray(raw)?raw:[])
   .filter(x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x)))].slice(0,10);
  const old=select.value;
  const current=[...select.options].map(x=>x.value);
  if(current.join('|')!==favorites.join('|')){
   select.replaceChildren();
   for(const asset of favorites){
    const opt=document.createElement('option');
    opt.value=asset;opt.textContent=asset;select.append(opt);
   }
   if(favorites.includes(old))select.value=old;
   root.replaceChildren();
   status.textContent=favorites.length?
    'Для проверки выберите актив и запустите аудит полного архива.':
    'Добавьте актив в избранное, чтобы исследовать его историю.';
   serial++;
  }
  button.disabled=running||!favorites.length;
 }
 function oneArm(label,arm){
  const box=node('div','forecast-feature-arm');
  box.append(node('span','',label),
   node('strong','',counts(arm)),
   node('small','',pct((arm.tp3+arm.stop)>0?
    arm.tp3/(arm.tp3+arm.stop):null)));
  return box;
 }
 function render(report){
  root.replaceChildren();
  if(!report.frames){
   root.append(node('p','forecast-quality-warning',
    report.reason||'Полная история недоступна.'));
   return;
  }
  for(const tf of ['15m','1h','4h']){
   const r=report.frames[tf],panel=node('section','forecast-feature-frame');
   panel.append(node('strong','forecast-feature-title',
    name[tf]+' · '+r.published+' опубликовано'));
   if(!r.reference||!r.holdout){
    panel.append(node('p','forecast-confluence-caveat',
     r.reason||'Недостаточно опубликованных событий'));
    root.append(panel);continue;
   }
   const metadata=node('div','forecast-feature-periods');
   for(const [title,s] of [['Опорный 60%',r.reference],
    ['Контрольный 40%',r.holdout]]){
    const sub=node('div','forecast-feature-period');
    sub.append(node('strong','',title),
     node('span','','Без пересечений: '+s.counters.nonoverlap),
     node('span','','Однозначных TP3/SL: '+s.counters.decisive),
     node('small','',
      'Другие исходы: '+s.counters.other+' · ожидание: '+
      s.counters.awaiting));
    metadata.append(sub);
   }
   panel.append(metadata,node('p','forecast-feature-reasons',
    'Исключено из опорного периода из-за пересечения: '+r.purged+
    '. Граница контроля: '+new Date(r.splitAt).toLocaleDateString('ru-RU')+'.'));
   const choices=node('div','forecast-feature-results');
   let comparable=0;
   for(const f of r.features){
    const item=node('details','forecast-feature-item');
    const summary=node('summary','',f.label);
    item.append(summary);
    if(f.state!=='DESCRIPTIVE'){
     item.append(node('p','forecast-confluence-caveat',
      'Недостаточно наблюдений: требуется не менее 12 TP3/SL '+
      'в каждой группе на обоих периодах.'));
    }else{
     comparable++;
     item.classList.add('is-descriptive');
     item.append(node('div','forecast-feature-periods',
      'Разница долей TP3 · опорный: '+pp(f.referenceGapPp)+
      ' · контрольный: '+pp(f.holdoutGapPp)));
    }
    for(const [label,s] of [['Опорный период',f.reference],
     ['Контрольный период',f.holdout]]){
     const part=node('div','forecast-feature-contrast');
     part.append(node('strong','',label),
      oneArm('Совпало',s.yes),
      oneArm('Не совпало',s.no),
      node('small','','Без измерения: '+s.unavailable));
     item.append(part);
    }
    choices.append(item);
   }
   panel.append(node('p','forecast-confluence-caveat',
    comparable?'Сопоставимых признаков: '+comparable+' из '+r.features.length+
     '. Это историческая ассоциация, не доказательство улучшения.':
     'Пока ни один признак не прошёл порог достаточности обеих выборок.'));
   panel.append(choices);root.append(panel);
  }
  root.append(node('p','forecast-confluence-caveat',
   report.note||'Никакие результаты не используются для новых прогнозов.'));
 }
 button.addEventListener('click',async()=>{
  if(running)return;
  refresh();
  const asset=select.value;
  if(!asset||!getFavorites?.().includes(asset))return;
  running=true;button.disabled=true;root.replaceChildren();
  const token=++serial;
  status.textContent='Читаем исходные записи Room '+asset+'…';
  try{
   const archive=await getMobileAssetResearchArchive(asset,{
    pageSize:75,maxRows:1500,
    onProgress:(loaded,total)=>{
     if(token===serial)status.textContent=
      'Проверяем архив '+asset+': '+loaded+' / '+total;
    }});
   if(token!==serial||!getFavorites?.().includes(asset))return;
   if(!archive.native||archive.error||archive.complete!==true){
    status.textContent='Аудит не выполнен: полный архив недоступен.';
    root.append(node('p','forecast-quality-warning',
     archive.error||'Достигнут лимит чтения 1500 записей или история неполная.'));
    return;
   }
   const report=analyzeForecastFeatureHoldout(archive.forecasts,{
    asset,complete:archive.complete,
    publishedCount:archive.publishedCount,now:Date.now()});
   if(token!==serial)return;
   status.textContent='Проверен локальный архив '+asset+' · '+
    archive.forecasts.length+' записей · '+(report.readyFrames||0)+
    ' ТФ с достаточной описательной выборкой.';
   render(report);
  }catch(error){
   if(token===serial){
    status.textContent='Аудит недоступен.';
    root.append(node('p','forecast-quality-warning',
     String(error?.message||error)));
   }
  }finally{
   running=false;refresh();
  }
 });
 select.addEventListener('change',()=>{
  serial++;root.replaceChildren();
  status.textContent='Выбран '+select.value+
   '. Нажмите «Исследовать полный архив».';
 });
 refresh();
 return {refresh};
}
