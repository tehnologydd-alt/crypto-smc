import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPARE_VERSION,compareBlsScheduledM5,fetchBlsM5Comparison}
 from './macro-event-comparison.mjs';
const FIVE=300000,DAY=86400000,at=Date.UTC(2026,10,9,13,30);
const now=at+6*3600000;
const event={at,title:'Consumer Price Index',
 source:'BLS_OFFICIAL_CALENDAR',status:'SCHEDULED_NOT_RELEASED'};
const start=at-2*DAY-FIVE;
const bars=Array.from({length:625},(_,i)=>{
 const t=start+i*FIVE;
 const price=100+(i<49?i*0.01:i<337?0.5+i*0.001:1+i*0.004);
 return [t,String(price),String(price+0.04),String(price-0.04),
  String(price+0.01),'20',t+FIVE-1];
});
test('one 625-bar Spot M5 response compares same UTC clock on 3 separate days',()=>{
 const report=compareBlsScheduledM5(event,bars,{now,symbol:'BTCUSDT'});
 assert.equal(report.state,'OBSERVED');
 assert.equal(report.version,COMPARE_VERSION);
 assert.equal(report.completeM5Candles,625);
 assert.deepEqual(report.controlsAt,[at-DAY,at-2*DAY]);
 assert.deepEqual(report.comparison.map(x=>x.minutes),[15,60,240]);
 assert.ok(report.comparison.every(x=>x.priorSamples===2));
 assert.equal(report.causalImpact,'NOT_ESTABLISHED');
 assert.equal(report.releaseVerified,false);
 assert.equal(report.statisticalSignificance,'NOT_EVALUATED');
 assert.equal(report.comparison[0].eventReturnPercent!==undefined,true);
});
test('gap, duplicate, out-of-range, invalid price and unfinished windows fail closed',()=>{
 assert.equal(compareBlsScheduledM5(event,bars.slice(1),{now}).state,'INCOMPLETE');
 const duplicate=bars.map(x=>[...x]);duplicate[120]=duplicate[119];
 assert.equal(compareBlsScheduledM5(event,duplicate,{now}).state,'INVALID');
 const corrupt=bars.map(x=>[...x]);corrupt[500][4]='-1';
 assert.equal(compareBlsScheduledM5(event,corrupt,{now}).state,'INVALID');
 assert.equal(compareBlsScheduledM5(event,bars,{now:at+3600000}).state,'INELIGIBLE');
 assert.equal(compareBlsScheduledM5({...event,source:'GDELT'},bars,{now}).state,'INELIGIBLE');
 assert.equal(compareBlsScheduledM5(event,bars,{now,symbol:'SOLUSDT'}).state,'INELIGIBLE');
});
test('the entire 52h5m period uses exactly one no-key Binance query',async()=>{
 let n=0;
 const r=await fetchBlsM5Comparison(event,{now:()=>now,symbol:'ETHUSDT',
  fetchImpl:async(url,args)=>{
   n++;
   const u=new URL(url);
   assert.equal(u.hostname,'data-api.binance.vision');
   assert.equal(u.searchParams.get('interval'),'5m');
   assert.equal(u.searchParams.get('timeZone'),'0');
   assert.equal(u.searchParams.get('limit'),'650');
   assert.equal(u.searchParams.get('startTime'),String(start));
   assert.equal(u.searchParams.get('endTime'),String(at+48*FIVE-1));
   assert.equal(args.credentials,'omit');
   return {ok:true,json:async()=>bars};
  }});
 assert.equal(n,1);assert.equal(r.state,'OBSERVED');
 assert.equal(r.symbol,'ETHUSDT');
 assert.equal((await fetchBlsM5Comparison(event,{now:()=>now,
  fetchImpl:async()=>({ok:false,status:429})})).state,'RATE_LIMITED');
});
test('comparison does not fabricate release time, money outcomes or statistical accuracy',()=>{
 const report=compareBlsScheduledM5(event,bars,{now});
 assert.equal(report.releaseVerified,false);
 assert.ok(report.comparison.every(x=>typeof x.differenceAbsolutePp==='number'));
 assert.equal(Object.hasOwn(report,'winRate'),false);
 assert.equal(Object.hasOwn(report,'profit'),false);
 assert.equal(Object.hasOwn(report,'confidence'),false);
});
