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
