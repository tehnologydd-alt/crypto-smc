/** APEX 6.7: optional immutable local checkpoints of a single frozen futures DEMO protocol.
 * Snapshots show how many observations were recorded at capture time; never training weights
 * or claims about profitability. Existing snapshots are not overwritten, reset or recomputed.
 */
import type {StudyProtocol,StudyReport,StudyVenue} from './v66-forward-study';
export type StudyCheckpoint={
 id:string;capturedAt:number;protocolId:string;startedAt:number;modelVersion:'futures-study-v1';
 eligible:number;reviewable:number;priorExcluded:number;unmatchedExcluded:number;
 binance:StudyVenue;bybit:StudyVenue;
};
export type CheckpointArchive={version:1;snapshots:StudyCheckpoint[]};
export const EMPTY_CHECKPOINTS:CheckpointArchive={version:1,snapshots:[]};
export const MAX_CHECKPOINTS=64;
const nat=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
const venueOk=(v:unknown):v is StudyVenue=>{
 if(!v||typeof v!=='object')return false;
 const x=v as StudyVenue;
 return ['plans','complete','active','expired','gaps','unscored','positive','negative','flat']
  .every(k=>nat(x[k as keyof StudyVenue]))&&
  typeof x.grossUSDT==='number'&&Number.isFinite(x.grossUSDT)&&
  x.positive+x.negative+x.flat===x.complete&&
  x.complete+x.active+x.expired+x.gaps+x.unscored===x.plans;
};
const copyVenue=(x:StudyVenue):StudyVenue=>({...x});
const valid=(x:unknown,now:number):x is StudyCheckpoint=>{
 if(!x||typeof x!=='object')return false;
 const v=x as StudyCheckpoint;
 return nat(v.capturedAt)&&v.capturedAt<=now&&nat(v.startedAt)&&v.startedAt<v.capturedAt&&
  v.protocolId==='forward-demo-v1:'+v.startedAt&&v.id===v.protocolId+':'+v.capturedAt&&
  v.modelVersion==='futures-study-v1'&&nat(v.eligible)&&nat(v.reviewable)&&
  nat(v.priorExcluded)&&nat(v.unmatchedExcluded)&&venueOk(v.binance)&&venueOk(v.bybit)&&
  v.binance.plans+v.bybit.plans===v.eligible&&
  v.binance.complete+v.bybit.complete===v.reviewable;
};
export function restoreStudyCheckpoints(raw:string|null,now=Date.now()):CheckpointArchive{
 try{
  const x=JSON.parse(raw||'null') as CheckpointArchive;
  if(x?.version!==1||!Array.isArray(x.snapshots)||x.snapshots.length>MAX_CHECKPOINTS)return EMPTY_CHECKPOINTS;
  if(!x.snapshots.every(s=>valid(s,now)))return EMPTY_CHECKPOINTS;
  for(let i=1;i<x.snapshots.length;i++){
   if(x.snapshots[i].capturedAt<=x.snapshots[i-1].capturedAt)return EMPTY_CHECKPOINTS;
   if(x.snapshots[i].protocolId!==x.snapshots[0].protocolId)return EMPTY_CHECKPOINTS;
  }
  return x;
 }catch{return EMPTY_CHECKPOINTS;}
}
export function saveStudyCheckpoint(old:CheckpointArchive,p:StudyProtocol,r:StudyReport,now=Date.now()):CheckpointArchive{
 if(old.snapshots.length>=MAX_CHECKPOINTS)return old;
 if(!p||r.startedAt!==p.startedAt||r.modelVersion!==p.modelVersion||r.verdict==='NOT_STARTED'||
  !Number.isSafeInteger(now)||now<=p.startedAt||!venueOk(r.binance)||!venueOk(r.bybit)||
  !nat(r.eligible)||!nat(r.reviewable)||!nat(r.priorExcluded)||!nat(r.unmatchedExcluded))
  throw Error('Нет достоверного отчёта для контрольного снимка.');
 const last=old.snapshots.at(-1);
 if(last&&(last.protocolId!==p.id||now<=last.capturedAt))return old;
 const item:StudyCheckpoint={id:p.id+':'+now,capturedAt:now,protocolId:p.id,startedAt:p.startedAt,
  modelVersion:p.modelVersion,eligible:r.eligible,reviewable:r.reviewable,
  priorExcluded:r.priorExcluded,unmatchedExcluded:r.unmatchedExcluded,
  binance:copyVenue(r.binance),bybit:copyVenue(r.bybit)};
 if(!valid(item,now))throw Error('Недействительные показатели независимой проверки.');
 return {version:1,snapshots:[...old.snapshots,item]};
}
export function checkpointsForProtocol(archive:CheckpointArchive,p:StudyProtocol|null):StudyCheckpoint[]{
 return p?archive.snapshots.filter(s=>s.protocolId===p.id):[];
}