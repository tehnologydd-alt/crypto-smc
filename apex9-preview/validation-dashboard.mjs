/**
 * APEX Research Validation Lab UI — no network, no order management.
 * Observational rolling-origin replay using CLOSED H1 candles from Android Room.
 */
import {validateHistoricalRanges} from './validation-core.mjs';
import {getMobileCandles} from './mobile-bridge.mjs';
const get=id=>document.getElementById(id);
const create=(tag,cls='',text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
};
const pct=(x,d=1)=>Number.isFinite(x)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(x*100)+'%':'—';
const number=(x,d=2)=>Number.isFinite(x)
 ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(x):'—';
const formatDate=t=>Number.isSafeInteger(t)?new Date(t).toLocaleDateString('ru-RU'):'—';
const reasonFor={
 INSUFFICIENT:'Недостаточно непрерывной локальной истории для трёх последовательных периодов.',
 INVALID:'Некорректная хронология свечей. Результаты не рассчитаны.',
 GAPPED:'Найдены пропуски в сохранённых часовых свечах.',
 LOW_VARIATION:'Слишком мала историческая изменчивость для сравнения.'
};
/** 
 * Score expressed on relative logarithmic price scale. Lower means a better
 * historical width/miss tradeoff, never the success rate of future forecasts.
 */
function periodCard(fold,maxScore){
 const panel=create('article','validation-fold');
 const heading=create('div','validation-fold-head');
 heading.append(create('strong','',fold.label),
  create('small','',number(fold.comparisons,0)+' неперекрывающихся окон'));
 panel.append(heading);
 panel.append(create('p','validation-period-dates',
  formatDate(fold.firstTargetAt)+' — '+formatDate(fold.lastTargetAt)));
 const models=[
  {label:'APEX V1 · 80-й исторический процентиль',data:fold.apex,style:'apex'},
  {label:'Базовая модель · 2× медиана',data:fold.reference,style:'reference'}
 ];
 for(const model of models){
  const line=create('div','validation-model-row');
  const top=create('div','validation-model-heading');
  top.append(create('span','',model.label),
   create('strong','',number(model.data.meanIntervalScore*100,3)));
  line.append(top);
  const track=create('div','validation-score-track');
  const bar=create('span','validation-score-bar '+model.style);
  bar.style.width=Math.max(0,Math.min(100,
   model.data.meanIntervalScore/Math.max(maxScore,1e-12)*100))+'%';
  track.append(bar);line.append(track);
  line.append(create('p','validation-model-info',
   'В диапазоне: '+pct(model.data.observedCoverage)+
   ' · средняя лог. ширина: '+pct(model.data.meanLogWidth,2)));
  panel.append(line);
 }
 return panel;
}
export function initValidationDashboard(){
 let generation=0,busy=false;
 const button=get('validation-run'),status=get('validation-status'),
  results=get('validation-results');
 const message=(text,warning=false)=>{
  status.textContent=text;status.classList.toggle('is-offline',warning);
 };
 const clear=()=>{generation++;results.replaceChildren();};
 async function run(){
  if(busy)return;
  const selected=get('evidence-asset').value;
  if(!selected)return;
  const seq=++generation;busy=true;button.disabled=true;results.replaceChildren();
  message('Проверяем завершённую H1-историю '+selected+' только из Room…');
  try{
   const data=await getMobileCandles(selected,'1h',500);
   if(generation!==seq)return;
   if(!data.native||data.error)
    throw Error(data.error||'История доступна только в установленном Android APK');
   const result=validateHistoricalRanges(data.candles,{now:Date.now()});
   if(generation!==seq)return;
   if(result.state!=='DESCRIPTIVE'){
    message('Сравнение пока не готово: '+(reasonFor[result.state]||result.state),true);
    results.append(create('p','validation-hint',
     'В локальной базе '+number(result.closedBars,0)+' завершённых H1-свечей.'+
     (result.gaps?' Пропущено часов: '+number(result.gaps,0)+'.':'')+
     ' Требуется не менее 276 последовательных H1-свечей, чтобы получить 45 неперекрывающихся окон. Данные не подменяются.'));
    return;
   }
   const header=create('div','validation-summary');
   header.append(create('strong','',
    number(result.comparisons,0)+' исторических окна'),
    create('span','',number(result.closedBars,0)+' закрытых H1-свечей · 3 последовательных периода'));
   results.append(header);
   const maxScore=Math.max(...result.folds.flatMap(f=>
    [f.apex.meanIntervalScore,f.reference.meanIntervalScore]));
   const panels=create('div','validation-fold-grid');
   for(const fold of result.folds)panels.append(periodCard(fold,maxScore));
   results.append(panels);
   const foot=create('p','validation-hint',
    'Сравниваются зафиксированные правила: APEX V1 против базового диапазона 2× исторической медианы. '+
    'Баллы — интервальная оценка с учётом ширины диапазона и отклонений (меньше означает более низкую ошибку в истории). '+
    'Разная ширина диапазонов не позволяет сравнивать только долю попаданий. '+
    'Периоды не являются независимыми испытаниями и не доказывают будущую точность.');
   results.append(foot);
   message('Ретроспективное сравнение завершено для '+selected+
    ' · '+number(result.comparisons,0)+' окон · без обращения к интернету.');
  }catch(error){
   if(generation===seq){
    results.replaceChildren();
    message('Исследование недоступно: '+String(error?.message||error),true);
   }
  }finally{
   if(generation===seq){busy=false;button.disabled=false;}
  }
 }
 button.addEventListener('click',()=>void run());
 get('evidence-asset').addEventListener('change',()=>{
  clear();message('Для другого актива выполните историческое сравнение заново.');
 });
 return {clear};
}
