/**
 * APEX Research Stability: descriptive uncertainty only.
 * Source: already completed and evidence-gated Research Patterns.
 */
const Z=1.959963984540054;
export const STABILITY_NOTE='Интервалы Уилсона (ориентир 95%) используют условную независимость наблюдений. Исторические рыночные события могут зависеть друг от друга. Перекрытие интервалов не доказывает стабильность, а отсутствие пересечения не означает прогностической силы.';
export function wilsonShare(count,total){
 if(!Number.isSafeInteger(count)||!Number.isSafeInteger(total)||
  total<1||count<0||count>total)return null;
 const p=count/total,z2=Z*Z,denom=1+z2/total;
 const center=(p+z2/(2*total))/denom;
 const margin=Z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/denom;
 return {share:p,lower:Math.max(0,center-margin),
  upper:Math.min(1,center+margin),count,total};
}
const hidden=reason=>({state:'HIDDEN',reason:reason||'Исходные доли не подтверждены',
 patterns:[],periods:[],note:'Неполная история: интервалы скрыты'});
export function analyzeResearchStability(comparison){
 if(comparison?.state!=='DESCRIPTIVE')
  return hidden(comparison?.reason);
 const folds=comparison.periods,items=comparison.patterns;
 if(!Array.isArray(folds)||folds.length!==3||
  !Array.isArray(items)||items.length!==3||
  items.some(k=>typeof k.id!=='string'||typeof k.label!=='string')||
  new Set(items.map(k=>k.id)).size!==3)
  return hidden('Повреждённая структура сравнения');
 const names=['Ранний','Средний','Поздний'];
 for(const f of folds){
  if(!Number.isSafeInteger(f?.samples)||f.samples<12||
   !f.counts||typeof f.counts!=='object')
   return hidden('Неполный или повреждённый период');
  const counts=items.map(k=>f.counts[k.id]);
  if(counts.some(v=>!Number.isSafeInteger(v)||v<0)||
   counts.reduce((s,v)=>s+v,0)!==f.samples)
   return hidden('Число категорий не совпадает с размером выборки');
 }
 const patterns=items.map(k=>{
  const periods=folds.map((f,i)=>({
   name:names[i],...wilsonShare(f.counts[k.id],f.samples)
  }));
  const rates=periods.map(p=>p.share);
  return {
   id:k.id,label:k.label,periods,
   earlyLateChange:rates[2]-rates[0],
   largestHistoricalDifference:Math.max(...rates)-Math.min(...rates),
   commonWilsonIntersection:Math.max(...periods.map(p=>p.lower))<=
    Math.min(...periods.map(p=>p.upper))
  };
 });
 return {state:'DESCRIPTIVE',reason:null,patterns,
  periods:folds.map((f,i)=>({name:names[i],samples:f.samples})),
  note:STABILITY_NOTE};
}
