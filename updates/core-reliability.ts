/** APEX 5.6: read-only interpretation of real Android WorkManager CORE health.
 * No phantom jobs, no backfilled bars, no guaranteed OS execution window.
 */
import type {CoreNativeState} from './core-background';
import type {CoreResearchReport} from './core-research';
export type NativeReliabilityState={
 supported:boolean;enabled:boolean;scheduled:boolean;workState:'ENQUEUED'|'RUNNING'|'BLOCKED'|'REQUEUED'|'MISSING'|'DISABLED'|'UNKNOWN';
 repairQueued:boolean;lastRepairAt:number;checkedAt:number;lastRunAt:number;bufferEntries:number;lastResult:string;
};
export type ReliabilityLevel='unsupported'|'off'|'checking'|'scheduled'|'recovering'|'delayed'|'attention';
export type ReliabilitySummary={
 level:ReliabilityLevel;title:string;detail:string;nextStep:string;
 ageMinutes:number|null;archiveProblem:boolean;
};
const MIN=60_000;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const nonNegative=(n:unknown)=>finite(n)&&n>=0?n:0;
export const EMPTY_RELIABILITY:NativeReliabilityState={
 supported:false,enabled:false,scheduled:false,workState:'UNKNOWN',
 repairQueued:false,lastRepairAt:0,checkedAt:0,lastRunAt:0,bufferEntries:0,lastResult:''
};
const states=new Set<NativeReliabilityState['workState']>(['ENQUEUED','RUNNING','BLOCKED','REQUEUED','MISSING','DISABLED','UNKNOWN']);
export function normalizeNativeReliability(raw:unknown):NativeReliabilityState{
 if(!raw||typeof raw!=='object')return EMPTY_RELIABILITY;
 const x=raw as Partial<NativeReliabilityState>;
 const workState=states.has(x.workState as NativeReliabilityState['workState'])?x.workState!:'UNKNOWN';
 return {supported:x.supported===true,enabled:x.enabled===true,scheduled:x.scheduled===true,
  workState,repairQueued:x.repairQueued===true,lastRepairAt:nonNegative(x.lastRepairAt),
  checkedAt:nonNegative(x.checkedAt),lastRunAt:nonNegative(x.lastRunAt),
  bufferEntries:Math.min(96,Math.trunc(nonNegative(x.bufferEntries))),
  lastResult:typeof x.lastResult==='string'?x.lastResult.slice(0,220):''};
}
/** Distinguish a missing schedule (repairable) from an enqueued job delayed by
 * OS/network. A stale H1 series cannot be made fresh by quote polling.
 */
export function coreReliabilitySummary(core:CoreNativeState,native:NativeReliabilityState,
 research:CoreResearchReport,memoryQuarantined:boolean,replicationQuarantined:boolean,now=Date.now()):ReliabilitySummary{
 const archiveProblem=memoryQuarantined||replicationQuarantined;
 const lastAt=nonNegative(native.lastRunAt)||nonNegative(core.lastRunAt);
 const ageMinutes=lastAt>0&&finite(now)&&now>=lastAt?Math.floor((now-lastAt)/MIN):null;
 const result=(level:ReliabilityLevel,title:string,detail:string,nextStep:string):ReliabilitySummary=>
  ({level,title,detail,nextStep,ageMinutes,archiveProblem});
 if(!core.supported)return result('unsupported','Фон CORE доступен на Android','Проверка расписания не поддерживается в браузере.','Откройте Android-приложение.');
 if(!core.enabled)return result('off','Исследования CORE выключены','Автоматическое восстановление не включит их без вашего выбора.','Включите CORE, если нужен фоновый сбор.');
 if(!native.supported||native.checkedAt<=0||native.checkedAt>now+MIN)
  return result('checking','Проверяем Android WorkManager','Нет подтверждённого свежего результата диагностики.','Обновите проверку фоновой задачи.');
 if(now-native.checkedAt>20*MIN)
  return result('checking','Диагностика устарела','Приложение не проверяло расписание CORE более 20 минут.','Обновите проверку после возвращения в приложение.');
 if(native.workState==='REQUEUED'||native.repairQueued)
  return result('recovering','Расписание CORE восстановлено','Android получил запрос на восстановление отсутствующей периодической задачи. Выполнение ещё не подтверждено.','Проверьте время следующего фактического запуска.');
 if(native.workState==='MISSING'||!native.scheduled)
  return result('attention','Фоновое расписание отсутствует','CORE включён, но активная периодическая задача не обнаружена. Слишком частое восстановление ограничено защитным интервалом.','Повторите диагностику и проверьте настройки Android.');
 if(native.workState==='UNKNOWN')
  return result('checking','Состояние планировщика не определено','Не удалось подтвердить состояние фоновой задачи.','Повторите диагностику при доступной системе Android.');
 if(ageMinutes===null)
  return result('scheduled','CORE запланирован','WorkManager принял периодическую задачу; фактических завершённых проверок пока нет.','Первое выполнение зависит от Android и доступности сети.');
 if(ageMinutes>=180)
  return result('delayed','Длительная задержка CORE','Последняя фактическая проверка была '+ageMinutes+' мин назад. Наличие задачи не гарантирует её своевременный запуск.','Проверьте интернет, энергосбережение Android и дату последнего запуска.');
 if(ageMinutes>=45)
  return result('delayed','CORE выполняется с задержкой','Последняя фактическая проверка была '+ageMinutes+' мин назад; задача всё ещё есть в WorkManager.','Продолжайте наблюдение; пропущенные часы не восстанавливаются расчётно.');
 if(research?.latestAt&&now-research.latestAt>72*60*MIN)
  return result('delayed','Есть свежий запуск, но старый архив','Android выполнил сбор, однако наблюдения CORE в исследовательском архиве отстают.','Проверьте сохранение CORE и пропущенные наблюдения H1.');
 return result('scheduled','Фоновый сбор запланирован','Последняя фактическая проверка была '+ageMinutes+' мин назад. WorkManager видит активную задачу.','Следите за фактическими выполнениями и полнотой снимков.');
}
