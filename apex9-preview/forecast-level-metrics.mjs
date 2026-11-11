/**
 * Presentation-only calculations for immutable APEX research levels.
 * They describe hypothetical price distances, not account P/L, fees,
 * leverage, execution, portfolio risk, profit or trading instructions.
 */
const n=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const good=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function forecastLevelMetrics(plan){
 const empty=(reason)=>({state:'INVALID',reason});
 if(!plan||!['UP','DOWN'].includes(plan.side)||
  !['entry','sl','tp1','tp2','tp3'].every(k=>n(plan[k])))
  return empty('Недоступны неизменённые контрольные уровни.');
 const {entry,sl,tp1,tp2,tp3,side}=plan;
 const up=side==='UP',risk=Math.abs(sl-entry);
 if(!(risk>0)||!(up?
  sl<entry&&entry<tp1&&tp1<tp2&&tp2<tp3:
  tp3<tp2&&tp2<tp1&&tp1<entry&&entry<sl))
  return empty('Порядок входа, стопа и целей нарушен.');
 const target=(price)=>({
  price,
  deltaPct:(price-entry)/entry*100,
  rMultiple:Math.abs(price-entry)/risk
 });
 const slMetric={
  price:sl,deltaPct:(sl-entry)/entry*100,rMultiple:-1
 };
 const targets={tp1:target(tp1),tp2:target(tp2),tp3:target(tp3)};
 if(!good(slMetric.rMultiple+1)||Object.values(targets).some(v=>
  !good(v.rMultiple)||!Number.isFinite(v.deltaPct)))
  return empty('Некорректный расчёт процентного движения.');
 return {state:'VALID',side,entry,riskAbs:risk,
  riskPct:risk/entry*100,sl:slMetric,targets,
  note:'Процент — изменение цены от уровня входа. R:R — отношение '+
   'расстояния до цели к расстоянию до SL (риск 1R). '+
   'Это условная геометрия уровней, не результат сделки: '+
   'не учтены комиссии, проскальзывание или размер позиции.'};
}
export function displayPriceMove(percent){
 if(typeof percent!=='number'||!Number.isFinite(percent))return '—';
 const digits=Math.abs(percent)<.01&&percent!==0?4:2;
 const rounded=Number(percent.toFixed(digits));
 const mark=rounded>0?'+':rounded<0?'−':'';
 return mark+Math.abs(rounded).toFixed(digits)+'%';
}
export function displayRiskReward(multiple){
 if(!n(multiple))return '—';
 return 'R:R 1:'+multiple.toFixed(2).replace(/\.?0+$/,'');
}
const OUTCOMES={
 TP3:{tone:'tp3',label:'Цель TP3 достигнута',symbol:'●'},
 STOP:{tone:'stop',label:'Стоп достигнут',symbol:'●'},
 AMBIGUOUS:{tone:'unknown',label:'Порядок неизвестен',symbol:'●'},
 NOT_ENTERED:{tone:'unknown',label:'Вход не подтверждён',symbol:'●'},
 HORIZON:{tone:'unknown',label:'Срок проверки истёк',symbol:'●'}
};
/** Only the verified Room chronology may colour terminal results as TP or SL. */
export function completedResearchPresentation({
 outcome,verified=false,entered=false,touched=[],frame='H1'
}={}){
 const names=new Set(['TP1','TP2','TP3']);
 const found=Array.isArray(touched)?
  [...new Set(touched.filter(x=>names.has(x)))]:[];
 const isVerified=verified&&Object.hasOwn(OUTCOMES,outcome);
 const complete=isVerified?OUTCOMES[outcome]:{
  tone:'unknown',label:'Итог требует проверки',symbol:'●'
 };
 const count=['TP1','TP2','TP3'].filter(x=>found.includes(x)).length;
 return {
  ...complete,verified:isVerified,outcome:isVerified?outcome:'UNVERIFIED',
  frame,entered:Boolean(entered&&isVerified),
  touched:isVerified?['TP1','TP2','TP3'].filter(k=>found.includes(k)):[],
  touchedCount:isVerified?count:0,
  stages:[
   {label:'Создан',done:true},
   {label:'Вход',done:Boolean(entered&&isVerified)},
   {label:'Итог',done:isVerified}
  ],
  progressLabel:isVerified?
   (count?'Отмечено TP'+count+' из 3':'Цели TP пока не отмечены'):
   'Результат не подтверждён полной хронологией Room'
 };
}
const element=(tag,cls,text)=>{
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(text!==undefined)x.textContent=String(text);
 return x;
};
/**
 * On both ALL and MARKED journal cards: a single concise outcome header,
 * 3 milestone tiles, TP progress, and a closed details element below.
 */
export function renderCompletedResearchPanel(plan,details){
 const view=completedResearchPresentation(details);
 const root=element('section','forecast-completed-panel tone-'+view.tone);
 root.setAttribute('aria-label','Проверенные этапы и итог исследования');
 const stages=element('div','forecast-completed-stages');
 for(const stage of view.stages){
  const item=element('span',
   'forecast-completed-stage'+(stage.done?' is-verified':''),
   (stage.done?'✓ ':'· ')+stage.label);
  stages.append(item);
 }
 root.append(stages);
 const progress=element('div','forecast-completed-progress');
 progress.append(element('span','forecast-completed-progress-label',
  view.progressLabel));
 const bars=element('div','forecast-completed-tp-track');
 for(const key of ['TP1','TP2','TP3']){
  const observed=view.touched.includes(key);
  const part=element('span','forecast-completed-tp'+(observed?' is-hit':''));
  part.setAttribute('aria-label',key+(observed?' достигнут':' не подтверждён'));
  bars.append(part);
 }
 progress.append(bars);root.append(progress);
 root.append(element('small','forecast-completed-source',
  view.verified?
  'Результат из подтверждённого журнала Room · '+view.frame+
  ' · не исполненная сделка':
  'Журнал Room неполон или не прошёл проверку · цвет исхода не присваивается'));
 return root;
}
