/**
 * Clean Intelligence / Stage 9: read-only, on-demand local UI diagnostics.
 * No API calls, credentials, storage access, or automatic measurements
 * beyond actual render counts captured by the presentation governor.
 */
import {getRenderMetrics} from './clean-intelligence-render-governor.mjs';

export function auditTargets(){
 return [
  {id:'ci6-command-center',label:'Обзор'},
  {id:'ci6-stage-board',label:'Этапы сценариев'},
  {id:'ci6-radar-workspace',label:'Радар'},
  {id:'ci7-asset-desk',label:'Анализ актива'},
  {id:'ci7-sources-desk',label:'Источники'},
  {id:'ci-research-landing',label:'Исследования'},
  {id:'ci8-news-hero',label:'Новости'},
  {id:'ci8-macro-hero',label:'Макроэкономика'}
 ];
}
export function auditMountedScreens(root){
 const missing=[],mounted=[];
 for(const {id,label} of auditTargets()){
  const node=root?.getElementById?.(id);
  // A mounted stageboard nested inside a collapsed archive is NOT usable.
  const visibleStage=id!=='ci6-stage-board'||
   node?.parentElement?.id==='view-forecasts';
  const item={id,label};
  (node&&visibleStage?mounted:missing).push(item);
 }
 return {total:auditTargets().length,
  mounted:mounted.length,missing,ok:mounted.length===auditTargets().length};
}
function element(tag,klass='',value){
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(value!==undefined)n.textContent=String(value);
 return n;
}
export function initCleanIntelligenceAudit(){
 const settings=document.getElementById('ci8-settings-updates');
 if(!settings||document.getElementById('ci9-interface-audit'))return false;
 const details=element('details','ci9-interface-audit');
 details.id='ci9-interface-audit';
 details.append(element('summary','',
  'Проверка интерфейса · локальная диагностика'));
 const intro=element('p','ci9-audit-intro',
  'Показывает реальные перерисовки экранов WebView. Это не скорость API, не качество прогнозов и не проверка Android на устройстве.');
 const status=element('p','ci9-audit-status','Диагностика не запущена');
 status.setAttribute('role','status');
 const rows=element('div','ci9-audit-grid');
 const button=element('button','ci9-audit-refresh','Проверить сейчас');
 button.type='button';
 const render=()=>{
  const audit=auditMountedScreens(document);
  status.textContent='Рабочие блоки интерфейса: '+audit.mounted+
   ' из '+audit.total+
   (audit.ok?' · DOM-структура на месте':' · часть блоков не обнаружена');
  rows.replaceChildren();
  if(audit.missing.length){
   const missing=element('p','ci9-audit-missing',
    'Не обнаружены: '+audit.missing.map(x=>x.label).join(', '));
   rows.append(missing);
  }
  const metrics=getRenderMetrics().sort((a,b)=>a.screen.localeCompare(b.screen));
  if(!metrics.length)rows.append(element('p','ci9-audit-empty',
   'Управляемые экраны ещё не зарегистрированы.'));
  for(const metric of metrics){
   const row=element('div','ci9-audit-line');
   row.append(element('strong','',metric.screen),
    element('span','',
     'Обновлено '+metric.renders+
     ' · отложено '+metric.deferrals+
     ' · объединено '+metric.coalesced+
     ' · последняя перерисовка '+metric.lastMs.toFixed(1)+' мс'));
   rows.append(row);
  }
 };
 button.addEventListener('click',render);
 details.addEventListener('toggle',()=>{if(details.open)render();});
 details.append(intro,status,rows,button);
 settings.append(details);
 return true;
}
