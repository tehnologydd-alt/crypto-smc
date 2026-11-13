import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initCloudAiCollective,validateCollectiveSession,
 mergeResearchEvidence,collectiveCoverage} from './cloud-ai-collective.mjs';
const at=Date.parse('2026-11-13T18:40:00Z');
const source=(sym='BTCUSDT',time=at-15000)=>({
 source_id:'binance:spot:24h:'+sym+':'+time,observed_at:time,
 text:'Asset '+sym+'; historical verified public snapshot at '+new Date(time).toISOString()
});
const session={version:1,asset:'BTCUSDT',startedAt:at,stage:'ANALYST_READY',
 evidence:[source()],sourceIds:[source().source_id],
 analystText:'The snapshot cannot establish any future direction.'};
test('only bounded source-matched local session can resume',()=>{
 assert.ok(validateCollectiveSession(session,at+5*60000));
 assert.equal(validateCollectiveSession({...session,sourceIds:['forged']},at+5*60000),null);
 assert.equal(validateCollectiveSession(session,at+61*60000),null);
 assert.equal(validateCollectiveSession({...session,analystText:'oops'},at),null);
 assert.equal(validateCollectiveSession({...session,stage:'COMPLETE'},at),null);
 assert.equal(collectiveCoverage(session).startsWith('Один тип источника'),true);
});
test('critic receives both frozen and new timestamps, never overwrites evidence',()=>{
 const newer=source('BTCUSDT',at+300000);
 const merged=mergeResearchEvidence([source()],[newer,source()]);
 assert.equal(merged.length,2);
 assert.equal(merged[0].observed_at,at-15000);
 assert.equal(merged[1].observed_at,at+300000);
});
function ui(){
 const elements=new Map();
 function element(id){
  if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',
   hidden:false,disabled:false,listeners:new Map(),
   addEventListener(type,cb){this.listeners.set(type,cb);},
   trigger(type){this.listeners.get(type)?.();}});
  return elements.get(id);
 }
 for(const id of ['apex-ai-test-asset','apex-ai-collective-start',
  'apex-ai-collective-review','apex-ai-collective-status',
  'apex-ai-collective-coverage','apex-ai-collective-analyst-output',
  'apex-ai-collective-critic-output'])element(id);
 element('apex-ai-test-asset').value='BTCUSDT';
 return {getElementById:element,element};
}
function storage(){
 const map=new Map();return {getItem:k=>map.get(k)||null,
  setItem:(k,v)=>map.set(k,v)};
}
async function settle(){await new Promise(resolve=>setImmediate(resolve));}
test('two manual clicks share budget, preserve analyst provenance, and persist critique',async()=>{
 const original=globalThis.document,dom=ui(),store=storage();
 globalThis.document=dom;
 let t=at,count=0,waitUntil=0,budgetReads=0;
 const ticker=()=>({state:'OK',data:{symbol:'BTCUSDT',scope:'24H_SPOT_SNAPSHOT',
  observedAt:t-15000,receivedAt:t-12000,price:68000,
  changePercent:-1,quoteVolume:110000}});
 try{
  const args={
   getFavorites:()=>['BTCUSDT'],getHistory:async()=>({native:true,observations:[]}),
   fetchTicker:async()=>ticker(),getPairing:async()=>({state:'APPROVED'}),
   getBudget:async()=>{budgetReads++;return {state:'POLICY_ACTIVE',httpStatus:200,
    clock:{mode:'ACTIVE'},usage:{language:{dailyUsed:count,dailyLimit:12,
    monthlyUsed:count,monthlyLimit:280,nightUsed:0,nightLimit:1,
    nextEligibleAt:waitUntil}}};},
   runAudit:async(role,evidence,options)=>{
    count++;
    if(role==='analyst'){
     assert.equal(options.analyst,undefined);
     assert.equal(evidence.length,1);
    }else{
     assert.equal(options.analyst.text,'GLM considered the snapshot insufficient for prediction.');
     assert.equal(options.analyst.source_ids.length,1);
     assert.equal(evidence.length,2,'old baseline and new snapshot must both be kept');
     assert.notEqual(evidence[0].observed_at,evidence[1].observed_at);
    }
    waitUntil=t+5*60000;
    return {httpStatus:200,state:'OBSERVED_MODEL_OUTPUT',role,
     text:role==='analyst'?
      'GLM considered the snapshot insufficient for prediction.':
      'Qwen finds no grounds for strong causal inference.',
     source_ids:evidence.map(e=>e.source_id)};
   },
   refreshMonitor:async()=>{},store,now:()=>t
  };
  const flow=initCloudAiCollective(args);
  assert.equal(count,0);
  assert.equal(dom.element('apex-ai-collective-review').disabled,true);
  dom.element('apex-ai-collective-start').trigger('click');await settle();
  assert.equal(count,1);
  assert.equal(flow.getSession().stage,'ANALYST_READY');
  assert.equal(dom.element('apex-ai-collective-review').disabled,false);
  dom.element('apex-ai-collective-review').trigger('click');await settle();
  assert.equal(count,1,'cooldown cannot spend attempts');
  assert.match(dom.element('apex-ai-collective-status').textContent,/пауз/);
  t+=6*60000;dom.element('apex-ai-collective-review').trigger('click');await settle();
  assert.equal(count,2);
  assert.equal(flow.getSession().stage,'COMPLETE');
  assert.match(dom.element('apex-ai-collective-critic-output').textContent,/Qwen/);
  const reloaded=initCloudAiCollective({...args,getBudget:async()=>{throw Error('no automatic checks')}});
  assert.equal(reloaded.getSession().stage,'COMPLETE');
  assert.equal(count,2,'reopen must not run models');
  assert.ok(budgetReads>=3);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
test('integration includes compact two-step UI and Android staging',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 for(const id of ['apex-ai-collective-start','apex-ai-collective-review',
  'apex-ai-collective-status','apex-ai-collective-analyst-output',
  'apex-ai-collective-critic-output'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/initCloudAiCollective\(/);
 assert.match(stage,/'cloud-ai-collective\.mjs'/);
});

test('collective critic timeout produces a clear message, preserves GLM session, no retries',async()=>{
 const original=globalThis.document,dom=ui(),store=storage();
 globalThis.document=dom;
 const sourceTime=at-16000,old={...session,
  evidence:[source('BTCUSDT',sourceTime)],
  sourceIds:[source('BTCUSDT',sourceTime).source_id]};
 store.setItem('apex.collective.research.v1',JSON.stringify(old));
 let count=0;
 try{
  const c=initCloudAiCollective({
   getFavorites:()=>['BTCUSDT'],
   getHistory:async()=>({native:true,observations:[]}),
   fetchTicker:async()=>({state:'OK',data:{symbol:'BTCUSDT',scope:'24H_SPOT_SNAPSHOT',
    observedAt:at+5*60000-10000,receivedAt:at+5*60000-8000,
    price:68500,changePercent:-1,quoteVolume:300000}}),
   getPairing:async()=>({state:'APPROVED'}),
   getBudget:async()=>({state:'POLICY_ACTIVE',httpStatus:200,
    clock:{mode:'ACTIVE'},usage:{language:{dailyUsed:2,dailyLimit:12,
     monthlyUsed:2,monthlyLimit:280,nightUsed:0,nightLimit:1,
     nextEligibleAt:at}}}),
   runAudit:async()=>{count++;return {state:'MODEL_RESPONSE_TIMEOUT'};},
   refreshMonitor:async()=>{},store,now:()=>at+5*60000
  });
  dom.element('apex-ai-collective-review').trigger('click');await settle();
  assert.equal(count,1);
  assert.equal(c.getSession().stage,'ANALYST_READY');
  assert.match(dom.element('apex-ai-collective-status').textContent,/телефон не дождался ответа/);
  assert.equal(dom.element('apex-ai-collective-review').disabled,false);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
