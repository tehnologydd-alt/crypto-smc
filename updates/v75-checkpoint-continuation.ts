/** APEX 7.5: append-only continuation of immutable 64-snapshot legacy archives.
 * The first segment is the untouched APEX 6.7 archive, subsequent segments
 * are saved in a DIFFERENT key. No artificial total cap; browser disk quota
 * still applies and failure must be visible (never erase earlier segments).
 */
import type {StudyProtocol,StudyReport} from './v66-forward-study';
import {MAX_CHECKPOINTS,restoreStudyCheckpoints,saveStudyCheckpoint,
 type CheckpointArchive,type StudyCheckpoint} from './v67-checkpoints';
export type ContinuationArchive={version:1;segments:CheckpointArchive[]};
export const EMPTY_CONTINUATION:ContinuationArchive={version:1,segments:[]};
export type AppendResult={legacy:CheckpointArchive;continuation:ContinuationArchive;written:'legacy'|'continuation'|null};
const max=(archive:CheckpointArchive)=>archive.snapshots.at(-1);
function validate(legacy:CheckpointArchive,cont:ContinuationArchive,p:StudyProtocol|null,now:number):boolean{
 const rows=[...legacy.snapshots,...cont.segments.flatMap(s=>s.snapshots)];
 if(p&&rows.some(s=>s.protocolId!==p.id))return false;
 for(let i=1;i<rows.length;i++)if(rows[i].capturedAt<=rows[i-1].capturedAt)return false;
 return rows.every(s=>s.capturedAt<=now);
}
export function restoreContinuation(raw:string|null,legacy:CheckpointArchive,now=Date.now()):ContinuationArchive{
 try{
  const x=JSON.parse(raw||'null') as ContinuationArchive;
  if(x?.version!==1||!Array.isArray(x.segments))return EMPTY_CONTINUATION;
  if(x.segments.some(s=>!s||!Array.isArray(s.snapshots)||s.snapshots.length===0||
   s.snapshots.length>MAX_CHECKPOINTS||restoreStudyCheckpoints(JSON.stringify(s),now).snapshots.length!==s.snapshots.length))
   return EMPTY_CONTINUATION;
  if(x.segments.some((s,i)=>i<x.segments.length-1&&s.snapshots.length!==MAX_CHECKPOINTS))
   return EMPTY_CONTINUATION;
  if(!validate(legacy,x,null,now))return EMPTY_CONTINUATION;
  return x;
 }catch{return EMPTY_CONTINUATION;}
}
export function combinedCheckpoints(legacy:CheckpointArchive,cont:ContinuationArchive,p:StudyProtocol|null):StudyCheckpoint[]{
 const all=[...legacy.snapshots,...cont.segments.flatMap(s=>s.snapshots)];
 return p?all.filter(x=>x.protocolId===p.id):[];
}
export function appendCheckpoint(legacy:CheckpointArchive,cont:ContinuationArchive,p:StudyProtocol,
 report:StudyReport,now=Date.now()):AppendResult{
 const noChange:AppendResult={legacy,continuation:cont,written:null};
 if(!p||!Number.isSafeInteger(now)||!validate(legacy,cont,p,now))return noChange;
 const last=cont.segments.at(-1)?.snapshots.at(-1)||max(legacy);
 if(last&&now<=last.capturedAt)return noChange;
 // Backward-compatible: fill legacy v6.7 archive first without touching existing images.
 if(!cont.segments.length&&legacy.snapshots.length<MAX_CHECKPOINTS){
  const next=saveStudyCheckpoint(legacy,p,report,now);
  return next===legacy?noChange:{legacy:next,continuation:cont,written:'legacy'};
 }
 const current=cont.segments.at(-1);
 const nextSegment=current&&current.snapshots.length<MAX_CHECKPOINTS?
  saveStudyCheckpoint(current,p,report,now):
  saveStudyCheckpoint({version:1,snapshots:[]},p,report,now);
 if(current&&nextSegment===current)return noChange;
 const segments=current&&current.snapshots.length<MAX_CHECKPOINTS?
  [...cont.segments.slice(0,-1),nextSegment]:[...cont.segments,nextSegment];
 return {legacy,continuation:{version:1,segments},written:'continuation'};
}
export function autoAppendCheckpoint(legacy:CheckpointArchive,cont:ContinuationArchive,
 p:StudyProtocol|null,report:StudyReport,enabled:boolean,now=Date.now()):AppendResult{
 const noChange:AppendResult={legacy,continuation:cont,written:null};
 if(!enabled||!p||report.startedAt!==p.startedAt||report.modelVersion!==p.modelVersion||
  report.reviewable<=0)return noChange;
 const last=cont.segments.at(-1)?.snapshots.at(-1)||max(legacy);
 if(last){
  const gained=report.reviewable-last.reviewable;
  if(gained<=0||(gained<5&&now-last.capturedAt<86400000))return noChange;
 }
 try{return appendCheckpoint(legacy,cont,p,report,now);}
 catch{return noChange;}
}
