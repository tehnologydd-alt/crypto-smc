/**
 * Explicit 2–3 asset batch research. NEVER run in background.
 * Models get real favorite-only snapshots and no private account data.
 * Each batch counts as ONE reserved model invocation.
 */
import {buildCloudAuditEvidence,checkCloudAiLanguageBudget,
 explainCloudAiAuditFailure} from './cloud-ai-manual-audit.mjs';
import {mergeResearchEvidence} from './cloud-ai-collective.mjs';
const KEY='apex.ai.batch.v1',MIN=2,MAX=3,HOUR=3600000;
const symbol=s=>typeof s==='string'&&/^[A-Z0-9]{2,16}USDT$/.test(s);
const storeDefault=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const ids=e=>e.map(x=>x.source_id);
export function sameBatchAssets(a,b){
 return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
  new Set(a).size===a.length&&new Set(b).size===b.length&&
  a.every(x=>b.includes(x));
}
const validOutput=(data,role,items)=>data?.state==='OBSERVED_MODEL_BATCH'&&
 data.httpStatus===200&&data.role===role&&
 Array.isArray(data.results)&&data.results.length===items.length&&
 data.results.every((r,i)=>r?.asset===items[i].asset&&
  typeof r.text==='string'&&r.text.trim().length>=15&&r.text.length<=800&&
  Array.isArray(r.source_ids)&&r.source_ids.length>=1&&
  r.source_ids.every(s=>ids(items[i].evidence).includes(s)));
