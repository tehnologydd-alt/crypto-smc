/** APEX 7.4 — optional automatic immutable checkpoint cadence, DEMO only.
 * Auto snapshots are local, require new COMPLETED/reviewable study outcomes,
 * and never overwrite previous manual checkpoints or restart the protocol.
 */
import type {StudyProtocol,StudyReport} from './v66-forward-study';
import {saveStudyCheckpoint,type CheckpointArchive} from './v67-checkpoints';
export const AUTO_CHECKPOINT_MIN_NEW=5;
export const AUTO_CHECKPOINT_INTERVAL_MS=86400000; // 24 hours when at least one new evaluation exists
export function autoCheckpointIfDue(old:CheckpointArchive,p:StudyProtocol|null,
 report:StudyReport,enabled:boolean,now=Date.now()):CheckpointArchive{
 if(!enabled||!p||!Number.isSafeInteger(now)||now<=p.startedAt||
  report.startedAt!==p.startedAt||report.modelVersion!==p.modelVersion||
  report.reviewable<=0||old.snapshots.length>=64)return old;
 const last=old.snapshots.at(-1);
 if(last&&last.protocolId!==p.id)return old;
 if(last){
  const gained=report.reviewable-last.reviewable;
  if(gained<=0)return old;
  if(gained<AUTO_CHECKPOINT_MIN_NEW&&now-last.capturedAt<AUTO_CHECKPOINT_INTERVAL_MS)return old;
 }
 try{return saveStudyCheckpoint(old,p,report,now);}
 catch{return old;}
}
