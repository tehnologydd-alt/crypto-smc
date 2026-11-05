/** APEX 3.6: non-retroactive market-Pulse context of NEW paper forecasts.
 * Unknown stays unknown: no reconstruction from later prices or outcomes.
 */
import type {MarketPulse} from './market-pulse';
import type {LearningLedger,LearningRecord} from './learning';

export type MarketRegime='up'|'down'|'mixed'|'quiet';
export type MarketAtEntry={
 version:1;capturedAt:number;watched:number;eligible:number;
 bullish:number;bearish:number;conflict:number;
 regime:MarketRegime;
};
export type ContextClass='with-pulse'|'against-pulse'|'mixed'|'quiet'|'missing';
export type ContextBucket={
 kind:ContextClass;title:string;total:number;waiting:number;active:number;
 tp3:number;stop:number;expired:number;cancelled:number;
 evaluated:number;tp3Share:number|null;
};
export type ContextReport={
 total:number;captured:number;missing:number;completed:number;groups:ContextBucket[];
 note:string;
};
const count=(a:LearningRecord[],s:string)=>a.filter(x=>x.status===s).length;
export function captureMarketAtEntry(pulse:MarketPulse|undefined,createdAt:number,now:number):MarketAtEntry|undefined{
 // No look-ahead: capture only on the first reconciliation immediately following creation.
 if(!pulse||!Number.isFinite(now)||!Number.isFinite(createdAt)||now<createdAt||now-createdAt>10_000)return undefined;
 if(pulse.eligible<3||pulse.watched<3||!Number.isInteger(pulse.eligible)||!Number.isInteger(pulse.watched))return undefined;
 const b=pulse.bullish,s=pulse.bearish;
 if(!Number.isInteger(b)||!Number.isInteger(s)||b<0||s<0||b+s>pulse.eligible)return undefined;
 let regime:MarketRegime='mixed';
 if(b===0&&s===0&&pulse.conflict===0)regime='quiet';
 else if(b>=2&&b>s)regime='up';
 else if(s>=2&&s>b)regime='down';
 return {version:1,capturedAt:now,watched:pulse.watched,eligible:pulse.eligible,
  bullish:b,bearish:s,conflict:pulse.conflict,regime};
}
export function classifyContext(record:LearningRecord):ContextClass{
 const m=record.marketContext;
 if(!m||m.version!==1||!m.regime)return 'missing';
 if(m.regime==='mixed')return 'mixed';
 if(m.regime==='quiet')return 'quiet';
 const same=(m.regime==='up'&&record.direction==='LONG')||(m.regime==='down'&&record.direction==='SHORT');
 return same?'with-pulse':'against-pulse';
}
const specs:{kind:ContextClass;title:string}[]=[
 {kind:'with-pulse',title:'В направлении Market Pulse'},
 {kind:'against-pulse',title:'Против Market Pulse'},
 {kind:'mixed',title:'Смешанная картина'},
 {kind:'quiet',title:'Без согласованного направления'},
 {kind:'missing',title:'Без исходного снимка'},
];
export function contextReport(ledger:LearningLedger):ContextReport{
 const records=ledger.records.filter(r=>r&&r.createdAt>=ledger.startedAt);
 const groups=specs.map(spec=>{
  const rows=records.filter(r=>classifyContext(r)===spec.kind);
  const tp3=count(rows,'TARGET'),stop=count(rows,'STOP'),evaluated=tp3+stop;
  return {kind:spec.kind,title:spec.title,total:rows.length,
   waiting:count(rows,'PENDING'),active:count(rows,'ACTIVE'),
   tp3,stop,expired:count(rows,'EXPIRED'),cancelled:count(rows,'CANCELLED'),
   evaluated,tp3Share:evaluated>=20?100*tp3/evaluated:null};
 });
 return {total:records.length,captured:records.filter(r=>r.marketContext?.version===1).length,
  missing:groups.find(x=>x.kind==='missing')?.total||0,
  completed:records.filter(r=>r.status==='TARGET'||r.status==='STOP').length,
  groups,
  note:'Группы основаны на снимке избранных монет, записанном при появлении виртуального сценария. Совпадения не доказывают причинность, прибыльность или качество прогноза на будущих данных.'};
}
