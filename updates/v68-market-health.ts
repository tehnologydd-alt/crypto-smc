/** APEX 6.8: future-candle health from public market data only.
 * Never infer a missing candle or count a stale quote as a current observation.
 */
import type {AssistantFrame} from './demo-assistant';
import type {FutureBar} from './v64-futures-market';
export type MarketHealthStatus='NO_DATA'|'INCOMPLETE'|'GAP'|'STALE'|'READY';
export type MarketHealth={
 status:MarketHealthStatus;closedBars:number;lastClosedAt:number|null;
 ageMs:number|null;gaps:number;invalid:number;
 has36Continuous:boolean;reason:string;
};
const duration:Record<AssistantFrame,number>={'5m':300000,'1h':3600000,'4h':14400000};
const valid=(b:FutureBar,frame:AssistantFrame,now:number)=>
 b?.closed===true&&Number.isSafeInteger(b.time)&&b.time>0&&
 b.time+duration[frame]<=now&&
 [b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)&&
 Number.isFinite(b.volume)&&b.volume>=0&&
 b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high;
export function assessFuturesMarketHealth(bars:FutureBar[],frame:AssistantFrame,now=Date.now()):MarketHealth{
 const empty:MarketHealth={status:'NO_DATA',closedBars:0,lastClosedAt:null,ageMs:null,
  gaps:0,invalid:0,has36Continuous:false,reason:'Закрытые фьючерсные свечи ещё не получены.'};
 if(!Array.isArray(bars)||!bars.length)return empty;
 const sorted=[...bars].sort((a,b)=>a.time-b.time);
 const accepted:FutureBar[]=[];let invalid=0,gaps=0;
 for(const b of sorted){
  if(!valid(b,frame,now)){invalid++;continue;}
  if(accepted.length&&b.time===accepted[accepted.length-1].time){invalid++;continue;}
  accepted.push(b);
 }
 if(!accepted.length)return {...empty,invalid,reason:'Полученные свечи не прошли проверку корректности.'};
 const dur=duration[frame],last=accepted[accepted.length-1];
 const lastClosedAt=last.time+dur,ageMs=Math.max(0,now-lastClosedAt);
 const last36=accepted.slice(-36);
 for(let i=1;i<accepted.length;i++)if(accepted[i].time-accepted[i-1].time!==dur)gaps++;
 const has36Continuous=last36.length===36&&last36.every((b,i)=>i===0||b.time-last36[i-1].time===dur);
 let status:MarketHealthStatus='READY',reason='Данные свежие, последние 36 закрытых свечей непрерывны.';
 if(accepted.length<36){status='INCOMPLETE';reason='Недостаточно закрытых свечей для исходного исследования (нужно 36).';}
 else if(!has36Continuous){status='GAP';reason='В последних 36 закрытых свечах есть пропуски или разрывы.';}
 else if(ageMs>dur*1.5){status='STALE';reason='Последняя закрытая свеча устарела; сценарий не должен считаться свежим.';}
 else if(invalid){status='INCOMPLETE';reason='Получены некорректные данные: новые сценарии требуют перепроверки.';}
 return {status,closedBars:accepted.length,lastClosedAt,ageMs,gaps,invalid,has36Continuous,reason};
}