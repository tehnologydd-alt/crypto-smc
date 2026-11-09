import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceHealth} from './source-health.mjs';
const now=Date.UTC(2026,10,9,20);
test('do not call adapters connected when they were never queried',()=>{
 const r=sourceHealth(null,{checkedAt:now});
 assert.equal(r.state,'NOT_QUERIED');assert.equal(r.usable,false);
 assert.match(r.message,/не выполнялся/);
});
test('network result and locally cached result are explicitly different',()=>{
 const net=sourceHealth({state:'OK',source:'NETWORK',fetchedAt:now-3000,
  data:{observedAt:now-4000}},{checkedAt:now,asset:'BTCUSDT'});
 assert.equal(net.usable,true);assert.equal(net.cached,false);
 assert.match(net.message,/проверенный формат API/);
 const cache=sourceHealth({state:'OK',source:'CACHE',fetchedAt:now-3600000},
  {checkedAt:now});
 assert.equal(cache.usable,true);assert.equal(cache.cached,true);
 assert.match(cache.message,/сохранённый ответ/);
});
test('WAIT_INTERVAL is local quota, not a claimed provider outage',()=>{
 const r=sourceHealth({state:'WAIT_INTERVAL',
  quota:{nextAt:now+600000},reason:'Next source request scheduled later'},
  {checkedAt:now});
 assert.equal(r.usable,false);
 assert.match(r.message,/Пауза локального лимита/);
 assert.match(r.message,/повтор не раньше/);
 const stale=sourceHealth({state:'STALE',sourceState:'OFFLINE',
  fetchedAt:now-86400000},{checkedAt:now});
 assert.equal(stale.usable,false);
 assert.match(stale.message,/Только локальный архив/);
});
