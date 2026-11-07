/** APEX 7.6 rolling checkpoints — exactly the most RECENT 64.
 * Upgrades safely from 6.7's local key and 7.5's continuation segments.
 * The independent study protocol and the actual DEMO trade ledger NEVER reset.
 * User explicitly chose to discard only the oldest snapshots on overflow.
 */
import type {StudyProtocol,StudyReport} from './v66-forward-study';
import {MAX_CHECKPOINTS,restoreStudyCheckpoints,saveStudyCheckpoint,
 type CheckpointArchive,type StudyCheckpoint} from './v67-checkpoints';
import type {ContinuationArchive} from './v75-checkpoint-continuation';
export const ROLLING_MAX=MAX_CHECKPOINTS;
const validArchive=(x:unknown,now:number):x is CheckpointArchive=>{
 if(!x||typeof x!=='object'||(x as CheckpointArchive).version!==1)return false;
 const rows=(x as CheckpointArchive).snapshots;
 return Array.isArray(rows)&&rows.length<=ROLLING_MAX&&
  restoreStudyCheckpoints(JSON.stringify(x),now).snapshots.length===rows.length;
};
export function restoreRollingArchive(raw:string|null,legacy:CheckpointArchive,
 continuation:ContinuationArchive,now=Date.now()):CheckpointArchive{
 if(raw!==null){
  try{
   const current=JSON.parse(raw) as unknown;
   if(validArchive(current,now))return current as CheckpointArchive;
  }catch{}
 }
 // Legacy and continuation have already been validated by their respective
 // 6.7 / 7.5 restorers. During migration keep only the most recent 64.
 const past=[...legacy.snapshots,...continuation.segments.flatMap(s=>s.snapshots)];
 const selected={version:1 as const,snapshots:past.slice(-ROLLING_MAX)};
 return validArchive(selected,now)?selected:{version:1,snapshots:[]};
}
export function rollingSnapshots(archive:CheckpointArchive,p:StudyProtocol|null):StudyCheckpoint[]{
 return p?archive.snapshots.filter(s=>s.protocolId===p.id):[];
}
export function addRollingCheckpoint(old:CheckpointArchive,p:StudyProtocol,
 report:StudyReport,now=Date.now()):CheckpointArchive{
 const recent=old.snapshots.at(-1);
 if(recent&&(recent.protocolId!==p.id||now<=recent.capturedAt))return old;
 const room:CheckpointArchive=old.snapshots.length>=ROLLING_MAX?
  {version:1,snapshots:old.snapshots.slice(-(ROLLING_MAX-1))}:old;
 // Original strict 6.7 snapshot integrity checks are retained.
 return saveStudyCheckpoint(room,p,report,now);
}
export function autoRollingCheckpoint(old:CheckpointArchive,p:StudyProtocol|null,
 report:StudyReport,enabled:boolean,now=Date.now()):CheckpointArchive{
 if(!enabled||!p||report.startedAt!==p.startedAt||
  report.modelVersion!==p.modelVersion||report.reviewable<=0)return old;
 const last=old.snapshots.at(-1);
 if(last){
  const gained=report.reviewable-last.reviewable;
  if(gained<=0||(gained<5&&now-last.capturedAt<86400000))return old;
 }
 try{return addRollingCheckpoint(old,p,report,now);}catch{return old;}
}
