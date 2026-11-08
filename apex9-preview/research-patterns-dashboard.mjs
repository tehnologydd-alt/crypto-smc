/**
 * On-device observed pattern comparisons.
 * User initiates the audit; all data come from existing Room journal and
 * completed cached H1 candles; no remote calls, fake rates or trading UI.
 */
import {getMobileResearchForecasts,getMobileCandles} from './mobile-bridge.mjs';
import {compareCompletedResearch,PATTERN_KINDS,PATTERN_RULES} from './research-patterns.mjs';
const get=id=>document.getElementById(id);
const node=(tag,cls='',txt)=>{
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(txt!==undefined)n.textContent=String(txt);
 return n;
};
const int=x=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(x):'—';
const pct=x=>Number.isFinite(x)?
 new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(x*100)+'%':'—';
const formatDate=t=>Number.isSafeInteger(t)?
 new Date(t).toLocaleDateString('ru-RU'):'—';
const periodNames=['Ранний период','Средний период','Поздний период'];
export function initResearchPatternsDashboard(){
 const button=get('patterns-run'),status=get('patterns-status'),
  summary=get('patterns-summary'),cards=get('patterns-cards'),
  select=get('evidence-asset');
 let serial=0,busy=false;
 const announce=(s,warn=false)=>{
  status.textContent=s;
  status.classList.toggle('is-offline',warn);
 };
 const clear=()=>{
  serial++;busy=false;button.disabled=false;
  summary.replaceChildren();cards.replaceChildren();
 };
 function metric(label,value,explanation=''){
  const c=node('div','patterns-metric');
  c.append(node('span','',label),node('strong','',value));
  if(explanation)c.append(node('small','',explanation));
  summary.append(c);
 }
 function render(result){
  metric('Завершённых с фактической H1-историей',
   int(result.counts.accepted),'Неперекрывающиеся четырёхчасовые горизонты');
  metric('Не хватает сохранённых свечей',
   int(result.counts.missingCandles));
  metric('Истёк срок, нет подтверждённого итога',
   int(result.counts.dueMissing));
  metric('Противоречия / повреждения',
   int(result.counts.conflictingSource+result.counts.invalid));
  if(result.counts.overlapping){
   summary.append(node('p','patterns-note',
    'Исключено перекрывающихся горизонтов: '+
     int(result.counts.overlapping)+'.'));
  }
  const group=node('div','patterns-group');
  for(const pattern of result.patterns){
   const card=node('article','patterns-card');
   const head=node('div','patterns-card-head');
   head.append(node('strong','',pattern.label),
    node('span','',int(pattern.count)+' случаев'));
   card.append(head);
   if(result.state==='DESCRIPTIVE'){
    const periods=node('div','patterns-periods');
    for(let i=0;i<result.periods.length;i++){
     const r=pattern.periodRates[i],period=result.periods[i];
     const p=node('div','patterns-period');
     const top=node('div','patterns-period-label');
     top.append(node('span','',periodNames[i]+' · '+
      formatDate(period.firstAt)+'–'+formatDate(period.lastAt)),
      node('strong','',pct(r)));
     const track=node('div','patterns-track');
     const fill=node('span','patterns-fill');
     fill.style.width=Math.max(0,Math.min(100,r*100))+'%';
     track.append(fill);
     p.append(top,track,
      node('small','',int(pattern.periodCounts[i])+' из '+
        int(period.samples)+' наблюдений'));
     periods.append(p);
    }
    card.append(periods,node('p','patterns-variation',
     'Наблюдавшийся разброс долей между периодами: '+
     pct(pattern.spread)+
     '. Это описание уже известных результатов, не гарантия повторения.'));
   }else{
    card.append(node('p','patterns-insufficient',
     'Доли по периодам скрыты. Показано только число доступных подтверждённых случаев.'));
   }
   group.append(card);
  }
  cards.append(group);
  const caveat=node('p','patterns-note',
   'Периоды поделены хронологически по числу наблюдений, а не по календарным кварталам. '+
   'Каждый проверенный сценарий относится только к одному активу. '+
   'Статистика не доказывает причинность или точность будущих прогнозов.');
  cards.append(caveat);
 }
 async function run(){
  if(busy)return;
  const asset=select.value;
  if(!asset)return;
  const seq=++serial;busy=true;button.disabled=true;
  summary.replaceChildren();cards.replaceChildren();
  announce('Сопоставляем исходные исследования '+asset+
   ' с пятью завершёнными H1-свечами каждого сценария…');
  try{
   const [journal,candles]=await Promise.all([
    getMobileResearchForecasts(75),
    getMobileCandles(asset,'1h',500)
   ]);
   if(seq!==serial||select.value!==asset)return;
   if(!journal.native||!candles.native||journal.error||candles.error)
    throw Error(journal.error||candles.error||
     'Исследование доступно только в установленном Android APK.');
   const result=compareCompletedResearch(
    journal.forecasts||[],candles.candles||[],{
     asset,now:Date.now(),totalPublished:journal.publishedCount
    });
   if(seq!==serial||select.value!==asset)return;
   render(result);
   const messages={
    DESCRIPTIVE:'Сопоставление выполнено. Доли приведены для трёх последовательных периодов.',
    INCOMPLETE_EVIDENCE:'Выборка неполная: '+result.reason+'.',
    INSUFFICIENT:result.reason+'.',
    INVALID:'Записи не прошли проверку.'
   };
   announce((messages[result.state]||'Нет достоверных наблюдений.')+
    ' · Источник: сохранённые данные телефона. '+
    'Временные интервалы: по '+PATTERN_RULES.horizonHours+' ч.',
     result.state!=='DESCRIPTIVE');
  }catch(error){
   if(seq===serial){
    summary.replaceChildren();cards.replaceChildren();
    announce('Не удалось проверить закономерности: '+
     String(error?.message||error),true);
   }
  }finally{
   if(seq===serial){busy=false;button.disabled=false;}
  }
 }
 select.addEventListener('change',()=>{
  clear();announce('Актив изменён. Выберите запуск сравнения для нового актива.');
 });
 button.addEventListener('click',()=>void run());
 return {open(){}};
}
