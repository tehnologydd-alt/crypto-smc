import test from 'node:test';
import assert from 'node:assert/strict';
import {auditScheduledEventWindow,fetchScheduledEventReaction}
 from './macro-event-reaction.mjs';
const F=300000,at=Date.UTC(2026,10,9,13,30),now=at+6*3600000;
const event={at,title:'Consumer Price Index',source:'BLS_OFFICIAL_CALENDAR',
 status:'SCHEDULED_NOT_RELEASED'};
const bars=Array.from({length:49},(_,i)=>{
 const time=at-F+i*F;const price=100+i;
 return [time,String(price),String(price+1),String(price-1),
  String(price+0.5),'10',time+F-1];
});
test('fully closed and contiguous M5 yields exactly 15/60/240 minute observations',()=>{
 const r=auditScheduledEventWindow(event,bars,{now});
 assert.equal(r.state,'OBSERVED');
 assert.deepEqual(r.observations.map(x=>x.minutes),[15,60,240]);
 assert.equal(r.baselineClose,100.5);
 assert.equal(r.observations[0].closedAt,at+15*60000-1);
 assert.equal(r.observations[0].returnPercent,2.9851);
 assert.match(r.note,/NOT proof/);
});
test('missing bars, same-candle ambiguity and unfinished time are rejected',()=>{
 assert.equal(auditScheduledEventWindow(event,bars.slice(1),{now}).state,'INCOMPLETE');
 assert.equal(auditScheduledEventWindow(event,[...bars,bars[12]],{now}).state,'INVALID');
 assert.equal(auditScheduledEventWindow(event,bars,{now:at+60*60000}).state,'INELIGIBLE');
 assert.equal(auditScheduledEventWindow({...event,source:'UNKNOWN'},bars,{now}).state,'INELIGIBLE');
 const fake=bars.map(x=>[...x]);
 fake[6][2]='0';
 assert.equal(auditScheduledEventWindow(event,fake,{now}).state,'INVALID');
});
test('fetch requests only one bounded spot M5 history and never fabricates',async()=>{
 let n=0;
 const response=await fetchScheduledEventReaction(event,{now:()=>now,fetchImpl:async(url,options)=>{
  n++;const u=new URL(url);
  assert.equal(u.searchParams.get('interval'),'5m');
  assert.equal(u.searchParams.get('limit'),'60');
  assert.equal(u.searchParams.get('startTime'),String(at-F));
  assert.equal(options.method,'GET');
  return {ok:true,json:async()=>bars};
 }});
 assert.equal(n,1);assert.equal(response.state,'OBSERVED');
 assert.equal((await fetchScheduledEventReaction(event,{
  now:()=>now,fetchImpl:async()=>({ok:false,status:429})
 })).state,'RATE_LIMITED');
});
