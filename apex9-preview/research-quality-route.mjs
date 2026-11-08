/**
 * Explainability navigation: only status of completed on-device historical audits.
 * Not a forecast-confidence or accuracy score; never infer data from a ticker.
 */
const validAsset=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
export const EXPLAIN_ROUTE=Object.freeze({
 view:'quality',targetId:'synthesis-panel',returnView:'asset'
});
export function planAssetExplanation(asset,available){
 if(!validAsset(asset)||!Array.isArray(available)||
  !available.includes(asset))return {state:'UNAVAILABLE',reason:
   'Выбранный актив отсутствует в локальном списке исследования'};
 return {state:'READY',asset,...EXPLAIN_ROUTE};
}
export function describeResearchQuality(report,asset){
 const idle={state:'NOT_RUN',
  label:'Историческая проверка не запускалась',
  detail:'Откройте объяснение, чтобы проверить закрытый H1-архив на устройстве.'};
 if(!validAsset(asset)||!report||report.asset!==asset)return idle;
 if(report.state!=='DESCRIPTIVE'||report.source?.archiveComplete!==true||
  report.source?.asset!==asset||report.source?.missingHours!==0)
  return {state:'BLOCKED',label:'Историческая проверка недоступна',
   detail:report.reason||'Не подтверждена полнота H1-истории'};
 const holds=report.coverage?.holdout==='DESCRIPTIVE',
 cross=['DESCRIPTIVE','NOT_APPLICABLE'].includes(report.coverage?.crossAsset);
 const checked=holds&&cross;
 return {state:checked?'CHECKED':'PARTIAL',
  label:checked?'Архив H1 проверен · исторический отчёт готов':
   'Архив H1 проверен · отдельные сравнения недоступны',
  detail:report.source.closedBars+' завершённых H1-свечей · '+
   report.source.windows+' исторических 4H-окон. '+
   'Это не оценка прогнозной точности.'};
}
