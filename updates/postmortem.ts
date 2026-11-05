/** APEX 3.4 postmortem. Descriptive paper-scenario outcomes, never causal attribution. */
import type {LearningLedger,LearningRecord} from './learning';
export type PostmortemFactor={
 key:string;title:string;total:number;tp3:number;stop:number;
 sampleAdequate:boolean;stopShare:number|null;
};
export type PostmortemSummary={
 completed:number;tp3:number;stops:number;stopAfterTp1:number;
 waiting:number;active:number;expired:number;cancelled:number;
 unknownContext:number;factors:PostmortemFactor[];
 latest:{id:string;symbol:string;frame:string;direction:string;status:'TARGET'|'STOP';tpReached:number;hasSnapshot:boolean;createdAt:number}[];
};
type FeatureSpec={key:string;title:string;matches:(r:LearningRecord)=>boolean};
const isKnown=(v:unknown)=>v==='LONG'||v==='SHORT';
const factors:FeatureSpec[]=[
 {key:'h4-agree',title:'H4 подтверждал направление',matches:r=>r.contextCaptured&&r.initialVotes?.['4h']===r.direction},
 {key:'h4-conflict',title:'H4 противоречил направлению',matches:r=>r.contextCaptured&&isKnown(r.initialVotes?.['4h'])&&r.initialVotes['4h']!==r.direction},
 {key:'h1-agree',title:'H1 подтверждал направление',matches:r=>r.contextCaptured&&r.initialVotes?.['1h']===r.direction},
 {key:'h1-conflict',title:'H1 противоречил направлению',matches:r=>r.contextCaptured&&isKnown(r.initialVotes?.['1h'])&&r.initialVotes['1h']!==r.direction},
 {key:'volume-up',title:'Повышенный объём при создании (≥1,5×)',matches:r=>r.contextCaptured&&r.volumeRatio!==null&&Number.isFinite(r.volumeRatio)&&r.volumeRatio>=1.5},
 {key:'volume-low',title:'Низкий объём при создании (<0,8×)',matches:r=>r.contextCaptured&&r.volumeRatio!==null&&Number.isFinite(r.volumeRatio)&&r.volumeRatio>=0&&r.volumeRatio<0.8},
 {key:'no-snapshot',title:'Исходный снимок рынка недоступен',matches:r=>!r.contextCaptured},
];
export function analyzePostmortem(ledger:LearningLedger):PostmortemSummary{
 const rows=ledger.records.filter(r=>r&&Number.isFinite(r.createdAt)&&r.createdAt>=ledger.startedAt);
 const settled=rows.filter((r):r is LearningRecord=>r.status==='TARGET'||r.status==='STOP');
 const tp3=settled.filter(r=>r.status==='TARGET').length;
 const stops=settled.length-tp3;
 const outputs=factors.map(f=>{
  const matching=settled.filter(f.matches),size=matching.length;
  const hit=matching.filter(r=>r.status==='TARGET').length;
  return {key:f.key,title:f.title,total:size,tp3:hit,stop:size-hit,
   sampleAdequate:size>=15,stopShare:size>=15?100*(size-hit)/size:null};
 }).filter(x=>x.total>0).sort((a,b)=>b.total-a.total||a.title.localeCompare(b.title));
 return {completed:settled.length,tp3,stops,
  stopAfterTp1:settled.filter(r=>r.status==='STOP'&&r.tpReached>=1).length,
  waiting:rows.filter(r=>r.status==='PENDING').length,
  active:rows.filter(r=>r.status==='ACTIVE').length,
  expired:rows.filter(r=>r.status==='EXPIRED').length,
  cancelled:rows.filter(r=>r.status==='CANCELLED').length,
  unknownContext:settled.filter(r=>!r.contextCaptured).length,
  factors:outputs,latest:[...settled].sort((a,b)=>(b.closedAt||b.lastCandleTime)-(a.closedAt||a.lastCandleTime))
   .slice(0,5).map(r=>({id:r.id,symbol:r.symbol,frame:r.frame,direction:r.direction,
    status:r.status as 'TARGET'|'STOP',tpReached:r.tpReached,hasSnapshot:r.contextCaptured,createdAt:r.createdAt}))
 };
}
