import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCloudAuditEvidence,initCloudAiAudit,
 checkCloudAiLanguageBudget,explainCloudAiAuditFailure} from './cloud-ai-manual-audit.mjs';

const now=1_794_588_000_000;
const quote={symbol:'ETHUSDT',scope:'24H_SPOT_SNAPSHOT',
 observedAt:now-15000,receivedAt:now-12000,
 price:2123.45,changePercent:-2.1,quoteVolume:300000};
const row=(data={})=>({
 asset:'ETHUSDT',source:'okx:spot:depth',kind:'liquidity',
 sourceState:'OK',observedAt:now-9000,collectedAt:now-8000,
 payload:JSON.stringify({bestBid:2123.4,bestAsk:2123.5,spreadBps:.45,
  visibleDepthImbalance:.2,privateApiKey:'NEVER_FORWARD_THIS'}),...data
});

test('verified ticker is forwarded with provenance, not a prediction',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',ticker:quote,now});
 assert.equal(got.length,1);
 assert.match(got[0].source_id,/binance:spot:24h:ETHUSDT:/);
 assert.match(got[0].text,/last 24h change/);
 assert.match(got[0].text,/not a prediction/);
});
test('fresh saved exchange depth is accepted but not raw private fields',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',rows:[row()],now});
 assert.equal(got.length,1);
 assert.match(got[0].text,/source okx:spot:depth/);
 assert.doesNotMatch(JSON.stringify(got),/NEVER_FORWARD_THIS|privateApiKey/);
});
test('unverified, stale and mismatched observations cannot enter evidence',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',rows:[
  row({sourceState:'INVALID'}),
  row({asset:'BTCUSDT'}),
  row({observedAt:now-200000,collectedAt:now-100000}),
  row({source:'attacker:spot:depth'}),
  row({payload:'invalid json'}),
  row({payload:JSON.stringify({bestBid:1,bestAsk:.1,spreadBps:0,
   visibleDepthImbalance:0})})
 ],ticker:{...quote,observedAt:now-190000},now});
 assert.deepEqual(got,[]);
});
test('at most one newest source-scoped snapshot per venue; no unsupported asset',()=>{
 const got=buildCloudAuditEvidence({asset:'ETHUSDT',rows:[
  row(),row({observedAt:now-10000,collectedAt:now-9000}),
  row({source:'binance:spot:depth',observedAt:now-8000})
 ],ticker:quote,now});
 assert.equal(got.length,3);
 assert.equal(got.filter(x=>x.source_id.startsWith('okx')).length,1);
 assert.deepEqual(buildCloudAuditEvidence({asset:'not a symbol',ticker:quote,now}),[]);
});
test('UI uses opt-in model buttons and packaged module',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 for(const id of ['apex-ai-test-asset','apex-ai-test-analyst',
  'apex-ai-test-critic','apex-ai-test-status','apex-ai-test-output'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/initCloudAiAudit\(/);
 assert.match(app,/cloudAiEvidenceAudit/);
 assert.match(stage,/'cloud-ai-manual-audit\.mjs'/);
});


function auditPickerDom(){
 const make=()=>({
  value:'',textContent:'',disabled:false,hidden:false,children:[],listeners:new Map(),
  addEventListener(name,handler){this.listeners.set(name,handler);},
  replaceChildren(){this.children=[];this.value='';},
  append(child){this.children.push(child);if(this.children.length===1)this.value=child.value;}
 });
 const nodes=new Map();
 for(const id of ['apex-ai-test-asset','apex-ai-test-status','apex-ai-test-output',
  'apex-ai-test-analyst','apex-ai-test-critic'])nodes.set(id,make());
 return {nodes,document:{
  getElementById:id=>nodes.get(id),
  createElement:()=>make()
 }};
}

test('AI picker updates after delayed favorites hydration and subsequent changes',()=>{
 const oldDocument=globalThis.document;
 const dom=auditPickerDom();
 globalThis.document=dom.document;
 let favorites=[],attempts=0;
 try{
  const picker=initCloudAiAudit({
   getFavorites:()=>favorites,
   getSelectedAsset:()=> 'BTCUSDT',
   getHistory:async()=>({native:true,observations:[]}),
   fetchTicker:async()=>({state:'EMPTY'}),
   getPairing:async()=>{attempts++;return {state:'NOT_PAIRED'};},
   getBudget:async()=>({}),runAudit:async()=>{attempts++;return {};},
   refreshMonitor:async()=>{}
  });
  const select=dom.nodes.get('apex-ai-test-asset');
  const analyst=dom.nodes.get('apex-ai-test-analyst');
  const critic=dom.nodes.get('apex-ai-test-critic');
  assert.equal(select.disabled,true);
  assert.equal(analyst.disabled,true);
  assert.equal(critic.disabled,true);
  assert.match(select.children[0].textContent,/Нет избранных/);
  assert.match(dom.nodes.get('apex-ai-test-status').textContent,/Каталог/);
  // The user did not reopen Settings; asynchronous onFavoritesChanged calls sync.
  favorites=['BTCUSDT','ETHUSDT','ETHUSDT','bad-symbol'];
  picker.sync();
  assert.deepEqual(select.children.map(c=>c.value),
   ['BTCUSDT','ETHUSDT','ETHUSDT']);
  assert.equal(select.value,'BTCUSDT');
  assert.equal(select.disabled,false);
  assert.equal(analyst.disabled,false);
  assert.equal(critic.disabled,false);
  select.value='ETHUSDT';
  picker.sync();
  assert.equal(select.value,'ETHUSDT');
  favorites=['SOLUSDT','ETHUSDT'];
  picker.sync();
  assert.equal(select.value,'ETHUSDT');
  favorites=['SOLUSDT'];
  picker.sync();
  assert.equal(select.value,'SOLUSDT');
  favorites=[];
  picker.sync();
  assert.equal(select.disabled,true);
  assert.equal(analyst.disabled,true);
  assert.equal(critic.disabled,true);
  assert.equal(attempts,0,'changes to favorites cannot send a model request');
 }finally{
  if(oldDocument===undefined)delete globalThis.document;
  else globalThis.document=oldDocument;
 }
});

test('Android favorites refresh is wired both to native hydration and edits',()=>{
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 assert.match(app,/onFavoritesChanged:.*?cloudAiAudit\?\.sync\(\)/s);
 assert.match(app,/favoritesReady\.then\(\(\)=>\{\s*cloudAiAudit\.sync\(\);cloudAiCollective\.sync\(\)/);
 assert.match(app,/getFavorites:\(\)=>favoriteManager\.getFavorites\(\)/);
});

test('shared five-minute cooldown blocks Qwen after GLM without spending another attempt',()=>{
 const now=Date.parse('2026-11-13T17:47:00Z');
 const budget={state:'POLICY_ACTIVE',httpStatus:200,clock:{mode:'ACTIVE'},
  usage:{language:{dailyUsed:1,dailyLimit:12,monthlyUsed:1,monthlyLimit:280,
   nightUsed:0,nightLimit:1,nextEligibleAt:now+5*60000}}};
 const blocked=checkCloudAiLanguageBudget(budget,now);
 assert.equal(blocked.allowed,false);
 assert.equal(blocked.reason,'COOLDOWN');
 assert.match(blocked.message,/19:52/);
 assert.match(blocked.message,/общую паузу/);
 const ready=checkCloudAiLanguageBudget(budget,now+5*60000);
 assert.equal(ready.allowed,true);
 assert.equal(ready.reason,'READY');
});

test('language quota reports daily, monthly, night and unverified separately',()=>{
 const at=Date.parse('2026-11-13T22:10:00Z');
 const b={state:'POLICY_ACTIVE',httpStatus:200,clock:{mode:'ECO'},
  usage:{language:{dailyUsed:1,dailyLimit:12,monthlyUsed:1,monthlyLimit:280,
   nightUsed:1,nightLimit:1,nextEligibleAt:at+3600000}}};
 assert.equal(checkCloudAiLanguageBudget(b,at).reason,'NIGHT');
 assert.equal(checkCloudAiLanguageBudget({...b,clock:{mode:'ACTIVE'}},at).reason,'COOLDOWN');
 assert.equal(checkCloudAiLanguageBudget({...b,usage:{language:{...b.usage.language,
  dailyUsed:12}}},at).reason,'DAILY');
 assert.equal(checkCloudAiLanguageBudget({...b,usage:{language:{...b.usage.language,
  monthlyUsed:280}}},at).reason,'MONTHLY');
 assert.equal(checkCloudAiLanguageBudget({...b,httpStatus:401},at).reason,'UNVERIFIED');
 assert.equal(checkCloudAiLanguageBudget({...b,usage:{language:{...b.usage.language,
  dailyUsed:-1}}},at).reason,'INVALID');
});

test('native AI read timeout is separate from short status timeout and records failures',()=>{
 const android=readFileSync(new URL(
  '../apex9-android/native/src/main/java/com/apexintelligence/research/ApexAiDevice.kt',
  import.meta.url),'utf8');
 assert.match(android,/conn\.readTimeout = if \(path == "\/v1\/agents\/analyze"\) 120_000 else 8_000/);
 assert.match(android,/MODEL_RESPONSE_TIMEOUT/);
 assert.match(android,/MODEL_NETWORK_UNAVAILABLE/);
 assert.match(android,/rememberAudit\(ctx, role, result\)/);
 assert.doesNotMatch(android,/retryAiEvidence/);
});

test('model timeout message never suggests retry and does not fake a quota denial',()=>{
 const msg=explainCloudAiAuditFailure({state:'MODEL_RESPONSE_TIMEOUT'},'critic');
 assert.match(msg,/Qwen3.8-27B/);
 assert.match(msg,/120 секундами/);
 assert.match(msg,/Автоматического повтора нет/);
 assert.doesNotMatch(msg,/дневной лимит исчерпан/);
 const native=readFileSync(new URL(
  '../apex9-android/native/src/main/java/com/apexintelligence/research/ApexAiDevice.kt',
  import.meta.url),'utf8');
 assert.match(native,/android\.os\.SystemClock\.elapsedRealtime\(\) - sentAt/);
 assert.match(native,/putString\("lastAuditState_" \+ role, state\)/);
 assert.match(native,/put\("lastState", store\.getString\("lastAuditState_"/);
 assert.doesNotMatch(native,/retry[A-Za-z]*\(ctx/);
});
