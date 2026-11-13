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
