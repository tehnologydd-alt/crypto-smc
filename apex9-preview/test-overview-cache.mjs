import test from 'node:test';
import assert from 'node:assert/strict';
import {createOverviewCache,checkedOverviewEvents} from './overview-cache.mjs';
const time=Date.UTC(2026,10,10,8);
const store=()=>{const x=new Map();return{getItem:k=>x.get(k)||null,
 setItem:(k,v)=>x.set(k,v),removeItem:k=>x.delete(k)}};
const global={state:'OK',marketCapUsd:2500000000000,totalVolumeUsd:100000000000,
 btcDominancePercent:60,marketCapChange24hPercent:-.7,observedAt:time};
const fear={value:32,observedAt:time};
const article={title:'Bitcoin network upgrade announced',href:'https://example.org/news',
 group:'news',observedAt:time-1000,importance:'RECENT_UNRANKED'};
test('reloaded cache preserves source-verified global and sentiment snapshots',()=>{
 const storage=store(),a=createOverviewCache({storage,now:()=>time});
 assert.equal(a.saveGlobal(global),true);
 assert.equal(a.saveFear(fear),true);
 const b=createOverviewCache({storage,now:()=>time+60000});
 assert.equal(b.readGlobal().value.marketCapUsd,2500000000000);
 assert.equal(b.readGlobal().fromCache,true);
 assert.equal(b.readFear().value.value,32);
});
test('bad market values, fake links and old events never enter snapshot cache',()=>{
 const storage=store(),c=createOverviewCache({storage,now:()=>time});
 assert.equal(c.saveGlobal({...global,marketCapUsd:-1}),false);
 assert.equal(c.saveFear({...fear,value:101}),false);
 assert.equal(c.saveEvents([{...article,href:'javascript:alert(1)'}]),false);
 assert.equal(c.saveEvents([{...article,observedAt:time-10*86400000}]),false);
 assert.equal(c.readEvents(),null);
});
test('events survive rejected newer refreshes, and become visibly historical',()=>{
 const storage=store();let current=time;
 const c=createOverviewCache({storage,now:()=>current});
 assert.equal(c.saveEvents([article]),true);
 const restored=createOverviewCache({storage,now:()=>current+3600000});
 assert.equal(restored.readEvents().value[0].title,article.title);
 assert.equal(restored.saveEvents([{...article,href:'http://invalid.example'}]),false);
 assert.equal(restored.readEvents().value.length,1);
 current+=8*86400000;
 assert.equal(c.readEvents(),null);
});
test('cache stores a maximum of five safe attributed headlines',()=>{
 const events=Array.from({length:15},(_,i)=>({
  ...article,title:'Event '+i,href:'https://example.org/'+i
 }));
 assert.equal(checkedOverviewEvents(events,time).length,5);
 assert.equal(checkedOverviewEvents([],time).length,0);
});
