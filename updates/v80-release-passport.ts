/** APEX 8.0 — read-only release integrity passport.
 *
 * This does NOT mutate / prune records. All key names are strict allow-list,
 * never enumerate other localStorage values or leak account keys.
 * Status describes RECORD INTEGRITY, not accuracy/profitability of forecasts.
 */
import {restoreFuturesLedger} from './v64-futures-assistant';
import {restoreStudyProtocol} from './v66-forward-study';
import {restoreStudyCheckpoints} from './v67-checkpoints';
import {restoreHypothesisArchive} from './v70-hypothesis-discovery';
import {restoreShadowArchive} from './v72-shadow-lab';
import {restoreSelectedFavorites,restoreDemoVenue} from './v76-scope-demo';
import {restoreMonitorJournal} from './v77-monitor-health';
import {restoreNoticePreferences} from './v78-observation-notices';

export type PassportStatus='OK'|'EMPTY'|'DAMAGED'|'ATTENTION';
export type PassportEntry={id:string;title:string;status:PassportStatus;count:number|null;note:string};
export type ReleasePassport={version:'8.0';checkedAt:number;entries:PassportEntry[];
 valid:number;empty:number;damaged:number;attention:number;
 readiness:'CHECKED'|'NEEDS_ATTENTION';
 statement:string};
type Reader={getItem(key:string):string|null};
const safeObj=(x:unknown):x is Record<string,unknown>=>
 typeof x==='object'&&x!==null&&!Array.isArray(x);
const readJSON=(s:string|null):unknown=>{
 if(s===null)return null;
 try{return JSON.parse(s);}catch{return undefined;}
};
function entry(id:string,title:string,status:PassportStatus,count:number|null,note:string):PassportEntry{
 return {id,title,status,count,note};
}
const error=(id:string,title:string,note='Формат данных не прошёл проверку. Исходные записи не изменяются.')=>
 entry(id,title,'DAMAGED',null,note);
