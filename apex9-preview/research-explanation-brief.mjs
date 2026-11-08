/**
 * APEX — evidence-only mobile reading brief for Research Synthesis.
 *
 * Presentation is pure: no predictions, hypothetical consensus, confidence
 * percentages, inferred market direction or background data access. Accepts
 * only an already checked historical synthesis report; missing sources must
 * not be converted into positive claims.
 */
export const BRIEF_RULES=Object.freeze({
  provenance:'VERIFIED_CLOSED_H1_ONLY',
  forecastConfidence:false,
  defaultDetailExpanded:false,
  primarySource:'Research Regimes · проверенные 4H-окна'
});
const validText=x=>typeof x==='string'&&x.trim().length>0;
const validCount=x=>Number.isSafeInteger(x)&&x>=0;
const clean=x=>validText(x)?x:'Нет подтверждённых сведений';
const item=(title,detail,source=null)=>({title,detail,source});
const empty=(reason,asset=null)=>({
 state:'BLOCKED',asset,
 headline:item('Достоверность источника не подтверждена',
  clean(reason),'Android Room · проверка H1'),
 variance:item('Расхождения не оценивались',
  'Без полного проверенного архива сравнение запрещено.'),
 limitation:item('Нет основания для выводов',
  'Исследование не завершено; исторические проценты скрыты.'),
 counts:{observations:0,differences:0,missing:1},
 note:'Нет подтверждённого отчёта. Прогнозная точность не оценивалась.',
 rules:BRIEF_RULES
});
/**
 * Each card is explicitly historical. The lead mode distribution comes from
 * the audited original source, never from a forecast or unverified UI field.
 */
export function buildResearchBrief(report){
 if(report?.state!=='DESCRIPTIVE'||
  report.source?.archiveComplete!==true||
  report.source?.asset!==report.asset||
  !validCount(report.source.closedBars)||
  !validCount(report.source.windows)||
  report.source.windows===0||
  report.source.missingHours!==0||
  report.coverage?.regimes!=='VERIFIED'||
  report.coverage?.transitions!=='VERIFIED'||
  !Array.isArray(report.observations)||
  !Array.isArray(report.differences)||
  !Array.isArray(report.missing))
  return empty(report?.reason||'Нет полного проверенного отчёта',report?.asset||null);
 const validRecord=r=>r&&validText(r.title)&&validText(r.detail);
 if(!report.observations.length||
  !report.observations.every(validRecord)||
  !report.differences.every(validRecord)||
  !report.missing.every(validRecord))
  return empty('Не согласована структура исследовательских выводов',report.asset);
 const ranked=report.observations.find(r=>
  r.source===BRIEF_RULES.primarySource)||
  report.observations[0];
 const firstDifference=report.differences[0];
 const limitation=report.missing.find(r=>
  r.title!=='Прогнозная применимость не установлена')||
  report.missing[0]||
  item('Будущая точность не установлена',
   'Результаты описывают только завершённую историю.');
 return {
  state:'DESCRIPTIVE',asset:report.asset,
  headline:item('Что наблюдалось',ranked.detail,ranked.source),
  variance:firstDifference?item('Исторические расхождения',
   firstDifference.title+': '+firstDifference.detail,firstDifference.source):
   item('Крупные расхождения не выделены',
    'Проверенные сравнения не выделили расхождений по заданным '+
    'описательным порогам. Это не доказывает устойчивость.'),
  limitation:item('Что не подтверждено',
   limitation.title+': '+limitation.detail),
  counts:{observations:report.observations.length,
   differences:report.differences.length,
   missing:report.missing.length},
  note:'Только закрытая проверенная H1-история. '+
    'Совпадения и расхождения не доказывают прогнозную точность '+
    'или будущую доходность.',
  rules:BRIEF_RULES
 };
}
