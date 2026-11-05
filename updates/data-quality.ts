/** APEX 3.3: feed/candle integrity diagnostics. No automatic changes to signals. */
import type {Candle,Timeframe} from './engine';
// Mirrors the three monitored frame lengths. Pure diagnostics intentionally do not change engine state.
const FRAME_DURATION:Record<Timeframe,number>={'5m':300_000,'1h':3_600_000,'4h':14_400_000};

export type FrameHealthStatus='ok'|'missing'|'stale'|'invalid'|'gaps';
export type QualityLevel='ok'|'warning'|'bad'|'loading';
export interface FrameHealth{
 frame:Timeframe;status:FrameHealthStatus;closedCount:number;
 latestCloseTime:number|null;ageMs:number|null;
 gapCount:number;duplicateCount:number;invalidCount:number;
 label:string;
}
export interface DataHealth{
 symbol:string;level:QualityLevel;label:string;
 tickAgeMs:number|null;tickFresh:boolean;problemCount:number;
 frames:Record<Timeframe,FrameHealth>;notes:string[];
}
export interface QualityInput{
 symbol:string;price:number;lastTick:number;error?:string;
 candles:Candle[];frames:Partial<Record<Timeframe,Candle[]>>;
}
const FRAMES:Timeframe[]=['5m','1h','4h'];
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function ageLabel(ms:number|null):string{
 if(ms===null||!finite(ms))return 'неизвестно';
 if(ms<0)return 'время устройства расходится с данными';
 if(ms<60_000)return Math.floor(ms/1000)+'с';
 if(ms<3_600_000)return Math.floor(ms/60_000)+'м';
 return Math.floor(ms/3_600_000)+'ч '+Math.floor(ms%3_600_000/60_000)+'м';
}
export function inspectFrame(frame:Timeframe,raw:Candle[]|undefined,now=Date.now()):FrameHealth{
 const duration=FRAME_DURATION[frame];
 const data=Array.isArray(raw)?raw.slice(-160):[];
 const candidates=data.filter(c=>c&&c.closed!==false);
 let invalidCount=0;const valid:Candle[]=[];
 for(const c of candidates){
  if(!finite(c.time)||c.time<=0||
   ![c.open,c.high,c.low,c.close].every(v=>finite(v)&&v>0)||
   !finite(c.volume)||c.volume<0||
   c.high<Math.max(c.open,c.close,c.low)||
   c.low>Math.min(c.open,c.close,c.high)||
   c.time>now+60_000||c.time+duration>now+60_000){
   invalidCount++;continue;
  }
  valid.push(c);
 }
 valid.sort((a,b)=>a.time-b.time);
 let duplicateCount=0,gapCount=0;
 const tail=valid.slice(-40);
 for(let i=1;i<tail.length;i++){
  const diff=tail[i].time-tail[i-1].time;
  if(diff===0)duplicateCount++;
  if(diff>duration*1.5)gapCount++;
 }
 const latest=valid.length?valid[valid.length-1]:null;
 const latestCloseTime=latest?latest.time+duration:null;
 const ageMs=latestCloseTime===null?null:Math.max(-1,now-latestCloseTime);
 let status:FrameHealthStatus='ok';
 if(invalidCount)status='invalid';
 else if(valid.length<25)status='missing';
 else if(ageMs!==null&&(ageMs<0||ageMs>duration+Math.max(120_000,duration*0.25)))status='stale';
 else if(gapCount||duplicateCount)status='gaps';
 const label:Record<FrameHealthStatus,string>={
  ok:'Свечи актуальны',missing:'Недостаточно закрытых свечей',
  stale:'Последняя свеча устарела',invalid:'Некорректные свечи',
  gaps:'Есть пропуски или дубли свечей'
 };
 return {frame,status,closedCount:valid.length,latestCloseTime,ageMs,gapCount,duplicateCount,invalidCount,label:label[status]};
}
export function inspectDataHealth(asset:QualityInput,now=Date.now()):DataHealth{
 const frames={
  '5m':inspectFrame('5m',asset.candles,now),
  '1h':inspectFrame('1h',asset.frames?.['1h'],now),
  '4h':inspectFrame('4h',asset.frames?.['4h'],now),
 };
 const tickAgeMs=finite(asset.lastTick)&&asset.lastTick>0?now-asset.lastTick:null;
 const tickFresh=tickAgeMs!==null&&tickAgeMs>=0&&tickAgeMs<=120_000;
 const notes:string[]=[];
 if(asset.error)notes.push('Ошибка источника: '+asset.error.slice(0,120));
 if(tickAgeMs===null)notes.push('Живая котировка ещё не поступила');
 else if(tickAgeMs<0)notes.push('Время котировки впереди времени телефона');
 else if(!tickFresh)notes.push('Последняя живая котировка '+ageLabel(tickAgeMs)+' назад');
 for(const f of FRAMES){
  const issue=frames[f];
  if(issue.status!=='ok'){
   notes.push(f.toUpperCase()+': '+issue.label.toLowerCase()+
     (issue.status==='stale'?', возраст '+ageLabel(issue.ageMs):'')+
     (issue.status==='gaps'?' ('+issue.gapCount+' пропусков, '+issue.duplicateCount+' дублей)':''));
  }
 }
 const hasNoData=FRAMES.every(f=>frames[f].closedCount===0)&&tickAgeMs===null;
 let level:QualityLevel='ok';
 if(hasNoData&&!asset.error)level='loading';
 else if(asset.error||!tickFresh||FRAMES.some(f=>['invalid','stale'].includes(frames[f].status)))level='bad';
 else if(FRAMES.some(f=>frames[f].status!=='ok'))level='warning';
 const label:Record<QualityLevel,string>={
  ok:'Данные в порядке',warning:'Данные неполные',bad:'Проверьте источник',loading:'Загрузка данных'
 };
 return {symbol:asset.symbol,level,label:label[level],tickAgeMs,tickFresh,
  problemCount:notes.length,frames,notes};
}
