/**
 * APEX Clean Intelligence / Major Stage 10.
 *
 * Source center consolidation, with ZERO clones of native API controls.
 * Moves the existing 7 source articles into 6 accessible fold groups. Their
 * original IDs, forms, EventListeners, and Room/API refreshes remain intact.
 * Opening a group is purely a user interface action, not a network request.
 */
export function sourceFoldDefinitions(){
 return [
  {id:'availability',title:'Доступность источников',
   note:'Биржи · внешние API · проверенные ответы',indexes:[0,1]},
  {id:'publications',title:'Публикации выбранного актива',
   note:'Фактические упоминания и ограничения',indexes:[2]},
  {id:'limits',title:'Лимиты и личные API',
   note:'Бесплатные бюджеты · надёжность · Android Keystore',indexes:[3]},
  {id:'storage',title:'Локальное хранилище',
   note:'Room · свечи · прогнозы · WorkManager',indexes:[4]},
  {id:'updates',title:'Версия и обновления',
   note:'Установленная версия · официальный GitHub',indexes:[5]},
  {id:'research',title:'Дополнительные исследования',
   note:'Публичные кошельки · сообщества · деривативы',indexes:[6]}
 ];
}
/** Require the known seven original panels before changing anything. */
export function sourcePanelCoverage(count){
 const groups=sourceFoldDefinitions();
 const claimed=groups.flatMap(x=>x.indexes);
 const unique=[...new Set(claimed)];
 return {expected:7,actual:count,
  complete:count===7&&claimed.length===7&&unique.length===7&&
   unique.every((x,i)=>x===i)};
}
function create(tag,klass='',text){
 const el=document.createElement(tag);
 if(klass)el.className=klass;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
export function initCleanIntelligenceSourceFolds(){
 const view=document.getElementById('view-sources');
 const desk=document.getElementById('ci7-sources-desk');
 if(!view||!desk||view.querySelector('.ci10-source-fold'))return false;
 const panels=[...view.querySelectorAll(':scope > article.card.block')];
 if(!sourcePanelCoverage(panels.length).complete)return false;
 const groups=[];
 let position=desk;
 for(const definition of sourceFoldDefinitions()){
  const section=create('details','ci10-source-fold');
  section.id='ci10-source-'+definition.id;
  const label=create('summary','ci10-source-summary');
  const copy=create('span','ci10-source-summary-copy');
  copy.append(create('strong','',definition.title),
   create('small','',definition.note));
  label.append(copy,create('span','ci10-source-chevron','›'));
  section.append(label);
  const body=create('div','ci10-source-body');
  for(const index of definition.indexes){
   const panel=panels[index];
   body.append(panel); // move, never clone
  }
  section.append(body);
  position.after(section);
  position=section;
  groups.push(section);
 }
 const actions=create('div','ci10-source-fold-actions');
 const note=create('p','ci10-source-fold-note',
  'Технические разделы свернуты для удобства. Все источники, история, настройки и формы продолжают работать.');
 const control=create('button','ci10-source-expand','Показать все разделы');
 control.type='button';
 const toggle=()=>{
  const all=groups.every(x=>x.open);
  for(const group of groups)group.open=!all;
  control.textContent=all?'Показать все разделы':'Свернуть все разделы';
 };
 control.addEventListener('click',toggle);
 for(const group of groups)group.addEventListener('toggle',()=>{
  const all=groups.every(x=>x.open);
  const any=groups.some(x=>x.open);
  control.textContent=all?'Свернуть все разделы':
   any?'Показать все разделы':'Показать все разделы';
 });
 actions.append(note,control);
 desk.append(actions);
 view.dataset.apexSourcesCompact='true';
 return true;
}