export function validateSavedBatch(value,at=Date.now()){
 if(!value||value.version!==1||
  !['ANALYST_READY','COMPLETE'].includes(value.stage)||
  !Number.isSafeInteger(value.startedAt)||
  value.startedAt>at+120000||at-value.startedAt>HOUR||
  !Array.isArray(value.items)||value.items.length<MIN||
  value.items.length>MAX)return null;
 const seen=new Set();
 for(const x of value.items){
  if(!symbol(x?.asset)||seen.has(x.asset)||
   !Array.isArray(x.evidence)||x.evidence.length<1||
   x.evidence.length>4||
   !x.evidence.every(e=>typeof e?.source_id==='string'&&
    Number.isSafeInteger(e.observed_at)&&typeof e.text==='string')||
   typeof x.analystText!=='string'||x.analystText.length<15||
   x.analystText.length>800||
   !Array.isArray(x.sourceIds)||
   JSON.stringify(x.sourceIds)!==JSON.stringify(ids(x.evidence)))return null;
  if(value.stage==='COMPLETE'&&
   (typeof x.criticText!=='string'||x.criticText.length<15||
    !Array.isArray(x.criticEvidence)||x.criticEvidence.length<1))
   return null;
  seen.add(x.asset);
 }
 return value;
}
export function initCloudAiBatch({getFavorites,getPriorityAssets=()=>[],
 getHistory,fetchTicker,getPairing,getBudget,runBatch,
 onSession=()=>{},refreshMonitor=async()=>{},
 store=storeDefault(),now=()=>Date.now()}){
 const el=id=>document.getElementById(id);
 const checks=el('apex-batch-options'),start=el('apex-batch-start');
 const review=el('apex-batch-review'),status=el('apex-batch-status');
 const output=el('apex-batch-output');
 let selected=[],busy=false,session=null,available=[],budgetSnapshot=null,lastOutput=null;
 try{const raw=store?.getItem(KEY);
  if(raw)session=validateSavedBatch(JSON.parse(raw),now());
 }catch{}
 function renderOptions(){
  const favorites=(getFavorites()||[]).filter(symbol).slice(0,10);
  const priority=(getPriorityAssets()||[]).filter(s=>favorites.includes(s));
  const ordered=[...new Set([...priority,...favorites])];
  // Preserve the visual order during routine priority changes.
  const stable=[...available.filter(s=>ordered.includes(s)),
   ...ordered.filter(s=>!available.includes(s))];
  if(JSON.stringify(stable)===JSON.stringify(available))return;
  const first=available.length===0;
  available=stable;
  selected=selected.filter(s=>available.includes(s)).slice(0,MAX);
  if(first&&!selected.length){
   const pending=session?.stage==='ANALYST_READY'?session.items.map(x=>x.asset):[];
   selected=pending.length&&pending.every(s=>available.includes(s))?
    pending:available.slice(0,Math.min(MAX,available.length));
  }
  checks.replaceChildren();
  for(const asset of available){
   const label=document.createElement('label');
   const box=document.createElement('input');
   box.type='checkbox';box.value=asset;box.checked=selected.includes(asset);
   box.disabled=busy;
   box.addEventListener('change',()=>{
    if(box.checked){
     if(selected.length>=MAX){box.checked=false;return;}
     selected.push(asset);
    }else selected=selected.filter(s=>s!==asset);
    sync();
   });
   label.append(box,document.createTextNode(asset));checks.append(label);
  }
 }
 const orderedSelected=()=>available.filter(s=>selected.includes(s));
 function sync(){
  renderOptions();
  const selection=orderedSelected();
  start.disabled=busy||selection.length<MIN||selection.length>MAX;
  const stage=session?.stage==='ANALYST_READY'&&
   now()-session.startedAt<55*60000;
  review.disabled=busy||!stage||
   !sameBatchAssets(selection,session?.items?.map(x=>x.asset));
  // Never overwrite the report DOM on an unchanged refresh (scroll stability).
  if(stage&&!busy&&sameBatchAssets(selection,session.items.map(x=>x.asset))){
   const gate=budgetSnapshot?checkCloudAiLanguageBudget(budgetSnapshot,now()):null;
   review.title=gate&&!gate.allowed?gate.message:'Готово к ручной проверке Qwen';
  }else review.title='';
  for(const input of checks.querySelectorAll('input'))input.disabled=busy;
  output.hidden=!session;
  const report=session?session.items.map(x=>
   x.asset+' · GLM\n'+x.analystText+
   (x.criticText?'\nQwen\n'+x.criticText:'')).join('\n\n———\n\n'):'';
  if(report!==lastOutput){output.textContent=report;lastOutput=report;}
  return selection;
 }
 const say=message=>{status.textContent=message;};
 async function evidence(asset){
  const [h,t]=await Promise.all([
   getHistory(asset,20).catch(()=>null),
   fetchTicker(asset).catch(()=>null)
  ]);
  return buildCloudAuditEvidence({asset,
   rows:h?.native===true&&Array.isArray(h.observations)?h.observations:[],
   ticker:t?.state==='OK'?t.data:null,now:now()}).slice(0,2);
 }
 function persist(){
  try{store?.setItem(KEY,JSON.stringify(session));}catch{}
 }
 async function run(role){
  if(busy)return;
  let chosen=sync();
  if(chosen.length<MIN||chosen.length>MAX)return;
  if(role==='critic'&&
   (!session||session.stage!=='ANALYST_READY'||
    now()-session.startedAt>=55*60000||
    !sameBatchAssets(chosen,session.items.map(x=>x.asset)))){
   say('Пакет GLM устарел или изменён состав активов.');return;
  }
  // Critic must follow the saved analyst order, not current display order.
  if(role==='critic')chosen=session.items.map(x=>x.asset);
  busy=true;sync();let error=null,done=false;
  say('Проверяем одобрение телефона и бюджет Cloudflare…');
  try{
   const pair=await getPairing();
   if(pair?.state!=='APPROVED')throw Error('Телефон не подтверждён.');
   budgetSnapshot=await getBudget();
   const limit=checkCloudAiLanguageBudget(budgetSnapshot,now());
   if(!limit.allowed)throw Error(limit.message);
   say('Проверяем актуальные публичные данные по '+chosen.join(', ')+'…');
   const fresh=await Promise.all(chosen.map(asset=>evidence(asset)));
   const missing=chosen.filter((_,i)=>!fresh[i].length);
   if(missing.length)
    throw Error('Нет свежих подтверждённых данных: '+missing.join(', ')+'. Запрос отменён.');
   const items=chosen.map((asset,i)=>{
    const previous=role==='critic'?session.items[i]:null;
    const data=previous?
     mergeResearchEvidence(previous.evidence,fresh[i]).slice(0,4):fresh[i];
    return {asset,evidence:data,...(previous?{analyst:{
     text:previous.analystText,source_ids:previous.sourceIds,
     captured_at:session.startedAt
    }}:{})};
   });
   say(role==='analyst'?'GLM исследует пакет из '+chosen.length+' активов…':
    'Qwen проверяет выводы GLM по '+chosen.length+' активам…');
   const response=await runBatch(role,items);
   if(!validOutput(response,role,items))
    throw Error(explainCloudAiAuditFailure(response,role));
   if(role==='analyst'){
    session={version:1,stage:'ANALYST_READY',startedAt:now(),
     items:items.map((x,i)=>({
      asset:x.asset,evidence:x.evidence,sourceIds:ids(x.evidence),
      analystText:response.results[i].text
     }))};
   }else{
    session={...session,stage:'COMPLETE',items:session.items.map((x,i)=>({
     ...x,criticText:response.results[i].text,
     criticEvidence:fresh[i],criticAt:now()
    }))};
   }
   persist();done=true;
   for(const item of session.items){
    const record={version:1,asset:item.asset,startedAt:session.startedAt,
     evidence:item.evidence,sourceIds:item.sourceIds,
     analystText:item.analystText,
     stage:role==='critic'?'COMPLETE':'ANALYST_READY',
     ...(role==='critic'?{
      criticText:item.criticText,criticAt:item.criticAt,
      criticEvidence:item.criticEvidence
     }:{})};
    try{onSession(record);}catch{}
   }
  }catch(e){error=String(e?.message||e).slice(0,220);}
  finally{
   busy=false;sync();
   say(error|| (done?role==='analyst'?
    'GLM ответил по всем активам. Qwen можно запускать вручную после общей паузы.':
    'Qwen проверил все активы; результаты сохранены в журнале APEX.':'Нет ответа'));
   try{await refreshMonitor();}catch{}
  }
 }
 start.addEventListener('click',()=>void run('analyst'));
 review.addEventListener('click',()=>void run('critic'));
 sync();
 return {sync,getSession:()=>session,
  getSelected:()=>orderedSelected(),
  setSelected:values=>{selected=[...new Set(values.filter(x=>available.includes(x)))].slice(0,MAX);
   for(const box of checks.querySelectorAll('input'))box.checked=selected.includes(box.value);
   sync();}};
}
