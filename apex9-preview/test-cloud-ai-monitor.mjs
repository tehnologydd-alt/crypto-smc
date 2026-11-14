import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveCloudAiView,renderTime} from './cloud-ai-monitor.mjs';

test('APEX AI monitor cannot invent connectivity or completed analyses',()=>{
 const v=deriveCloudAiView({pair:{state:'NOT_PAIRED'}});
 assert.equal(v.status,'offline');
 assert.equal(v.server,'Нет ответа');
 assert.equal(v.daily,'—');
 assert.equal(v.analyst.count,null);
 assert.equal(v.critic.count,null);
 assert.equal(v.events.length,0);
});

test('reachable server is not the same as approved device or working model',()=>{
 const v=deriveCloudAiView({
  health:{state:'RUNNING',httpStatus:200,mode:'ACTIVE',checkedAt:Date.now()},
  pair:{state:'PENDING_APPROVAL',verificationCode:'A1B2C3D4E5',fingerprint:'0123456789ABCDEF'}
 });
 assert.equal(v.status,'pending');
 assert.equal(v.statusLabel,'Ожидает одобрения');
 assert.equal(v.server,'Доступен');
 assert.equal(v.access,'Ждёт подтверждения');
 assert.equal(v.mode,'День');
 assert.equal(v.daily,'—');
 assert.equal(v.analyst.title,'Нет данных Android');
 assert.equal(v.verificationCode,'A1B2C3D4E5');
});

test('D1 quotas render only after approved and verified signed budget',()=>{
 const values={
  health:{state:'RUNNING',httpStatus:200,mode:'ECO'},
  pair:{state:'APPROVED'},
  budget:{state:'POLICY_ACTIVE',httpStatus:200,
   clock:{mode:'ECO'},
   usage:{language:{
    dailyUsed:2,dailyLimit:12,monthlyUsed:33,monthlyLimit:280,
    nightUsed:1,nightLimit:1,nextEligibleAt:Date.now()+60000
   }}}
 };
 const v=deriveCloudAiView(values);
 assert.equal(v.status,'ok');
 assert.equal(v.daily,'2 / 12');
 assert.equal(v.mode,'ЭКО · ночь');
 assert.equal(v.quotas.monthUsed,33);
 assert.equal(v.quotas.nightUsed,1);
 assert.match(v.note,/не баланс Neurons/);
 assert.equal(deriveCloudAiView({...values,
  budget:{...values.budget,httpStatus:401}}).daily,'—');
});

test('real local completion counts and failures stay separate from D1 attempt counts',()=>{
 const now=Date.now();
 const v=deriveCloudAiView({
  health:{state:'RUNNING',httpStatus:200},pair:{state:'APPROVED'},
  local:{state:'LOCAL_AUDIT',
   analyst:{successCount:3,lastAt:now,lastSuccessAt:now-30000,lastOk:false},
   critic:{successCount:1,lastAt:now,lastSuccessAt:now,lastOk:true},
   events:[
    {at:now,role:'analyst',state:'MODEL_QUOTA_OR_UNAVAILABLE',success:false},
    {at:now-1000,role:'critic',state:'MODEL_OUTPUT',success:true}
   ]}
 });
 assert.equal(v.analyst.count,3);
 assert.equal(v.analyst.lastOk,false);
 assert.equal(v.critic.count,1);
 assert.equal(v.events.length,2);
 assert.match(v.events[0].title,/без ответа/);
 assert.match(v.events[1].title,/получен ответ/);
 assert.equal(v.daily,'—','no fake server quota values without D1');
});

test('overview, native settings and bundling refer to the same monitor module',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 for(const id of ['apex-ai-live-state','apex-ai-live-server','apex-ai-live-device',
  'apex-ai-live-mode','apex-ai-live-usage','apex-ai-health-checked',
  'apex-ai-quota-daily','apex-ai-glm-status','apex-ai-qwen-status','apex-ai-events']){
  assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 }
 assert.match(app,/initCloudAiMonitor\(/);
 assert.match(bridge,/cloudAiHealthStatus/);
 assert.match(bridge,/cloudAiActivityStatus/);
 assert.match(stage,/'cloud-ai-monitor\.mjs'/);
 assert.match(stage,/'cloud-ai-monitor\.css'/);
});

