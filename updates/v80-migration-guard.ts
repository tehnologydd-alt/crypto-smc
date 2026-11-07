/** APEX 8.0 — safety gate before retiring APEX 6.7/7.5 snapshot keys.
 * If any source archive is corrupt or the new rolling key cannot be validated
 * after writing, NEVER remove the older snapshot keys.
 */
import {restoreStudyCheckpoints,type CheckpointArchive} from './v67-checkpoints';
import {restoreContinuation,type ContinuationArchive} from './v75-checkpoint-continuation';
export type RollingMigrationGate={safe:boolean;reason:string;legacyCount:number;rollingCount:number};
type Reader={getItem(key:string):string|null};
const decoded=(s:string|null):unknown=>{try{return JSON.parse(s||'null')}catch{return null}};
function expectedCount(s:string|null,key:'snapshots'|'segments'):number|null{
 if(s===null)return 0;
 const o=decoded(s);
 if(!o||typeof o!=='object'||Array.isArray(o)||(o as {version?:number}).version!==1)return null;
 const x=(o as Record<string,unknown>)[key];
 if(!Array.isArray(x))return null;
 if(key==='snapshots')return x.length;
 return x.reduce<number>((n,v)=>{
  if(!v||typeof v!=='object'||!Array.isArray((v as {snapshots?:unknown}).snapshots))return NaN;
  return n+(v as {snapshots:unknown[]}).snapshots.length;
 },0);
}
export function canRetireLegacySnapshots(storage:Reader,archive:CheckpointArchive,
 now=Date.now()):RollingMigrationGate{
 let rawRolling:string|null,rawLegacy:string|null,rawContinuation:string|null;
 try{
  rawRolling=storage.getItem('apex_v76_rolling_checkpoints');
  rawLegacy=storage.getItem('apex_v67_study_checkpoints');
  rawContinuation=storage.getItem('apex_v75_checkpoint_continuation');
 }catch{return {safe:false,reason:'Хранилище недоступно для проверки.',legacyCount:0,rollingCount:0};}
 const count=expectedCount(rawRolling,'snapshots');
 if(rawRolling===null||count===null)
  return {safe:false,reason:'Новый архив ещё не подтверждён или повреждён.',legacyCount:0,rollingCount:archive.snapshots.length};
 const current=restoreStudyCheckpoints(rawRolling,now);
 if(current.snapshots.length!==count||
   JSON.stringify(current)!==JSON.stringify(archive))
  return {safe:false,reason:'Сохранённая запись не совпадает с проверенной историей.',legacyCount:0,rollingCount:count};
 const a=expectedCount(rawLegacy,'snapshots'),b=expectedCount(rawContinuation,'segments');
 if(a===null||b===null||!Number.isSafeInteger(a+b))
  return {safe:false,reason:'Обнаружено повреждение старого архива: автоматическая очистка запрещена.',legacyCount:0,rollingCount:count};
 const legacy=restoreStudyCheckpoints(rawLegacy,now);
 const continuation=restoreContinuation(rawContinuation,legacy,now);
 if(legacy.snapshots.length!==a||continuation.segments.flatMap(s=>s.snapshots).length!==b)
  return {safe:false,reason:'Старые контрольные точки не прошли проверку.',legacyCount:a+b,rollingCount:count};
 const old=[...legacy.snapshots,...continuation.segments.flatMap(s=>s.snapshots)];
 const expected=old.slice(-64);
 if(expected.length>0&&count===0)
  return {safe:false,reason:'Старый архив заполнен, а новый пуст. Очистка запрещена.',legacyCount:old.length,rollingCount:count};
 if(expected.length>0){
  // New rolling records can grow beyond the migrated snapshot, but the last
  // pre-existing snapshot must still be present unless legitimately evicted
  // after >64 newer snapshots. Explicitly check continuity by ID overlap.
  const overlap=expected.some(s=>current.snapshots.some(r=>r.id===s.id));
  const oldestNew=current.snapshots[0]?.capturedAt??0;
  const latestOld=expected.at(-1)?.capturedAt??0;
  if(!overlap&&oldestNew<=latestOld)
   return {safe:false,reason:'Нет подтверждённого переноса старых точек.',legacyCount:old.length,rollingCount:count};
 }
 return {safe:true,reason:'Новая история подтверждена; старые ключи можно удалить.',legacyCount:old.length,rollingCount:count};
}

/** Only create the initial rolling key if all present predecessor sections
 * validate and match EXACTLY the in-memory last-64 migration result.
 */
export function canInitializeRolling(storage:Reader,archive:CheckpointArchive,
 now=Date.now()):RollingMigrationGate{
 let rawRolling:string|null,rawLegacy:string|null,rawContinuation:string|null;
 try{
  rawRolling=storage.getItem('apex_v76_rolling_checkpoints');
  rawLegacy=storage.getItem('apex_v67_study_checkpoints');
  rawContinuation=storage.getItem('apex_v75_checkpoint_continuation');
 }catch{return {safe:false,reason:'Хранилище недоступно.',legacyCount:0,rollingCount:0};}
 if(rawRolling!==null)
  return {safe:false,reason:'Новый ключ уже существует: не перезаписывать без явного подтверждения.',legacyCount:0,rollingCount:archive.snapshots.length};
 const a=expectedCount(rawLegacy,'snapshots'),b=expectedCount(rawContinuation,'segments');
 if(a===null||b===null)
  return {safe:false,reason:'Старый архив повреждён; новый пустой архив создавать нельзя.',legacyCount:0,rollingCount:archive.snapshots.length};
 const legacy=restoreStudyCheckpoints(rawLegacy,now);
 const continuation=restoreContinuation(rawContinuation,legacy,now);
 const old=[...legacy.snapshots,...continuation.segments.flatMap(s=>s.snapshots)];
 const expected=old.slice(-64);
 if(legacy.snapshots.length!==a||continuation.segments.flatMap(s=>s.snapshots).length!==b||
  JSON.stringify(expected)!==JSON.stringify(archive.snapshots))
  return {safe:false,reason:'Перенос не совпал с исходными снимками; сохраняем старые ключи.',legacyCount:a+b,rollingCount:archive.snapshots.length};
 return {safe:true,reason:'Первичная миграция проверена.',legacyCount:old.length,rollingCount:archive.snapshots.length};
}
