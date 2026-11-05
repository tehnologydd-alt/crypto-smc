/** APEX 2.9 Guardian: factual scenario evidence, not a calibrated probability. */
import type {Scenario} from './lifecycle';
import type {RadarSignal,Timeframe} from './engine';
type FrameSignals=Partial<Record<Timeframe,RadarSignal|null>>;
export type GuardianSnapshot={price:number;lastTick:number;signals:FrameSignals;volumeRatio:number};
export type Evidence={frame:Timeframe;status:'supports'|'conflicts'|'unknown';label:string};
export type Passport={supported:number;conflicted:number;known:number;status:'attention'|'mixed'|'aligned'|'unknown';evidence:Evidence[];reason:string};
const FRAMES:Timeframe[]=['5m','1h','4h'];
export function evaluatePassport(s:Scenario,market:GuardianSnapshot|null,now=Date.now()):Passport{
 const evidence:Evidence[]=FRAMES.map(frame=>{
  const signal=market?.signals?.[frame];
  if(!signal||signal.phase!=='CONFIRMED')return {frame,status:'unknown' as const,label:'Нет свежего подтверждения'};
  const same=signal.direction===s.direction;
  return {frame,status:(same?'supports':'conflicts') as 'supports'|'conflicts',label:same?'Направления совпадают':'Противоположный сигнал'};
 });
 const supported=evidence.filter(x=>x.status==='supports').length;
 const conflicted=evidence.filter(x=>x.status==='conflicts').length;
 const known=supported+conflicted;
 const stale=!market||!market.lastTick||now-market.lastTick>180000;
 if(stale)return {supported,conflicted,known,evidence,status:'unknown',reason:'Нет свежих котировок; Guardian не подтверждает актуальность сценария.'};
 if(s.status==='PENDING'&&((s.direction==='LONG'&&market!.price<=s.stop)||(s.direction==='SHORT'&&market!.price>=s.stop)))
  return {supported,conflicted,known,evidence,status:'attention',reason:'Цена пересекла уровень отмены до входа. Проверьте сценарий; итог определяется закрытыми свечами.'};
 if(conflicted>0)return {supported,conflicted,known,evidence,status:'mixed',reason:'Противоречия между таймфреймами: сценарий требует повторной проверки.'};
 if(known===0)return {supported,conflicted,known,evidence,status:'unknown',reason:'Недостаточно свежих подтверждений для оценки.'};
 return {supported,conflicted,known,evidence,status:'aligned',reason:'Поддерживают '+supported+' из '+known+' обнаруженных подтверждений. Это согласованность, а не вероятность прибыли.'};
}
