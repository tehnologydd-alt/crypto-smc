/** APEX 5.3: local long-lived, append-only research memory, separate from active 14d CORE.
 * Preserve observed facts, not predictions. Missing hours/days are never synthesized.
 * File checksum is for accidental corruption, NOT authentication.
 */
import type {CoreResearchArchive,CoreResearchEntry} from './core-research';
import type {HourTransition} from './hour-transitions';
import type {ContextAuditLedger,ContextEvent} from './context-audit';
import type {ResearchReviewArchive,ResearchReview} from './research-reports';
import {openResearchReviews} from './research-reports';

const HOUR=3_600_000,DAY=24*HOUR;
const MAX_DAYS=730,MAX_H1=7000,MAX_H4=3500,MAX_REPORTS=128,MAX_FILE=3_600_000;
const KIND='apex-core-memory-v1' as const;
const regimes=['up','down','mixed'] as const;
export type SavedH1={fromAt:number;toAt:number;from:'up'|'down'|'mixed';to:'up'|'down'|'mixed'};
export type SavedH4={fromAt:number;toAt:number;to:'up'|'down'|'mixed';h4:'up'|'down'|'mixed';h4ClosedAt:number};
export type SavedDay={day:string;firstAt:number;lastAt:number;checks:number;complete:number;partial:number};
export type CoreMemory={version:1;registeredAt:number;days:SavedDay[];h1:SavedH1[];h4:SavedH4[];reports:ResearchReview[]};
export type CoreMemoryInputs={
 core:CoreResearchArchive;transitions:HourTransition[];context:ContextAuditLedger;
 reviews:ResearchReviewArchive;
};
export type CoreMemoryEnvelope={kind:typeof KIND;version:1;exportedAt:number;payload:CoreMemory;checksum:string};
export type CoreMemoryStats={days:number;transitions:number;contexts:number;reports:number;
 firstAt:number|null;lastAt:number|null;nearCapacity:boolean;limits:{days:number;h1:number;h4:number;reports:number}};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const reg=(x:unknown):x is SavedH1['from']=>regimes.includes(x as SavedH1['from']);
