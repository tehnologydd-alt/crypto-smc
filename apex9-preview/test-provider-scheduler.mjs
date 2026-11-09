import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeteredScheduler} from './provider-scheduler.mjs';
const start=Date.UTC(2026,10,9,10);
const fake=()=>{const m=new Map();return {
 getItem:k=>m.has(k)?m.get(k):null,
 setItem:(k,v)=>m.set(k,v),m
};};
const policy={
 dailyLimit:3,monthlyLimit:12,minGapMs:3600000,estimatedCostCents:20,
 monthlyBudgetCents:100,reservedDaily:1,allowedHoursUtc:[10,11,12,15]
};
test('paid sources never run until explicitly enabled',()=>{
 const s=createMeteredScheduler({storage:fake(),now:()=>start});
 assert.equal(s.reserve('paid-index',policy).state,'DISABLED');
 assert.equal(s.evaluate('paid-index',policy).allowed,false);
});
test('spreads requests across allowed hours and reserves events',()=>{
 let at=start;
 const s=createMeteredScheduler({storage:fake(),now:()=>at});
 assert.equal(s.reserve('paid-index',policy,{enabled:true}).state,'RESERVED');
 assert.equal(s.reserve('paid-index',policy,{enabled:true}).state,'WAIT_INTERVAL');
 at+=3600000;
 assert.equal(s.reserve('paid-index',policy,{enabled:true}).state,'RESERVED');
 at+=3600000;
 assert.equal(s.reserve('paid-index',policy,{enabled:true}).state,'EVENT_SLOTS_RESERVED');
 assert.equal(s.reserve('paid-index',policy,{enabled:true,priority:'event'}).state,'RESERVED');
 assert.equal(s.reserve('paid-index',policy,{enabled:true,priority:'event'}).state,'QUOTA_REACHED');
});
test('monthly USD estimate blocks extra requests even when daily quota remains',()=>{
 let at=start;
 const p={...policy,monthlyBudgetCents:30};
 const s=createMeteredScheduler({storage:fake(),now:()=>at});
 assert.equal(s.reserve('paid-index',p,{enabled:true}).state,'RESERVED');
 at+=3600000;
 assert.equal(s.reserve('paid-index',p,{enabled:true}).state,'MONEY_BUDGET_REACHED');
});
test('only explicit UTC schedule hours are permitted',()=>{
 let at=Date.UTC(2026,10,9,14);
 const s=createMeteredScheduler({storage:fake(),now:()=>at});
 const r=s.evaluate('paid-index',policy,{enabled:true});
 assert.equal(r.state,'WAIT_SCHEDULE');
 assert.equal(r.nextAt,Date.UTC(2026,10,9,15));
 at+=3600000;
 assert.equal(s.reserve('paid-index',policy,{enabled:true}).state,'RESERVED');
});
test('missing storage or an unpriced provider fails closed',()=>{
 const s=createMeteredScheduler({now:()=>start});
 assert.equal(s.reserve('paid-index',policy,{enabled:true}).state,'STORAGE_UNAVAILABLE');
 const t=createMeteredScheduler({storage:fake(),now:()=>start});
 assert.equal(t.reserve('paid-index',{...policy,estimatedCostCents:0},
  {enabled:true}).state,'INVALID');
});
