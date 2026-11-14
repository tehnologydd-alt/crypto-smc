/**
 * Local research transcript archive. Independent of the 24-task Director queue.
 * Historical snapshots are observations, not verified model conclusions.
 * No inference, no network, no credentials. Bounded by records AND bytes.
 */
export const HISTORY_KEY='apex.research.transcripts.v1';
export const MAX_TRANSCRIPTS=200;
const MAX_BYTES=1800000, SYMBOL=/^[A-Z0-9]{2,16}USDT$/;
const time=x=>Number.isSafeInteger(x)&&x>0;
const text=x=>typeof x==='string'&&x.trim().length>=15&&x.length<=2400;
function snapshots(value,asset){
 if(!Array.isArray(value)||value.length<1||value.length>5)return null;
 const seen=new Set(),out=[];
 for(const e of value){
  if(typeof e?.source_id!=='string'||e.source_id.length>100||
   !e.source_id.includes(':'+asset+':')||seen.has(e.source_id)||
   !time(e.observed_at)||typeof e.text!=='string'||!e.text.trim()||
   e.text.length>1500)return null;
  seen.add(e.source_id);
  out.push({source_id:e.source_id,observed_at:e.observed_at,text:e.text});
 }
 return out;
}
export function normalizeTranscript(s,now=Date.now()){
 if(!s||s.version!==1||!SYMBOL.test(s.asset||'')||!time(s.startedAt)||
  s.startedAt>now+120000||!['ANALYST_READY','COMPLETE'].includes(s.stage)||
  !text(s.analystText))return null;
 const evidence=snapshots(s.evidence,s.asset);
 if(!evidence||evidence.some(e=>e.observed_at>s.startedAt+120000)||
  JSON.stringify(s.sourceIds)!==JSON.stringify(evidence.map(e=>e.source_id)))return null;
 const row={version:1,id:s.asset+':'+s.startedAt,asset:s.asset,
  startedAt:s.startedAt,stage:s.stage,evidence,
  sourceIds:evidence.map(e=>e.source_id),analystText:s.analystText};
 if(s.stage==='COMPLETE'){
  const recent=snapshots(s.criticEvidence,s.asset);
  if(!recent||!text(s.criticText)||!time(s.criticAt)||
   s.criticAt<s.startedAt||s.criticAt>now+120000||
   recent.some(e=>e.observed_at>s.criticAt+120000))return null;
  Object.assign(row,{criticAt:s.criticAt,criticText:s.criticText,criticEvidence:recent});
 }
 return row;
}
export function batchTranscripts(batch){
 if(batch?.version!==1||!Array.isArray(batch.items)||
    batch.items.length<2||batch.items.length>3||
    new Set(batch.items.map(x=>x?.asset)).size!==batch.items.length)return [];
 return batch.items.map(x=>({...x,version:1,stage:batch.stage,startedAt:batch.startedAt}));
}
export function mergeTranscripts(previous,incoming,now=Date.now()){
 const byId=new Map();
 for(const raw of [...previous,...incoming]){
  const next=normalizeTranscript(raw,now);
  if(!next)continue;
  const old=byId.get(next.id);
  if(!old){byId.set(next.id,next);continue;}
  // Same run must retain the same analyst and input snapshots.
  if(old.analystText!==next.analystText||
     JSON.stringify(old.evidence)!==JSON.stringify(next.evidence))continue;
  if(old.stage==='COMPLETE')continue;
  if(next.stage==='COMPLETE')byId.set(next.id,next);
 }
 const rows=[...byId.values()].sort((a,b)=>b.startedAt-a.startedAt||a.asset.localeCompare(b.asset));
 const out=[];let bytes=30;
 for(const row of rows){
  const size=new TextEncoder().encode(JSON.stringify(row)).length+1;
  if(out.length>=MAX_TRANSCRIPTS||bytes+size>MAX_BYTES)break;
  out.push(row);bytes+=size;
 }
 return out;
}
export function readTranscripts(store,now=Date.now()){
 try{
  const raw=store?.getItem(HISTORY_KEY);
  if(!raw)return [];
  if(raw.length>MAX_BYTES)return [];
  const parsed=JSON.parse(raw);
  if(parsed.version!==1||!Array.isArray(parsed.rows)||parsed.rows.length>MAX_TRANSCRIPTS)return [];
  return mergeTranscripts([],parsed.rows,now);
 }catch{return [];}
}
export function writeTranscripts(store,rows){
 try{
  const data=JSON.stringify({version:1,rows});
  if(!store||new TextEncoder().encode(data).length>MAX_BYTES)return false;
  store.setItem(HISTORY_KEY,data);
  return store.getItem(HISTORY_KEY)===data;
 }catch{return false;}
}
export function initResearchHistory({store,now=()=>Date.now()}={}){
 if(store===undefined){try{store=globalThis.localStorage;}catch{store=null;}}
 const node=id=>document.getElementById(id);
 const count=node('apex-history-count'),list=node('apex-history-list'),
 picker=node('apex-history-filter'),limit=node('apex-history-older');
 let rows=readTranscripts(store,now()),visible=8,signature='',saved=true;
 const render=()=>{
  const assets=[...new Set(rows.map(x=>x.asset))].sort();
  const prev=picker.value;
  const opts=JSON.stringify(assets);
  if(picker.dataset.assets!==opts){
   picker.replaceChildren();
   for(const asset of ['',...assets]){
    const option=document.createElement('option');option.value=asset;
    option.textContent=asset||'Все активы';picker.append(option);
   }
   if(assets.includes(prev))picker.value=prev;
   picker.dataset.assets=opts;
  }
  const shown=rows.filter(x=>!picker.value||x.asset===picker.value);
  count.textContent='Сохранено '+rows.length+' / '+MAX_TRANSCRIPTS+
   ' · завершено '+rows.filter(x=>x.stage==='COMPLETE').length+
   (saved?'':' · ошибка локальной записи');
  limit.disabled=shown.length<=visible;
  const next=JSON.stringify(shown.slice(0,visible));
  if(next===signature)return;
  signature=next;list.replaceChildren();
  for(const row of shown.slice(0,visible)){
   const details=document.createElement('details');
   const title=document.createElement('summary');
   title.textContent=row.asset+' · '+new Date(row.startedAt).toLocaleString('ru-RU')+
    (row.stage==='COMPLETE'?' · GLM + Qwen':' · только GLM');
   const body=document.createElement('pre');
   const evidence=row.evidence.map(e=>e.source_id+' · '+new Date(e.observed_at).toISOString()+'\n'+e.text).join('\n\n');
   const critic=row.criticEvidence?.map(e=>e.source_id+' · '+new Date(e.observed_at).toISOString()+'\n'+e.text).join('\n\n');
   body.textContent='GLM\n'+row.analystText+'\n\nИсходные наблюдения\n'+evidence+
    (row.stage==='COMPLETE'?'\n\nQwen\n'+row.criticText+'\n\nНовые наблюдения для Qwen\n'+critic:'');
   details.append(title,body);list.append(details);
  }
 };
 const ingest=sessions=>{
  rows=mergeTranscripts(rows,sessions,now());
  saved=writeTranscripts(store,rows);
  render();return saved;
 };
 // Recover last on-device sessions, including older completed runs. They
 // remain history only: the live workflow's expiry and budget are unchanged.
 const recover=()=>{
  let sessions=[];
  try{const s=JSON.parse(store?.getItem('apex.collective.research.v1')||'null');if(s)sessions.push(s);}catch{}
  try{const b=JSON.parse(store?.getItem('apex.ai.batch.v1')||'null');sessions.push(...batchTranscripts(b));}catch{}
  if(sessions.length)ingest(sessions);else render();
 };
 picker.addEventListener('change',()=>{visible=8;signature='';render();});
 limit.addEventListener('click',()=>{visible+=8;render();});
 recover();
 return {ingest,render,getRows:()=>rows.slice()};
}
