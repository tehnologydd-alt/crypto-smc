/** APEX 4.5: prospective one-hour market-state transitions.
 * Observational association only; no prediction, order, profit or Learning mutation.
 * Predefined 1h horizon, 4/5 sign consensus and >=20 transitions for display.
 */
import {CORE_SYMBOLS} from './research-core';
import type {CoreResearchArchive,CoreResearchEntry} from './core-research';

const HOUR=3_600_000;
const MAX_LOOKBACK=14*24*HOUR;
export type HourRegime='up'|'down'|'mixed';
export type HourState={closedAt:number;observedAt:number;regime:HourRegime;up:number;down:number};
export type HourTransition={fromAt:number;toAt:number;from:HourRegime;to:HourRegime};
export type HourTransitionRow={from:HourRegime;total:number;up:number;down:number;mixed:number;persistencePct:number|null;status:'limited'|'descriptive'};
export type HourTransitionReport={
 registeredAt:number;observations:number;transitions:number;missingHours:number;
 newestAt:number|null;recent:HourTransition[];rows:HourTransitionRow[];note:string;
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const regimes:HourRegime[]=['up','down','mixed'];
export function hourState(entry:CoreResearchEntry,registeredAt:number,now=Date.now()):HourState|null{
 if(!entry||!entry.complete||entry.source!=='core-native-observations-v1'||
  !finite(registeredAt)||!finite(now)||!finite(entry.runAt)||!finite(entry.finishedAt)||
  entry.runAt<registeredAt||entry.finishedAt>now||entry.runAt>entry.finishedAt||
  !Array.isArray(entry.assets)||entry.assets.length!==CORE_SYMBOLS.length)return null;
 const seen=new Set<string>();let hour:number|null=null,up=0,down=0;
 for(const asset of entry.assets){
  if(!asset||!asset.ready||!CORE_SYMBOLS.some(x=>x===asset.symbol)||seen.has(asset.symbol)||
   !Array.isArray(asset.frames)||asset.frames.length!==3)return null;
  seen.add(asset.symbol);
  const f=asset.frames.filter(x=>x.frame==='1h');
  if(f.length!==1||!finite(f[0].closedAt)||!finite(f[0].changePct)||f[0].closedAt>entry.finishedAt)return null;
  const at=f[0].closedAt;
  if(hour===null)hour=at;
  else if(hour!==at)return null;
  if(f[0].changePct>0)up++;
  else if(f[0].changePct<0)down++;
 }
 if(hour===null||hour<registeredAt||hour>entry.runAt||hour<now-MAX_LOOKBACK)return null;
 return {closedAt:hour,observedAt:entry.finishedAt,regime:up>=4?'up':down>=4?'down':'mixed',up,down};
}
export function hourTransitions(archive:CoreResearchArchive,registeredAt:number,now=Date.now()):HourTransitionReport{
 const note='Только новые наблюдения после включения 4.5: одни и те же H1-свечи не дублируются. Сравниваются лишь соседние закрытия H1 с полной готовностью пяти активов. Перерывы и неполные снимки не заменяются расчётными значениями. Минимум 20 переходов в категории — описательный ориентир, не статистическое подтверждение. Пары соседних часов зависимы.';
 const emptyRows=()=>regimes.map(from=>({from,total:0,up:0,down:0,mixed:0,persistencePct:null,status:'limited' as const}));
 if(!archive||archive.version!==1||!finite(registeredAt)||registeredAt<0||!finite(now)||now<registeredAt)
  return {registeredAt,observations:0,transitions:0,missingHours:0,newestAt:null,recent:[],rows:emptyRows(),note};
 const points=new Map<number,HourState>();
 for(const e of [...archive.entries].sort((a,b)=>a.runAt-b.runAt)){
  const state=hourState(e,registeredAt,now);
  if(state&&!points.has(state.closedAt))points.set(state.closedAt,state);
 }
 const hours=[...points.values()].sort((a,b)=>a.closedAt-b.closedAt);
 const edges:HourTransition[]=[];let missingHours=0;
 for(let i=1;i<hours.length;i++){
  const a=hours[i-1],b=hours[i];
  const diff=b.closedAt-a.closedAt;
  if(diff>HOUR)missingHours+=Math.max(0,Math.floor(diff/HOUR)-1);
  if(diff!==HOUR||b.observedAt<=a.observedAt||b.closedAt<=a.observedAt)continue;
  edges.push({fromAt:a.closedAt,toAt:b.closedAt,from:a.regime,to:b.regime});
 }
 const rows:HourTransitionRow[]=regimes.map(from=>{
  const list=edges.filter(x=>x.from===from),total=list.length;
  const up=list.filter(x=>x.to==='up').length,down=list.filter(x=>x.to==='down').length,
    mixed=list.filter(x=>x.to==='mixed').length;
  const stayed=list.filter(x=>x.to===from).length;
  return {from,total,up,down,mixed,persistencePct:total?Math.round(1000*stayed/total)/10:null,
    status:total>=20?'descriptive':'limited'};
 });
 return {registeredAt,observations:hours.length,transitions:edges.length,missingHours,
  newestAt:hours.at(-1)?.closedAt??null,recent:edges.slice(-5).reverse(),rows,note};
}
