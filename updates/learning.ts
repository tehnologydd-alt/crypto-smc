/** APEX Learning Engine v1. Records only NEW paper scenarios after activation.
 * Never uses future candles to populate a historical entry snapshot.
 */
import type {Scenario,ScenarioStatus} from './lifecycle';
import type {RadarSignal,Timeframe} from './engine';

export type FrameVote='LONG'|'SHORT'|'UNKNOWN';
export type LearningRecord={
 id:string;symbol:string;frame:Timeframe;direction:'LONG'|'SHORT';
 createdAt:number;entry:number;stop:number;targets:[number,number,number];
 initialVotes:Record<Timeframe,FrameVote>;contextCaptured:boolean;volumeRatio:number|null;
 status:ScenarioStatus;tpReached:number;lastCandleTime:number;closedAt?:number;reason:string;
};
export type LearningLedger={version:1;startedAt:number;records:LearningRecord[]};
export type LearningGroup={total:number;pending:number;active:number;targets:number;stops:number;cancelled:number;expired:number;tp1:number;tp2:number;evaluated:number;targetShare:number|null;interval:[number,number]|null;credible:boolean};
export type LearningOverview={total:number;legacyExcluded:boolean;overall:LearningGroup;frames:Record<Timeframe,LearningGroup>;aligned:LearningGroup;conflicted:LearningGroup;unknown:LearningGroup};

const frames:Timeframe[]=['5m','1h','4h'];
const completed=['TARGET','STOP','CANCELLED','EXPIRED'];
const statuses=new Set<ScenarioStatus>(['PENDING','ACTIVE','TARGET','STOP','CANCELLED','EXPIRED']);
export function openLearning(raw:string|null,now=Date.now()):LearningLedger{
 try{
  const parsed=JSON.parse(raw||'null') as LearningLedger;
  if(parsed?.version===1&&Number.isFinite(parsed.startedAt)&&Array.isArray(parsed.records)){
   return {version:1,startedAt:parsed.startedAt,records:parsed.records.filter(x=>x&&typeof x.id==='string'&&statuses.has(x.status)).slice(0,2000)};
  }
 }catch{}
 return {version:1,startedAt:now,records:[]};
}
type Context={price:number;lastTick:number;volumeRatio:number;signals:Partial<Record<Timeframe,RadarSignal|null>>};
const emptyVotes=():Record<Timeframe,FrameVote>=>({'5m':'UNKNOWN','1h':'UNKNOWN','4h':'UNKNOWN'});
function createRecord(s:Scenario,market:Context|undefined,now:number):LearningRecord{
 const validContext=!!market&&market.lastTick>0&&now-market.lastTick>=0&&now-market.lastTick<=180_000&&now-s.createdAt>=0&&now-s.createdAt<=120_000;
 const votes=emptyVotes();
 if(validContext&&market){
  for(const frame of frames){
   const evidence=market.signals[frame];
   if(evidence?.phase==='CONFIRMED'&&(evidence.direction==='LONG'||evidence.direction==='SHORT'))votes[frame]=evidence.direction;
  }
 }
 const sign=s.direction==='LONG'?1:-1;
 const risk=Math.abs(s.entry-s.stop);
 const t=s.targets?.length===3?s.targets:[s.entry+sign*risk,s.entry+sign*risk*1.75,s.target];
 return {id:s.id,symbol:s.symbol,frame:s.frame||'5m',direction:s.direction,
  createdAt:s.createdAt,entry:s.entry,stop:s.stop,targets:[t[0],t[1],t[2]],
  initialVotes:votes,contextCaptured:validContext,volumeRatio:validContext&&market?market.volumeRatio:null,
  status:s.status,tpReached:s.tpReached||0,lastCandleTime:s.lastCandleTime,closedAt:s.closedAt,reason:s.reason};
}
export function reconcileLearning(old:LearningLedger,scenarios:Scenario[],markets:Record<string,Context>,now=Date.now()):LearningLedger{
 const items=new Map(old.records.map(x=>[x.id,x]));
 let changed=false;
 for(const s of scenarios){
  if(!s?.id||!statuses.has(s.status)||!Number.isFinite(s.createdAt)||s.createdAt<old.startedAt||s.createdAt>now+60_000)continue;
  const prev=items.get(s.id);
  if(!prev){items.set(s.id,createRecord(s,markets[s.symbol],now));changed=true;continue;}
  if(prev.status!==s.status||prev.tpReached!==(s.tpReached||0)||prev.closedAt!==s.closedAt||prev.lastCandleTime!==s.lastCandleTime){
   items.set(s.id,{...prev,status:s.status,tpReached:s.tpReached||0,lastCandleTime:s.lastCandleTime,closedAt:s.closedAt});
   changed=true;
  }
 }
 if(!changed)return old;
 const records=[...items.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,2000);
 return {...old,records};
}
export function wilson95(success:number,total:number):[number,number]|null{
 if(!Number.isInteger(total)||total<=0||success<0||success>total)return null;
 const z=1.96,denom=1+z*z/total,p=success/total;
 const middle=(p+z*z/(2*total))/denom;
 const spread=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denom;
 return [Math.max(0,(middle-spread)*100),Math.min(100,(middle+spread)*100)];
}
export function summarize(records:LearningRecord[]):LearningGroup{
 const count=(s:ScenarioStatus)=>records.filter(x=>x.status===s).length;
 const targets=count('TARGET'),stops=count('STOP'),evaluated=targets+stops;
 return {total:records.length,pending:count('PENDING'),active:count('ACTIVE'),
  targets,stops,cancelled:count('CANCELLED'),expired:count('EXPIRED'),
  tp1:records.filter(x=>x.tpReached>=1).length,tp2:records.filter(x=>x.tpReached>=2).length,
  evaluated,targetShare:evaluated?100*targets/evaluated:null,interval:wilson95(targets,evaluated),credible:evaluated>=30};
}
function evidenceClass(x:LearningRecord):'aligned'|'conflicted'|'unknown'{
 if(!x.contextCaptured)return 'unknown';
 const known=frames.map(f=>x.initialVotes[f]).filter(v=>v!=='UNKNOWN');
 if(!known.length)return 'unknown';
 return known.some(v=>v!==x.direction)?'conflicted':'aligned';
}
export function learningOverview(ledger:LearningLedger):LearningOverview{
 const rows=ledger.records;
 return {total:rows.length,legacyExcluded:true,overall:summarize(rows),
  frames:{'5m':summarize(rows.filter(r=>r.frame==='5m')),'1h':summarize(rows.filter(r=>r.frame==='1h')),'4h':summarize(rows.filter(r=>r.frame==='4h'))},
  aligned:summarize(rows.filter(r=>evidenceClass(r)==='aligned')),
  conflicted:summarize(rows.filter(r=>evidenceClass(r)==='conflicted')),
  unknown:summarize(rows.filter(r=>evidenceClass(r)==='unknown'))};
}
