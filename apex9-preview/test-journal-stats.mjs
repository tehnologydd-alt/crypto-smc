import test from 'node:test';import assert from 'node:assert/strict';
import {journalObservedStats} from './journal-stats.mjs';
test('tracked stats are disjoint from all view and never invent TP or cancellation',()=>{
 const rows=[
  {id:'a',status:'PENDING_CONFIRMATION'},
  {id:'b',status:'CONFIRMED'},
  {id:'c',status:'COMPLETED',evaluation:{outcome:'WITHIN_RANGE'}},
  {id:'d',status:'COMPLETED',evaluation:{outcome:'OUTSIDE_RANGE'}}];
 const s=journalObservedStats(rows,{selectedIds:['b','d'],totalPublished:12});
 assert.equal(s.all.total,4);assert.equal(s.tracked.total,2);
 assert.equal(s.all.within,1);assert.equal(s.tracked.outside,1);
 assert.equal(s.truncated,true);
 assert.equal(s.all.cancelled,undefined);
});