test('next eligible time displays a genuine five-minute future cooldown',()=>{
 const until=Date.now()+5*60000;
 assert.equal(renderTime(until),'—','ordinary timestamps still disallow implausible future');
 assert.notEqual(renderTime(until,{allowFuture:true}),'—');
 assert.notEqual(renderTime(Date.now()+60*60000,{allowFuture:true}),'—');
 const v=deriveCloudAiView({health:{state:'RUNNING',httpStatus:200},
  pair:{state:'APPROVED'},budget:{state:'POLICY_ACTIVE',httpStatus:200,
   clock:{mode:'ACTIVE'},usage:{language:{dailyUsed:1,dailyLimit:12,
   monthlyUsed:1,monthlyLimit:280,nightUsed:0,nightLimit:1,nextEligibleAt:until}}}});
 assert.equal(v.quotas.nextEligibleAt,until);
});

test('timeout on Qwen uses actual failed attempt time, not preceding success time',()=>{
 const after=Date.now(),before=after-40*60000;
 const v=deriveCloudAiView({local:{state:'LOCAL_AUDIT',
  analyst:{successCount:2,lastAt:before,lastSuccessAt:before,lastOk:true,lastState:'MODEL_OUTPUT'},
  critic:{successCount:1,lastAt:after,lastSuccessAt:before,lastOk:false,
   lastState:'MODEL_RESPONSE_TIMEOUT'},
  events:[{at:after,role:'critic',state:'MODEL_RESPONSE_TIMEOUT',success:false}]}});
 assert.equal(v.critic.count,1);
 assert.equal(v.critic.lastAt,after);
 assert.equal(v.critic.lastSuccessAt,before);
 assert.match(v.critic.title,/истекло время ожидания/);
 assert.match(v.events[0].title,/истекло время ожидания/);
 const source=readFileSync(new URL('./cloud-ai-monitor.mjs',import.meta.url),'utf8');
 assert.match(source,/model\.lastAt\?' · '/);
 assert.doesNotMatch(source,/model\.lastSuccessAt\?' · '/);
});

