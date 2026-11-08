import test from 'node:test';
import assert from 'node:assert/strict';
import {journalObservedStats} from './journal-stats.mjs';
const H=3600000,anchor=1700002799999,now=anchor+5*H;
function scenario(key,{outcome=null,close=null,status='COMPLETED'}={}){
 const target=anchor+4*H;
 return {id:'range1:'+key+':1h:'+anchor,asset:key,interval:'1h',
  publishedAt:anchor+1000,status,hypothesis:JSON.stringify({
   model:'EMPIRICAL_CLOSE_RANGE_V1',anchorCloseAt:anchor,targetCloseAt:target,
   anchorClose:100,bandLow:95,bandHigh:105
  }),stageEvents:[{stage:'PENDING_CONFIRMATION',
   observedAt:anchor+1000,recordedAt:anchor+1000}],
  evaluation:outcome?{
   outcome,actualClose:close,evaluatedAt:target+1000,targetCloseAt:target
  }:undefined};
}
test('all and selected research stats use the same verified source evidence',()=>{
 const rows=[
  scenario('BTCUSDT',{status:'PENDING_CONFIRMATION'}),
  scenario('ETHUSDT',{status:'CONFIRMED'}),
  scenario('GRAMUSDT',{outcome:'WITHIN_RANGE',close:100}),
  scenario('SOLUSDT',{outcome:'OUTSIDE_RANGE',close:108})
 ];
 const s=journalObservedStats(rows,{selectedIds:[rows[1].id,rows[3].id],
  totalPublished:12,now});
 assert.equal(s.all.total,4);
 assert.equal(s.tracked.total,2);
 assert.equal(s.all.within,1);
 assert.equal(s.tracked.outside,1);
 assert.equal(s.tracked.within,0);
 assert.equal(s.all.verifiedOutcomes,2);
 assert.equal(s.truncated,true);
 assert.equal(s.all.cancelled,undefined);
});
test('expired unobserved scenario is not a failed trade or cancellation',()=>{
 const row=scenario('BTCUSDT',{status:'ACTIVE'});
 const result=journalObservedStats([row],{now});
 assert.equal(result.all.unverifiedDue,1);
 assert.equal(result.all.outside,0);
 assert.equal(result.all.within,0);
});
test('contradictory final record cannot inflate observed successes',()=>{
 const forged=scenario('BTCUSDT',{outcome:'WITHIN_RANGE',close:200});
 const result=journalObservedStats([forged],{now});
 assert.equal(result.all.inconsistent,1);
 assert.equal(result.all.verifiedOutcomes,0);
 assert.equal(result.all.within,0);
});