function sizeOK(s:string|null,limit=5_000_000):boolean{
 return s===null||s.length<=limit;
}
function checkList(s:string|null,key:'tickets'|'snapshots'|'items',title:string,id:string,
 check:(raw:string)=>number,limit:number):PassportEntry{
 if(s===null)return entry(id,title,'EMPTY',0,'Записей пока нет.');
 if(!sizeOK(s))return error(id,title,'Необычно большой архив; автоматическая очистка запрещена.');
 const o=readJSON(s);
 if(!safeObj(o)||o.version!==1||!Array.isArray(o[key])||o[key].length>limit)
  return error(id,title);
 const n=check(s);
 if(n!==o[key].length)return error(id,title,'Часть записей не прошла валидацию; архив оставлен без изменений.');
 return entry(id,title,'OK',n,n===0?'Пустой, но корректный формат.':'Записи соответствуют сохранённому формату.');
}
export function auditReleaseStorage(storage:Reader,now=Date.now()):ReleasePassport{
 const get=(k:string)=>{try{return storage.getItem(k);}catch{return '__storage_read_error__';}};
 const entries:PassportEntry[]=[];
 const ledger=get('apex_v64_futures_demo');
 entries.push(checkList(ledger,'tickets','Журнал виртуальных Futures DEMO','ledger',
  s=>restoreFuturesLedger(s,now).tickets.length,80));
 const protocolRaw=get('apex_v66_forward_protocol');
 const protocol=restoreStudyProtocol(protocolRaw,now);
 entries.push(protocolRaw===null?
  entry('protocol','Независимый протокол','EMPTY',0,'Новый протокол ещё не запущен.'):
  protocol?
   entry('protocol','Независимый протокол','OK',1,'Зафиксирована дата начала, без пересоздания или переобучения.'):
   error('protocol','Независимый протокол','Данные протокола не читаются; автоматический сброс запрещён.'));
 const rolling=get('apex_v76_rolling_checkpoints');
 entries.push(checkList(rolling,'snapshots','Последние 64 контрольные точки','checkpoints',
  s=>restoreStudyCheckpoints(s,now).snapshots.length,64));
 const frozen=get('apex_v70_hypothesis_archive');
 entries.push(checkList(frozen,'items','Замороженные гипотезы','hypotheses',
  s=>restoreHypothesisArchive(s,now).items.length,16));
 const shadow=get('apex_v72_shadow_archive');
 entries.push(checkList(shadow,'items','Эксперименты SHADOW','shadow',
  s=>restoreShadowArchive(s,now).items.length,8));
 const fav=get('apex_v76_selected_favorites'),favObj=readJSON(fav);
 entries.push(fav===null?
  entry('favorites','Выбор до четырёх пар','EMPTY',0,'Используется выбор по умолчанию из избранного Радара.'):
  Array.isArray(favObj)&&favObj.length<=4&&
   favObj.every(x=>typeof x==='string'&&/^[A-Z0-9]{2,20}USDT$/.test(x))&&
   new Set(favObj).size===favObj.length?
    entry('favorites','Выбор до четырёх пар','OK',favObj.length,'Набор исследуемых пар сохранён.'):
    error('favorites','Выбор до четырёх пар'));
 const venues=get('apex_v76_demo_venues');
 entries.push(venues===null?
  entry('venues','Выбор бирж','EMPTY',0,'Выбор берётся из прежних настроек.'):
  ['binance','bybit','both'].includes(venues)&&restoreDemoVenue(venues,'binance')===venues?
    entry('venues','Выбор бирж','OK',null,venues==='both'?'Binance и Bybit независимо.':'Одна выбранная биржа.'):
    error('venues','Выбор бирж'));
 const health=get('apex_v77_observation_health');
 if(health===null)entries.push(entry('health','Журнал качества данных','EMPTY',0,'Новых записей о сбоях пока нет.'));
 else {
  const parsed=readJSON(health);
  const restored=sizeOK(health,600000)?restoreMonitorJournal(health,now):null;
  entries.push(safeObj(parsed)&&parsed.version===1&&Array.isArray(parsed.events)&&restored&&
   restored.events.length===parsed.events.length&&safeObj(parsed.feeds)&&
   Object.keys(restored.feeds).length===Object.keys(parsed.feeds).length?
    entry('health','Журнал качества данных','OK',restored.events.length,'История реальных перерывов читается.'):
    error('health','Журнал качества данных'));
 }
 const alerts=get('apex_v78_monitor_notice_settings');
 if(alerts===null)entries.push(entry('alerts','Настройки уведомлений','EMPTY',0,'Необязательные уведомления по умолчанию выключены.'));
 else {
  const raw=readJSON(alerts),parsed=restoreNoticePreferences(alerts,now);
  entries.push(safeObj(raw)&&raw.version===1&&typeof raw.enabled==='boolean'&&
   Array.isArray(raw.sent)&&raw.sent.length===parsed.sent.length&&raw.enabled===parsed.enabled?
    entry('alerts','Настройки уведомлений','OK',parsed.sent.length,'Настройки согласия на уведомления сохранены.'):
    error('alerts','Настройки уведомлений'));
 }
 const oldKey=get('apex_v67_study_checkpoints'),segKey=get('apex_v75_checkpoint_continuation');
 const legacyPresent=oldKey!==null||segKey!==null;
 const hasRolling=rolling!==null&&entries.find(x=>x.id==='checkpoints')?.status==='OK';
 if(legacyPresent&&!hasRolling){
  entries.push(entry('migration','Перенос старых снимков','ATTENTION',null,
   'Есть старые ключи, но новые 64 снимка не подтверждены. Не удаляй данные и сохрани диагностический отчёт.'));
 }else if(legacyPresent){
  entries.push(entry('migration','Перенос старых снимков','ATTENTION',null,
   'Старые ключи ещё присутствуют. Их можно очищать только после проверки новой записи.'));
 }else entries.push(entry('migration','Перенос старых снимков','OK',null,'Дополнительных старых архивов не обнаружено.'));
 if(protocol&&rolling!==null&&hasRolling){
  const snapshots=restoreStudyCheckpoints(rolling,now).snapshots;
  if(snapshots.some(c=>c.protocolId!==protocol.id))
   entries.push(entry('coherence','Протокол и снимки','ATTENTION',snapshots.length,
    'Снимки относятся к другому протоколу. Они не засчитываются как текущая проверка.'));
  else entries.push(entry('coherence','Протокол и снимки','OK',snapshots.length,
   'Снимки относятся к текущему протоколу.'));
 }
 const valid=entries.filter(e=>e.status==='OK').length;
 const empty=entries.filter(e=>e.status==='EMPTY').length;
 const damaged=entries.filter(e=>e.status==='DAMAGED').length;
 const attention=entries.filter(e=>e.status==='ATTENTION').length;
 return {version:'8.0',checkedAt:now,entries,valid,empty,damaged,attention,
  readiness:damaged+attention>0?'NEEDS_ATTENTION':'CHECKED',
  statement:'Проверены только форматы локальных исследовательских данных. Это не оценка точности прогнозов, доходности или полной исправности устройства.'};
}
/** Diagnostic text contains counts/status only. Never embeds raw order records,
 * symbol choices, account data, API credentials or stored file contents.
 */
export function formatReleasePassport(p:ReleasePassport):string{
 return 'APEX 8.0 · паспорт целостности · '+new Date(p.checkedAt).toISOString()+'\n'+
  'Проверено: '+p.entries.length+'; ошибок: '+p.damaged+'; внимание: '+p.attention+'\n'+
  p.entries.map(e=>e.title+': '+e.status+(e.count===null?'':' ('+e.count+')')+' — '+e.note).join('\n')+
  '\n'+p.statement;
}