test('AI center and overview refresh in foreground and a failed network read preserves local audit',()=>{
 const source=readFileSync(new URL('./cloud-ai-monitor.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("if(document.hidden)return;"));
 assert.ok(source.includes("if(!['overview','ai'].includes(document.body?.dataset?.view))return;"));
 assert.match(source,/lastLocal=l/);
 assert.match(source,/local:l\?\.state==='LOCAL_AUDIT'\?l:lastLocal/);
 assert.match(source,/afterCurrent=false/);
 assert.match(source,/signature!==lastEventsSignature/);
});


test('AI center is a standalone routed view with unique live controls',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const monitor=readFileSync(new URL('./cloud-ai-monitor.mjs',import.meta.url),'utf8');
 const settings=html.slice(html.indexOf('<dialog id="apex-settings-dialog"'),html.indexOf('</dialog>'));
 const ai=html.slice(html.indexOf('id="view-ai"'),html.indexOf('id="view-sources"'));
 for(const id of ['apex-ai-enroll','apex-ai-check','apex-ai-test-analyst','apex-ai-test-critic','apex-batch-start','apex-batch-review','apex-director-panel','apex-history-list','apex-ai-events','apex-ai-page-state','apex-ai-page-usage']){
  assert.ok(ai.includes('id="'+id+'"'),id+' must live in AI center');
  assert.ok(!settings.includes('id="'+id+'"'),id+' must not be inside settings');
  assert.equal(html.split('id="'+id+'"').length,2,id+' must be unique');
 }
 assert.equal((settings.match(/class="apex-settings-divider"/g)||[]).length,3);
 assert.match(html,/id="apex-ai-live-details"[^>]+data-go="ai"/);
 assert.ok(app.includes("'radar','ai'"));
 assert.ok(app.includes("if(view==='ai')void cloudAiMonitor.refresh()"));
 assert.ok(monitor.includes("['overview','ai'].includes"));
 assert.ok(!monitor.includes('apex-settings-dialog'));
 for(const id of ['state','server','device','mode','usage'])assert.ok(monitor.includes('apex-ai-page-'+id));
});


test('AI center auto-refresh policy does not poll models or unrelated screens',async()=>{
 const {initCloudAiMonitor}=await import('./cloud-ai-monitor.mjs');
 const oldDoc=globalThis.document,oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval,oldNow=Date.now;
 let tick,now=1000000,reads=0;
 globalThis.document={hidden:false,body:{dataset:{view:'overview'}},
  getElementById:()=>null,addEventListener(){},removeEventListener(){}};
 globalThis.setInterval=fn=>{tick=fn;return 1;};
 globalThis.clearInterval=()=>{};
 Date.now=()=>now;
 let controller;
 try{
  controller=initCloudAiMonitor({
   health:async()=>{reads++;return {state:'RUNNING',httpStatus:200};},
   pairing:async()=>({state:'NOT_PAIRED'}),
   activity:async()=>({state:'LOCAL_AUDIT'}),intervalMs:90000
  });
  await controller.refresh();
  assert.equal(reads,1);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  now+=90001;document.body.dataset.view='ai';tick();await flush();
  assert.equal(reads,2,'AI screen refreshes when due');
  now+=90001;document.body.dataset.view='asset';tick();await flush();
  assert.equal(reads,2,'unrelated screen does not poll');
  document.body.dataset.view='ai';document.hidden=true;tick();await flush();
  assert.equal(reads,2,'hidden app does not poll');
  document.hidden=false;document.body.dataset.view='overview';tick();await flush();
  assert.equal(reads,3,'overview refreshes when due');
 }finally{
  controller?.destroy();globalThis.document=oldDoc;
  globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;Date.now=oldNow;
 }
});


test('quota meters distinguish unknown, unavailable capacity, unused, near and exhausted limits',async()=>{
 const {quotaMeter}=await import('./cloud-ai-monitor.mjs');
 assert.deepEqual(quotaMeter(null,12),{label:'—',percent:null,state:'unknown'});
 assert.equal(quotaMeter(0,12,false).state,'unknown');
 assert.deepEqual(quotaMeter(0,0),{label:'0 / 0',percent:null,state:'closed'});
 assert.deepEqual(quotaMeter(0,12),{label:'0 / 12',percent:0,state:'ok'});
 assert.deepEqual(quotaMeter(9,12),{label:'9 / 12',percent:75,state:'ok'});
 assert.equal(quotaMeter(10,12).state,'near');
 assert.deepEqual(quotaMeter(13,12),{label:'13 / 12',percent:100,state:'full'});
});
test('all four quota meters and mobile shortcuts have unique real targets',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 for(const id of ['apex-ai-meter','apex-ai-meter-month','apex-ai-meter-night','apex-ai-meter-neurons']){
  assert.equal(html.split('id="'+id+'"').length,2);
  assert.equal(html.split('id="'+id+'-fill"').length,2);
  assert.match(html,new RegExp('data-state="unknown" id="'+id+'"'));
 }
 for(const [,id] of html.matchAll(/data-ai-jump="([^"]+)"/g))assert.equal(html.split('id="'+id+'"').length,2);
 assert.equal([...html.matchAll(/data-ai-jump="/g)].length,4);
});
test('failed refresh clears verified quota but retains last successful contact',async()=>{
 const {initCloudAiMonitor}=await import('./cloud-ai-monitor.mjs');
 const original=globalThis.document;
 let online=true;
 const nodes=new Map();
 for(const id of ['apex-ai-live-state','apex-ai-live-checked','apex-ai-quota-daily','apex-ai-meter','apex-ai-meter-fill']){
  nodes.set(id,{textContent:'',dataset:{},style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}});
 }
 globalThis.document={getElementById:id=>nodes.get(id),addEventListener(){},removeEventListener(){}};
 let controller;
 try{
  controller=initCloudAiMonitor({
   health:async()=>online?{state:'RUNNING',httpStatus:200,checkedAt:Date.now()}:null,
   pairing:async()=>online?{state:'APPROVED'}:null,
   budget:async()=>({state:'POLICY_ACTIVE',httpStatus:200,usage:{language:{dailyUsed:3,dailyLimit:12}}}),
   activity:async()=>null
  });
  const a=await controller.refresh();
  assert.equal(a.status,'ok');
  assert.equal(nodes.get('apex-ai-meter').attrs['aria-valuenow'],'25');
  online=false;
  const b=await controller.refresh();
  assert.equal(b.status,'offline');
  assert.equal(b.lastHealthyAt,a.lastHealthyAt);
  assert.equal(nodes.get('apex-ai-quota-daily').textContent,'—');
  assert.equal(nodes.get('apex-ai-meter').dataset.state,'unknown');
  assert.equal(nodes.get('apex-ai-meter').attrs['aria-valuenow'],undefined);
 }finally{controller?.destroy();globalThis.document=original;}
});

test('recent native diagnostics distinguish response, transport, output and uncertain provider states',async()=>{
 const {recentAiDiagnostics,classifyAiEvent}=await import('./cloud-ai-monitor.mjs');
 assert.equal(recentAiDiagnostics({}),null);
 assert.equal(classifyAiEvent('UNKNOWN',true),'unknown');
 const at=Date.now(),events=['MODEL_OUTPUT','MODEL_RESPONSE_TIMEOUT','BATCH_JSON_NOT_PARSEABLE','MODEL_QUOTA_OR_UNAVAILABLE','UNKNOWN'].map(state=>({state,at,role:'critic',success:state==='MODEL_OUTPUT'}));
 assert.deepEqual(recentAiDiagnostics({state:'LOCAL_AUDIT',events}),{total:5,response:1,connection:1,output:1,provider:1,unknown:1});
 assert.equal(recentAiDiagnostics({state:'LOCAL_AUDIT',events:[]}).total,0);
 assert.equal(recentAiDiagnostics({state:'LOCAL_AUDIT',events:Array(12).fill(events[0])}).total,8);
});

test('orchestrator cloud diagnostics only describe observed data and never enable model execution',async()=>{
 const {researchCloudDiagnostics,inspectDirectorQueueCounts}=await import('./cloud-ai-monitor.mjs');
 const now=Date.now();
 const data={health:{state:'RUNNING',httpStatus:200,checkedAt:now},
  pair:{state:'APPROVED'},budget:{state:'POLICY_ACTIVE',httpStatus:200,clock:{mode:'ECO'},
   usage:{language:{dailyUsed:1,dailyLimit:12,monthlyUsed:2,monthlyLimit:280,nightUsed:1,nightLimit:1}}}};
 const d=researchCloudDiagnostics(data,now);
 assert.equal(d.state,'OBSERVED');assert.equal(d.mode,'ECO');
 assert.equal(d.night.state,'full');assert.equal(d.automaticExecutionEnabled,false);
 assert.equal(d.automaticModelCalls,0);
 assert.equal(researchCloudDiagnostics(data,now+180001).state,'STALE_HEALTH');
 assert.equal(researchCloudDiagnostics({...data,budget:null},now).state,'BUDGET_UNKNOWN');
 assert.equal(researchCloudDiagnostics({},now).state,'NO_CONNECTION');
 assert.equal(inspectDirectorQueueCounts({getItem:()=>null}).queued,0);
 const task={id:'a',stage:'QUEUED'};
 assert.deepEqual(inspectDirectorQueueCounts({getItem:()=>JSON.stringify({version:1,tasks:[task,{id:'b',stage:'REVIEWED'}]})}),
  {queued:1,analystReady:0,reviewed:1});
 assert.equal(inspectDirectorQueueCounts({getItem:()=>JSON.stringify({version:1,tasks:[task,task]})}),null);
 assert.equal(inspectDirectorQueueCounts({getItem:()=>'{broken'}),null);
});

test('read-only diagnostics distinguish fixture connection failure, revoked device and resource exhaustion',async()=>{
 const {researchCloudDiagnostics}=await import('./cloud-ai-monitor.mjs');
 const now=Date.now();
 const data={health:{state:'RUNNING',httpStatus:200,checkedAt:now},pair:{state:'APPROVED'},
  budget:{state:'POLICY_ACTIVE',httpStatus:200,clock:{mode:'ACTIVE'},usage:{language:{
   dailyUsed:12,dailyLimit:12,monthlyUsed:280,monthlyLimit:280,nightUsed:0,nightLimit:0}}},
  local:{state:'LOCAL_AUDIT',analyst:{lastAt:now,lastOk:false,lastState:'MODEL_RESPONSE_TIMEOUT'}}};
 const d=researchCloudDiagnostics(data,now);
 assert.equal(d.daily.state,'full');assert.equal(d.monthly.state,'full');
 assert.equal(d.night.state,'closed');assert.equal(d.automaticExecutionEnabled,false);
 assert.match(d.modelActivity.GLM,/истекло время/);
 assert.equal(researchCloudDiagnostics({...data,pair:{state:'REVOKED'}},now).state,'DEVICE_NOT_APPROVED');
 assert.equal(researchCloudDiagnostics({...data,health:{state:'CLOUD_UNAVAILABLE'}},now).state,'NO_CONNECTION');
 assert.equal(researchCloudDiagnostics({...data,budget:{state:'POLICY_ACTIVE',httpStatus:503}},now).state,'BUDGET_UNKNOWN');
 assert.equal(researchCloudDiagnostics(data,now+181000).state,'STALE_HEALTH');
});
