/**
 * Research Regimes: manual, phone-local retrospective 4H-H1 comparison.
 * Source: verified historical Room candles, no market network or orders.
 */
import {getMobileCandleArchive} from './mobile-bridge.mjs';
import {analyzeResearchRegimes,REGIME_TYPES,VOLATILITY_STATES} from './research-regimes.mjs';
import {analyzeRegimeStability} from './regime-stability.mjs';

const get=id=>document.getElementById(id);
const node=(tag,className='',value)=>{
 const element=document.createElement(tag);
 if(className)element.className=className;
 if(value!==undefined)element.textContent=String(value);
 return element;
};
const number=(x,d=0)=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(x):'—';
const percent=x=>Number.isFinite(x)?
 number(x*100,1)+'%':'—';
const formatDate=t=>Number.isSafeInteger(t)?
 new Date(t).toLocaleDateString('ru-RU'):'—';
const names={DIRECTIONAL:'Направленное',RANGE:'Боковик',TRANSITION:'Переход'};
const volNames=Object.fromEntries(VOLATILITY_STATES.map(x=>[x.id,x.label]));
const pp=n=>Number.isFinite(n)?(n>=0?'+':'')+number(n,1)+' п.п.':'—';

export function initResearchRegimesDashboard(){
 const run=get('regimes-run'),status=get('regimes-status'),
  summary=get('regimes-summary'),cards=get('regimes-cards'),
  select=get('evidence-asset');
 let serial=0,busy=false;
 const announce=(msg,warn=false)=>{
  status.textContent=msg;status.classList.toggle('is-offline',warn);
 };
 const clear=()=>{serial++;busy=false;run.disabled=false;
  summary.replaceChildren();cards.replaceChildren();};
 const metric=(label,value,detail='')=>{
  const c=node('div','regimes-metric');
  c.append(node('span','',label),node('strong','',value));
  if(detail)c.append(node('small','',detail));
  summary.append(c);
 };
 function render(result){
  metric('Проверенные H1-свечи',number(result.closedBars),
   'Только сохранённый исходный источник');
  metric('Неперекрывающиеся окна',number(result.overall?.samples),
   'Следующие 4 часа после классификации');
  metric('Пропущенные часы',number(result.missingHours));
  if(result.state!=='DESCRIPTIVE'){
   cards.append(node('p','regimes-warning',result.reason+
    '. Сравнительные проценты не опубликованы.'));
   return;
  }
  const head=node('div','regimes-group-head');
  head.append(node('strong','','Распределение исторических режимов'),
   node('small','',formatDate(result.firstAt)+' — '+formatDate(result.lastAt)));
  cards.append(head);
  const overview=node('div','regimes-counts');
  for(const item of REGIME_TYPES){
   const count=result.overall.regimeCounts[item.id];
   const cell=node('div','regimes-count');
   cell.append(node('strong','',number(count)),
    node('span','',item.label));
   overview.append(cell);
  }
  cards.append(overview);
  const vol=node('p','regimes-notes',
   'Изменение исторической волатильности: '+
   VOLATILITY_STATES.map(v=>volNames[v.id]+' — '+
    number(result.overall.volatilityCounts[v.id])).join(' · '));
  cards.append(vol);
  for(const item of result.modeStats){
   const section=node('section','regimes-card');
   const heading=node('div','regimes-card-head');
   heading.append(node('strong','',item.label),node('span','',
    number(item.samples)+' наблюдений'));
   section.append(heading,node('p','regimes-notes',item.description));
   if(!item.sufficient){
    section.append(node('p','regimes-warning',
     'Для долей и амплитуд нужно хотя бы 5 наблюдений этого режима '+
     'в каждом из трёх периодов. Сейчас показано только количество.'));
   }else{
    const main=node('div','regimes-top-metrics');
    main.append(node('span','',
     'Следующее 4H-закрытие внутри прежнего H1-коридора: '+
     percent(item.overall.insideShare)));
    main.append(node('span','',
     'Медиана абсолютного изменения за 4H: '+
     number(item.overall.medianAbsFourHourPct,2)+'%'));
    section.append(main);
    const compare=node('div','regimes-periods');
    for(const period of item.periods){
     const block=node('div','regimes-period');
     const row=node('div','regimes-period-title');
     row.append(node('span','',period.label+' · '+number(period.samples)),
      node('strong','',percent(period.insideShare)));
     const track=node('div','regimes-track');
     const fill=node('span','regimes-fill');
     fill.style.width=Math.max(0,Math.min(100,period.insideShare*100))+'%';
     track.append(fill);
     block.append(row,track,node('small','',
      'Медиана |4H изменения|: '+
      number(period.medianAbsFourHourPct,2)+'%'));
     compare.append(block);
    }
    section.append(compare);
   }
   cards.append(section);
  }
  const history=node('section','regimes-timeline');
  history.append(node('h5','','Последние 36 исторических окон'),
   node('p','regimes-notes',
    'Цвет обозначает режим, распознанный до следующих четырёх часов. '+
    'Это не сигналы и не доказательство устойчивости.'));
  const strip=node('div','regimes-strip');
  for(const window of result.windows.slice(-36)){
   const el=node('span','regimes-cell regime-'+window.mode.toLowerCase());
   el.title=names[window.mode]+' · '+
    formatDate(window.anchorAt)+' · '+volNames[window.volatility];
   el.setAttribute('aria-label',el.title);
   strip.append(el);
  }
  history.append(strip);
  cards.append(history);
  cards.append(node('p','regimes-notes',
   'Три периода сформированы хронологически, по числу неперекрывающихся '+
   'четырёхчасовых исходов. Обучающие окна соседних наблюдений частично '+
   'пересекаются. Исторические доли не являются вероятностями будущих событий.'));
 }

 /**
  * Only derive charts from the historical report and the second source gate.
  */
 function renderStability(report){
  const stability=analyzeRegimeStability(report);
  const section=node('section','regimes-stability');
  section.append(node('h5','','Research Regime Stability · сдвиги по периодам'));
  if(stability.state!=='DESCRIPTIVE'){
   section.append(node('p','regimes-warning',
    'Сравнение устойчивости скрыто: '+stability.reason));
   cards.append(section);return;
  }
  section.append(node('p','regimes-notes',
   'Ранний, средний и поздний периоды. Доли — исторические наблюдения, '+
   'полосы — ориентировочные 95% интервалы Уилсона.'));
  for(const regime of stability.regimes){
   const block=node('article','regimes-stability-card');
   const header=node('div','regimes-card-head');
   header.append(node('strong','',regime.label),
    node('span','','Сдвиг доли: '+pp(regime.occurrence.earlyLateChangePp)));
   block.append(header);
   const grid=node('div','regimes-stability-grid');
   for(const period of regime.occurrence.periods){
    const cell=node('div','regimes-stability-period');
    cell.append(node('span','',period.label+' · '+number(period.count)+' / '+number(period.total)),
     node('strong','',percent(period.share)),
     node('small','',percent(period.lower)+' – '+percent(period.upper)));
    grid.append(cell);
   }
   block.append(grid);
   block.append(node('p','regimes-notes',
    'Исторический разброс: '+number(regime.occurrence.largestDifferencePp,1)+
    ' п.п. · '+(regime.occurrence.commonWilsonIntersection?
     'Интервалы пересекаются; постоянство режима не доказано.':
     'Общего пересечения нет; причина различий требует проверки.')));
   if(regime.outcomes.state==='DESCRIPTIVE'){
    const outcome=node('div','regimes-stability-outcomes');
    outcome.append(node('strong','',
     'Следующие 4 часа · закрытие внутри прежнего коридора'),
     node('p','regimes-notes',
      'Ниже показаны доли подтверждённых исходов только для этого режима. '+
      'Порог: 12 случаев в каждом периоде.'));
    const outcomes=node('div','regimes-stability-grid');
    regime.outcomes.periods.forEach((period,i)=>{
     const cell=node('div','regimes-stability-period');
     cell.append(node('span','',period.label+' · '+number(period.count)+' / '+number(period.total)),
      node('strong','',percent(period.share)),
      node('small','',percent(period.lower)+' – '+percent(period.upper)),
      node('small','','Медиана |4H|: '+
       number(regime.outcomes.medianAbsFourHourPct[i],2)+'%'));
     outcomes.append(cell);
    });
    outcome.append(outcomes,node('p','regimes-notes',
     'Наблюдаемый сдвиг исходов: '+
      pp(regime.outcomes.earlyLateChangePp)+'. '+
      (regime.outcomes.commonWilsonIntersection?
       'Исторические интервалы пересекаются.':
       'Общего пересечения интервалов нет.')));
    block.append(outcome);
   }else{
    block.append(node('p','regimes-stability-muted',
     regime.outcomes.reason+'; доли исходов скрыты.'));
   }
   section.append(block);
  }
  section.append(node('h6','','Волатильность · изменение частоты режимов'));
  const volGrid=node('div','regimes-stability-volatility');
  for(const v of stability.volatility){
   const item=node('div','regimes-stability-volatility-row');
   item.append(node('strong','',v.label),
    node('span','',v.occurrence.periods.map(p=>
     p.label+': '+percent(p.share)).join(' · ')),
    node('small','','Ранний → поздний: '+pp(v.occurrence.earlyLateChangePp)));
   volGrid.append(item);
  }
  section.append(volGrid,node('p','regimes-stability-note',stability.note));
  cards.append(section);
 }
 async function runAudit(){
  if(busy||!select.value)return;
  const asset=select.value,seq=++serial;
  busy=true;run.disabled=true;summary.replaceChildren();cards.replaceChildren();
  announce('Читаем H1-историю '+asset+' для хронологической проверки режимов…');
  try{
   const archive=await getMobileCandleArchive(asset,'1h',{
    onProgress:(done,total)=>{if(seq===serial)
     announce('H1 '+asset+': '+done+' / '+total+' сохранённых свечей…');}
   });
   if(seq!==serial||select.value!==asset)return;
   if(!archive.native||archive.error||
    archive.asset!==asset||archive.interval!=='1h')
    throw Error(archive.error||'Требуется установленный Android APEX с архивом H1');
   const result=analyzeResearchRegimes(archive.candles,{
    asset,now:Date.now(),archiveComplete:archive.complete
   });
   if(seq!==serial||select.value!==asset)return;
   render(result);
   // Incomplete inputs already have a visible warning; avoid duplicating it.
   if(result.state==='DESCRIPTIVE')renderStability(result);
   announce(result.state==='DESCRIPTIVE'?
    'Исследованы '+number(result.overall.samples)+
    ' неперекрывающихся четырёхчасовых окон. Только проверяемая история '+asset+'.':
    'Нельзя показать исторические доли: '+result.reason,
    result.state!=='DESCRIPTIVE');
  }catch(error){
   if(seq===serial){
    summary.replaceChildren();cards.replaceChildren();
    announce('Не удалось проверить режимы: '+String(error?.message||error),true);
   }
  }finally{
   if(seq===serial){busy=false;run.disabled=false;}
  }
 }
 select.addEventListener('change',()=>{
  clear();announce('Выбран другой актив. Запустите сравнение заново.');
 });
 run.addEventListener('click',()=>void runAudit());
 return {open(){}};
}
