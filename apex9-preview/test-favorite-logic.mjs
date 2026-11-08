import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeFavorites,forecastStage,journalCounts,FAVORITES_MAX} from './favorite-logic.mjs';
test('distinct favorites retain their user order with a ten-asset cap',()=>{
 const x=Array.from({length:13},(_,i)=>'COIN'+i+'USDT');
 const r=sanitizeFavorites([x[0],x[0],...x,' bad']);
 assert.equal(r.length,FAVORITES_MAX);
 assert.deepEqual(r, x.slice(0,10));
});
test('no built-in fixed coins; unknown stages never claim completion',()=>{
 assert.deepEqual(sanitizeFavorites(null),[]);
 assert.equal(forecastStage({status:'PUBLISHED'}),'PENDING_CONFIRMATION');
 const counts=journalCounts([{status:'CONFIRMED'},{status:'ACTIVE'},{status:'COMPLETED'},{}]);
 assert.deepEqual(counts,{PENDING_CONFIRMATION:1,CONFIRMED:1,ACTIVE:1,COMPLETED:1});
});