const isoDay=(t:number)=>new Date(t).toISOString().slice(0,10);
const midnight=(day:string)=>Date.parse(day+'T00:00:00.000Z');
const nextUTC=(t:number)=>Math.ceil(t/DAY)*DAY;
const validH1=(e:unknown,start:number,now:number):e is SavedH1=>{
 if(!e||typeof e!=='object')return false;
 const x=e as Partial<SavedH1>;
 return finite(x.fromAt)&&finite(x.toAt)&&x.fromAt>start&&
  x.toAt===x.fromAt+HOUR&&x.toAt<=now&&reg(x.from)&&reg(x.to);
};
const validH4=(e:unknown,start:number,now:number):e is SavedH4=>{
 if(!e||typeof e!=='object')return false;
 const x=e as Partial<SavedH4>;
 return finite(x.fromAt)&&finite(x.toAt)&&x.fromAt>start&&
  x.toAt===x.fromAt+HOUR&&x.toAt<=now&&reg(x.to)&&reg(x.h4)&&
  finite(x.h4ClosedAt)&&x.h4ClosedAt>0&&x.h4ClosedAt<=x.fromAt;
};
const validDay=(d:unknown,start:number,now:number):d is SavedDay=>{
 if(!d||typeof d!=='object')return false;
 const x=d as Partial<SavedDay>;
 if(typeof x.day!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(x.day))return false;
 const at=midnight(x.day);
 return finite(at)&&isoDay(at)===x.day&&at>=nextUTC(start)&&at+DAY<=now&&
  finite(x.firstAt)&&finite(x.lastAt)&&x.firstAt>=at&&x.lastAt<at+DAY&&
  x.lastAt>=x.firstAt&&Number.isInteger(x.checks)&&x.checks!>0&&
  Number.isInteger(x.complete)&&x.complete!>=0&&x.complete!<=x.checks!&&
  Number.isInteger(x.partial)&&x.partial===x.checks!-x.complete!;
};
const keyH1=(e:SavedH1)=>String(e.toAt);
const keyH4=(e:SavedH4)=>String(e.toAt);
const keyDay=(e:SavedDay)=>e.day;
const keyReport=(r:ResearchReview)=>r.key;
/** Never silently replace factual observations or reports that share an identity. */
function combine<T>(current:T[],incoming:T[],key:(x:T)=>string,limit:number,label:string):T[]{
 const map=new Map<string,T>();
 for(const x of current)map.set(key(x),x);
 for(const x of incoming){
  const k=key(x),prior=map.get(k);
  if(prior!==undefined){
   if(JSON.stringify(prior)!==JSON.stringify(x))throw Error('Конфликт '+label+': '+k+'. Исходный архив не изменён.');
  }else{
   if(map.size>=limit)throw Error('Лимит архива '+label+' достигнут. Экспортируйте копию; данные не удалены.');
   map.set(k,x);
  }
 }
 return [...map.values()].sort((a,b)=>key(a).localeCompare(key(b),undefined,{numeric:true}));
}
function safeReports(raw:unknown,now:number):raw is ResearchReview[]{
 if(!Array.isArray(raw)||raw.length>MAX_REPORTS)return false;
 // Existing 5.2 validator is the authoritative format, excluding invalid reports.
 const clean=openResearchReviews(JSON.stringify({version:1,reports:raw}),now).reports;
 return clean.length===raw.length&&raw.length<=MAX_REPORTS;
}
/** Validate every stored element: invalid files are rejected whole, never partially loaded. */
export function validateCoreMemory(raw:unknown,now=Date.now()):raw is CoreMemory{
 if(!raw||typeof raw!=='object'||!finite(now))return false;
 const x=raw as Partial<CoreMemory>;
 if(x.version!==1||!finite(x.registeredAt)||x.registeredAt<=0||x.registeredAt>now||
  !Array.isArray(x.days)||!Array.isArray(x.h1)||!Array.isArray(x.h4)||
  x.days.length>MAX_DAYS||x.h1.length>MAX_H1||x.h4.length>MAX_H4||
  !safeReports(x.reports,now))return false;
 const validAll=x.days.every(e=>validDay(e,x.registeredAt!,now))&&
  x.h1.every(e=>validH1(e,x.registeredAt!,now))&&
  x.h4.every(e=>validH4(e,x.registeredAt!,now));
 if(!validAll)return false;
 const unique=<T>(xs:T[],key:(x:T)=>string)=>new Set(xs.map(key)).size===xs.length;
 if(!unique(x.days,keyDay)||!unique(x.h1,keyH1)||!unique(x.h4,keyH4)||
  !unique(x.reports!,keyReport))return false;
 const byH1=new Map(x.h1.map(e=>[e.toAt,e] as const));
 for(const h4 of x.h4){
  const h1=byH1.get(h4.toAt);
  if(h1&&h1.to!==h4.to)return false;
 }
 return true;
}
export function openCoreMemory(raw:string|null,now=Date.now()):CoreMemory{
 const fresh:CoreMemory={version:1,registeredAt:now,days:[],h1:[],h4:[],reports:[]};
 if(!finite(now)||now<=0)return {version:1,registeredAt:0,days:[],h1:[],h4:[],reports:[]};
 try{
  const parsed=JSON.parse(raw||'null') as CoreMemory;
  return validateCoreMemory(parsed,now)?parsed:fresh;
 }catch{return fresh;}
}
function dailyFromCore(archive:CoreResearchArchive,start:number,now:number):SavedDay[]{
 if(!Array.isArray(archive?.entries))return [];
 const groups=new Map<string,CoreResearchEntry[]>();
 for(const e of archive.entries){
  if(!e||e.source!=='core-native-observations-v1'||!finite(e.runAt)||!finite(e.finishedAt)||
   e.finishedAt<e.runAt||e.finishedAt>now||e.runAt<=start)continue;
  const at=Math.floor(e.finishedAt/DAY)*DAY;
  if(at<nextUTC(start)||at+DAY>now||e.runAt<at||e.runAt>=at+DAY)continue;
  const key=isoDay(at),group=groups.get(key)||[];
  group.push(e);groups.set(key,group);
 }
 const result:SavedDay[]=[];
 for(const [day,group] of groups){
  const unique=new Map<number,CoreResearchEntry>();
  for(const e of group.sort((a,b)=>a.runAt-b.runAt))if(!unique.has(e.runAt))unique.set(e.runAt,e);
  const items=[...unique.values()],checks=items.length,complete=items.filter(e=>e.complete===true).length;
  if(checks>0)result.push({day,firstAt:items[0].finishedAt,lastAt:Math.max(...items.map(e=>e.finishedAt)),
   checks,complete,partial:checks-complete});
 }
 return result.filter(e=>validDay(e,start,now));
}
function reportsFromCurrent(source:ResearchReviewArchive,now:number):ResearchReview[]{
 if(!Array.isArray(source?.reports))return [];
 return source.reports.filter(r=>openResearchReviews(JSON.stringify({version:1,reports:[r]}),now).reports.length===1);
}
export function appendCoreMemory(old:CoreMemory,input:CoreMemoryInputs,now=Date.now()):CoreMemory{
 if(!validateCoreMemory(old,now)||!input)return old;
 const addH1=(Array.isArray(input.transitions)?input.transitions:[])
  .filter((e):e is HourTransition=>validH1(e,old.registeredAt,now))
  .map(e=>({fromAt:e.fromAt,toAt:e.toAt,from:e.from,to:e.to}));
 const addH4=(Array.isArray(input.context?.observations)?input.context.observations:[])
  .filter((e):e is ContextEvent=>validH4(e,old.registeredAt,now))
  .map(e=>({fromAt:e.fromAt,toAt:e.toAt,to:e.to,h4:e.h4,h4ClosedAt:e.h4ClosedAt}));
 // Never accidentally destroy a local journal through an automatic ingest conflict.
 // Throw to caller so UI can keep the previous valid archive and show an explicit warning.
 const next:CoreMemory={version:1,registeredAt:old.registeredAt,
  days:combine(old.days,dailyFromCore(input.core,old.registeredAt,now),keyDay,MAX_DAYS,'дней CORE'),
  h1:combine(old.h1,addH1,keyH1,MAX_H1,'H1'),
  h4:combine(old.h4,addH4,keyH4,MAX_H4,'H4'),
  reports:combine(old.reports,reportsFromCurrent(input.reviews,now),keyReport,MAX_REPORTS,'отчётов')};
 if(!validateCoreMemory(next,now))throw Error('Некорректная связь H1/H4: архив оставлен без изменений.');
 if(JSON.stringify(next)===JSON.stringify(old))return old;
 return next;
}
/** Plain FNV-1a detects accidental file corruption, NOT malicious edits. */
function checksum32(content:string):string{
 let h=2166136261;
 for(let i=0;i<content.length;i++)h=Math.imul(h^content.charCodeAt(i),16777619)>>>0;
 return h.toString(16).padStart(8,'0');
}
function canonical(e:{kind:typeof KIND;version:1;exportedAt:number;payload:CoreMemory}):string{
 return JSON.stringify({kind:e.kind,version:e.version,exportedAt:e.exportedAt,payload:e.payload});
}
export function exportCoreMemory(memory:CoreMemory,now=Date.now()):string{
 if(!validateCoreMemory(memory,now))throw Error('Локальный архив повреждён: экспорт заблокирован.');
 const root={kind:KIND,version:VERSION,exportedAt:now,payload:memory};
 const result=JSON.stringify({...root,checksum:checksum32(canonical(root))},null,2);
 if(result.length>MAX_FILE)throw Error('Файл слишком большой для резервного сохранения (3.6 МБ).');
 return result;
}
export function importCoreMemory(file:string,now=Date.now()):CoreMemoryEnvelope{
 if(typeof file!=='string'||file.length<40||file.length>MAX_FILE)throw Error('Неверный размер файла архива CORE.');
 let x:unknown;try{x=JSON.parse(file)}catch{throw Error('Файл не является корректным JSON.')}
 if(!x||typeof x!=='object')throw Error('Неверный формат архива CORE.');
 const e=x as Partial<CoreMemoryEnvelope>;
 if(e.kind!==KIND||e.version!==1||!finite(e.exportedAt)||e.exportedAt<=0||e.exportedAt>now||
  !validateCoreMemory(e.payload,now))throw Error('Неизвестная версия или повреждённые записи архива.');
 const expected=checksum32(canonical({kind:KIND,version:1,exportedAt:e.exportedAt,payload:e.payload!}));
 if(e.checksum!==expected)throw Error('Контрольная сумма не совпадает. Восстановление отменено.');
 return e as CoreMemoryEnvelope;
}
export function mergeCoreMemory(current:CoreMemory,backup:CoreMemoryEnvelope,now=Date.now()):CoreMemory{
 if(!validateCoreMemory(current,now)||!backup||backup.kind!==KIND||
  !validateCoreMemory(backup.payload,now))throw Error('Несовместимые исследовательские архивы.');
 const b=backup.payload,start=Math.min(current.registeredAt,b.registeredAt);
 const merged:CoreMemory={version:1,registeredAt:start,
  days:combine(current.days,b.days,keyDay,MAX_DAYS,'дней CORE'),
  h1:combine(current.h1,b.h1,keyH1,MAX_H1,'H1'),
  h4:combine(current.h4,b.h4,keyH4,MAX_H4,'H4'),
  reports:combine(current.reports,b.reports,keyReport,MAX_REPORTS,'отчётов')};
 if(!validateCoreMemory(merged,now))throw Error('Обнаружены несовместимые H1/H4. Данные не изменены.');
 return merged;
}
export function coreMemoryStats(x:CoreMemory):CoreMemoryStats{
 const times=[...x.h1.map(v=>v.toAt),...x.h4.map(v=>v.toAt),
  ...x.reports.map(v=>v.recordedAt),...x.days.map(v=>v.lastAt)].filter(v=>finite(v));
 return {days:x.days.length,transitions:x.h1.length,contexts:x.h4.length,reports:x.reports.length,
  firstAt:times.length?Math.min(...times):null,lastAt:times.length?Math.max(...times):null,
  nearCapacity:x.days.length>=MAX_DAYS||x.h1.length>=MAX_H1||
   x.h4.length>=MAX_H4||x.reports.length>=MAX_REPORTS,
  limits:{days:MAX_DAYS,h1:MAX_H1,h4:MAX_H4,reports:MAX_REPORTS}};
}
