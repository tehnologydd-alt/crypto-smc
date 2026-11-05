/** APEX Research Vault 3.2. Local paper observations only: no credentials. */
import type {LearningLedger,LearningRecord} from './learning';
import type {ResearchStudy} from './research';
export interface VaultEnvelope{kind:'apex-research-vault';version:1;exportedAt:number;payload:{learning:LearningLedger;study:ResearchStudy|null};checksum:string}
export type VaultAudit={total:number;waiting:number;active:number;resolved:number;missingSnapshot:number;invalid:number;duplicateIds:number};
const isObj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finished=new Set(['TARGET','STOP','CANCELLED','EXPIRED']);
const allStatuses=new Set(['PENDING','ACTIVE',...finished]);
const safeString=(x:unknown)=>typeof x==='string'?x:'';
const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x);
const MAX_SIZE=4_000_000,MAX_RECORDS=2000;
function canonical(x:{kind:string;version:number;exportedAt:number;payload:unknown}):string{return JSON.stringify({kind:x.kind,version:x.version,exportedAt:x.exportedAt,payload:x.payload})}
/** FNV-1a detects accidental file corruption, not deliberate tampering. */
function checksum32(s:string):string{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619)>>>0;return n.toString(16).padStart(8,'0')}
function validRecord(r:unknown):r is LearningRecord{
 if(!isObj(r))return false;
 if(!safeString(r.id)||safeString(r.id).length>200||!/^[A-Z0-9]{3,30}$/.test(safeString(r.symbol)))return false;
 if(!['5m','1h','4h'].includes(safeString(r.frame))||!['LONG','SHORT'].includes(safeString(r.direction))||!allStatuses.has(safeString(r.status)))return false;
 if(!finite(r.createdAt)||!finite(r.entry)||!finite(r.stop)||r.entry<=0||r.stop<=0||r.entry===r.stop)return false;
 if(!Array.isArray(r.targets)||r.targets.length!==3||!r.targets.every(x=>finite(x)&&x>0))return false;
 if(!finite(r.lastCandleTime)||!Number.isInteger(r.tpReached)||r.tpReached<0||r.tpReached>3)return false;
 if(r.closedAt!==undefined&&(!finite(r.closedAt)||r.closedAt<r.createdAt))return false;
 if(typeof r.contextCaptured!=='boolean'||!isObj(r.initialVotes))return false;
 for(const f of ['5m','1h','4h'])if(!['LONG','SHORT','UNKNOWN'].includes(safeString(r.initialVotes[f])))return false;
 if(r.volumeRatio!==null&&(!finite(r.volumeRatio)||r.volumeRatio<0))return false;
 if(typeof r.reason!=='string'||r.reason.length>8000)return false;
 return true;
}
function validLedger(x:unknown):x is LearningLedger{
 if(!isObj(x)||x.version!==1||!finite(x.startedAt)||!Array.isArray(x.records)||x.records.length>MAX_RECORDS)return false;
 return x.records.every(validRecord)&&new Set(x.records.map((r:LearningRecord)=>r.id)).size===x.records.length;
}
function validStudy(x:unknown):x is ResearchStudy{
 if(!isObj(x)||x.version!==1||!finite(x.trainedAt)||!finite(x.trainingCutoff)||!Number.isInteger(x.trainingCount)||x.trainingCount<60||!Array.isArray(x.rules)||x.rules.length>3)return false;
 const names=['h4-confirmed','h1-confirmed','opposing-frame','volume-surge','h4-scenario','long-direction'];
 return x.rules.every((r:unknown)=>isObj(r)&&names.includes(safeString(r.id))&&typeof r.label==='string'&&r.label.length<500&&finite(r.trainEffect)&&Math.abs(r.trainEffect)<=1&&Number.isInteger(r.trainWith)&&Number.isInteger(r.trainWithout)&&r.trainWith>0&&r.trainWithout>0&&['higher','lower'].includes(safeString(r.expected)));
}
export function auditLearning(x:LearningLedger):VaultAudit{
 const ids=new Set<string>();let duplicateIds=0,invalid=0,missingSnapshot=0;
 for(const r of x.records){if(ids.has(r.id))duplicateIds++;else ids.add(r.id);if(!r.contextCaptured)missingSnapshot++;if(!validRecord(r))invalid++;}
 return {total:x.records.length,waiting:x.records.filter(r=>r.status==='PENDING').length,active:x.records.filter(r=>r.status==='ACTIVE').length,resolved:x.records.filter(r=>finished.has(r.status)).length,missingSnapshot,invalid,duplicateIds};
}
export function exportResearch(learning:LearningLedger,study:ResearchStudy|null,now=Date.now()):string{
 if(!validLedger(learning))throw Error('Исследовательская база содержит повреждённые записи; экспорт остановлен.');
 if(study!==null&&!validStudy(study))throw Error('Параметры исследования повреждены; экспорт остановлен.');
 const root={kind:'apex-research-vault' as const,version:1 as const,exportedAt:now,payload:{learning,study}};
 const result=JSON.stringify({...root,checksum:checksum32(canonical(root))},null,2);
 if(result.length>MAX_SIZE)throw Error('Архив превышает 4 МБ.');
 return result;
}
export function importResearch(json:string):VaultEnvelope{
 if(typeof json!=='string'||!json.length||json.length>MAX_SIZE)throw Error('Неверный размер файла резервной копии.');
 let raw:unknown;try{raw=JSON.parse(json)}catch{throw Error('Файл не является корректным JSON.')}
 if(!isObj(raw)||raw.kind!=='apex-research-vault'||raw.version!==1||!finite(raw.exportedAt)||!isObj(raw.payload))throw Error('Неизвестный формат резервной копии.');
 if(!validLedger(raw.payload.learning))throw Error('Резервная копия содержит повреждённые записи.');
 if(raw.payload.study!==null&&!validStudy(raw.payload.study))throw Error('В файле несовместимое исследование.');
 const expected=checksum32(canonical({kind:raw.kind,version:raw.version as number,exportedAt:raw.exportedAt as number,payload:raw.payload}));
 if(raw.checksum!==expected)throw Error('Контрольная сумма не совпадает: файл повреждён.');
 return raw as unknown as VaultEnvelope;
}
const terminal=(r:LearningRecord)=>finished.has(r.status);
function choose(a:LearningRecord,b:LearningRecord):LearningRecord{
 if(a.id!==b.id||a.symbol!==b.symbol||a.frame!==b.frame||a.direction!==b.direction||a.createdAt!==b.createdAt||a.entry!==b.entry||a.stop!==b.stop)throw Error('Несовместимые записи с одинаковым ID.');
 if(terminal(a)&&terminal(b)&&a.status!==b.status)throw Error('Два разных итоговых результата одного сигнала.');
 const more=terminal(a)&&!terminal(b)?a:terminal(b)&&!terminal(a)?b:b.lastCandleTime>a.lastCandleTime?b:a;
 const snapshot=a.contextCaptured?a:b.contextCaptured?b:a;
 return {...more,initialVotes:snapshot.initialVotes,contextCaptured:snapshot.contextCaptured,volumeRatio:snapshot.volumeRatio,createdAt:a.createdAt};
}
export function mergeResearch(current:LearningLedger,currentStudy:ResearchStudy|null,backup:VaultEnvelope):{learning:LearningLedger;study:ResearchStudy|null;added:number;updated:number}{
 if(!validLedger(current))throw Error('Текущая база повреждена; объединение запрещено.');
 const incoming=backup.payload;
 if(currentStudy&&incoming.study&&JSON.stringify(currentStudy)!==JSON.stringify(incoming.study))throw Error('Два разных зафиксированных исследования нельзя объединять автоматически.');
 const records=new Map(current.records.map(r=>[r.id,r]));let added=0,updated=0;
 for(const r of incoming.learning.records){const prev=records.get(r.id);if(!prev){records.set(r.id,r);added++;continue;}
  const next=choose(prev,r);if(JSON.stringify(next)!==JSON.stringify(prev))updated++;records.set(r.id,next);
 }
 if(records.size>MAX_RECORDS)throw Error('Слишком много записей: ничего не импортировано.');
 return {learning:{version:1,startedAt:Math.min(current.startedAt,incoming.learning.startedAt),records:[...records.values()].sort((a,b)=>b.createdAt-a.createdAt)},study:currentStudy||incoming.study,added,updated};
}
