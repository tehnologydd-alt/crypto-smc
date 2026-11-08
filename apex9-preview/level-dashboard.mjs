/** Source-only price-level observations. Never infer order cancellations. */
import {studyQuotedLevels} from './level-observer.mjs';
const node=id=>document.getElementById(id);
const fmt=(n,d=2)=>Number.isFinite(n)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n):'—';
const when=n=>Number.isSafeInteger(n)
 ?new Date(n).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
function element(tag,className,text){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
export function renderLevelObserver(rows,asset){
 const analysis=studyQuotedLevels(rows,{asset,now:Date.now()});
 const target=node('level-observer-content');
 target.replaceChildren();
 if(analysis.status==='INVALID'){
  node('level-observer-status').textContent='Нет проверенного актива для уровней.';
  return;
 }
 if(!analysis.totalSnapshots){
  node('level-observer-status').textContent=
   'История отдельных уровней пока пуста. Старая история общих снимков не содержит ценовых заявок.';
  return;
 }
 node('level-observer-status').textContent=
  'Отобраны крупные видимые заявки: от 2× медианы в ограниченной выборке каждой биржи.';
 for(const venue of analysis.venues){
  const section=element('section','quoted-level-venue');
  const heading=element('div','quoted-level-heading');
  heading.append(element('strong','',venue.venue==='binance'?'Binance Spot':'Bybit Spot'),
   element('small','',venue.sampleCount?
    venue.sampleCount+' наблюд. · '+
      (venue.status==='HISTORICAL'?'только история':'ограниченный срез'):
    'нет снимков уровней'));
  section.append(heading);
  if(!venue.levels?.length){
   section.append(element('p','muted','Нет подходящих уровней в сохранённых наблюдениях.'));
  }else for(const level of venue.levels){
   const row=element('article','quoted-level-row');
   const top=element('div','quoted-level-main');
   top.append(element('span','quoted-level-side '+(level.side==='BID'?'bid':'ask'),
    level.side==='BID'?'BID · покупатели':'ASK · продавцы'),
    element('strong','',fmt(level.price,8)));
   const status=level.state==='REPEATED'?'Повторно замечен в 3+ снимках':
    level.state==='NOT_IN_LATEST_SAMPLE'?'Нет в последнем списке TOP 8':
    'Недостаточно повторных наблюдений';
   row.append(top,
    element('div','quoted-level-subtitle',status+' · '+level.seenCount+
     ' наблюд. · '+fmt(level.latestRatio,1)+'× медианы'),
    element('div','quoted-level-meta',
     'Видимая стоимость: '+fmt(level.latestNotional,2)+
     ' в котируемой валюте · последний раз '+when(level.lastSeenAt)));
   section.append(row);
  }
  target.append(section);
 }
}
