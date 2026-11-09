import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlsComparisonHistory} from './event-comparison-history.mjs';
import {compareBlsScheduledM5} from './macro-event-comparison.mjs';
const FIVE=300000,DAY=86400000,at=Date.UTC(2026,10,9,13,30),now=at+6*3600000;
const e={at,title:'Consumer Price Index',source:'BLS_OFFICIAL_CALENDAR',
 status:'SCHEDULED_NOT_RELEASED'};
const start=at-2*DAY-FIVE;
const bars=Array.from({length:625},(_,i)=>{
 const t=start+i*FIVE,price=200+i*0.003;
 return [t,String(price),String(price+0.1),String(price-0.1),
  String(price+0.01),'15',t+FIVE-1];
});
const storage=()=>{const map=new Map();return {
 getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),map
};};
test('stores first verified snapshot only and never overwrites with later result',()=>{
 const s=storage(),h=createBlsComparisonHistory({storage:s,now:()=>now});
 const report=compareBlsScheduledM5(e,bars,{now});
 assert.equal(report.state,'OBSERVED');
 assert.deepEqual(h.save(report),{state:'OK',saved:true,total:1});
 assert.deepEqual(h.save(report),{state:'OK',saved:false,total:1});
 const out=h.list();
 assert.equal(out.total,1);assert.equal(out.btc,1);
 assert.equal(out.entries[0].releaseVerified,false);
 assert.equal(out.entries[0].causalImpact,'NOT_ESTABLISHED');
 assert.equal(h.list({symbol:'ETHUSDT'}).total,0);
});
test('incomplete or synthetic outcomes never become research history',()=>{
 const h=createBlsComparisonHistory({storage:storage(),now:()=>now});
 const report=compareBlsScheduledM5(e,bars,{now});
 assert.equal(h.save({...report,releaseVerified:true}).state,'INVALID');
 assert.equal(h.save({...report,completeM5Candles:12}).state,'INVALID');
 assert.equal(h.save({...report,state:'OFFLINE'}).state,'INVALID');
 assert.equal(h.list().total,0);
});
test('corrupt local data and unavailable persistent storage fail closed',()=>{
 assert.equal(createBlsComparisonHistory({storage:null,now:()=>now})
  .list().state,'STORAGE_UNAVAILABLE');
 const s=storage();s.setItem('apex9:bls-m5-comparison-history:v1','oops');
 const h=createBlsComparisonHistory({storage:s,now:()=>now});
 assert.equal(h.list().state,'STORAGE_UNAVAILABLE');
});
