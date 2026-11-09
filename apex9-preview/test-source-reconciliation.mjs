import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSources,NON_CONNECTED} from './source-reconciliation.mjs';
const now=Date.UTC(2026,10,9,12);
const source=(price,at=now-1000)=>({state:'OK',data:{priceUsd:price,observedAt:at},source:'NETWORK'});
test('compare only two fresh global USD asset aggregates, not Spot or wrapped DEX',()=>{
 const r=reconcileSources('ETHUSDT',{
  cmc:source(2000),paprika:source(2010),
  dex:source(2200),gecko:source(2199),
  okx:{state:'OK',data:{price:2010,observedAt:now-1000}}
 },{now});
 assert.equal(r.comparison.state,'CLOSE');
 assert.deepEqual(r.comparison.sources,['paprika','cmc']);
 assert.ok(r.comparison.deltaPercent>0.4&&r.comparison.deltaPercent<0.6);
 assert.equal(r.byGroup.VENUE_SPOT.checked,1);
 assert.equal(r.byGroup.GLOBAL_ASSET_USD.checked,2);
 assert.equal(r.byGroup.WRAPPED_TOKEN_DEX.checked,2);
 assert.equal(r.warning.includes('независимых'),true);
});
test('one missing or old USD provider never fakes agreement',()=>{
 const r=reconcileSources('BTCUSDT',{cmc:source(70000),
  paprika:{...source(71000,now-24*3600000),state:'STALE'}},{now});
 assert.equal(r.comparison.state,'INSUFFICIENT');
 assert.equal(r.usable,1);
 const s=reconcileSources('BTCUSDT',{}, {now});
 assert.equal(s.state,'NO_VERIFIED_OBSERVATIONS');
 assert.equal(s.checked,0);
 assert.equal(s.unavailable.find(x=>x.id==='reddit').state,'APPROVED_OAUTH_REQUIRED');
});
test('price differences are descriptive discrepancies, not trade opportunities',()=>{
 const r=reconcileSources('BTCUSDT',{cmc:source(100),paprika:source(110)},{now});
 assert.equal(r.comparison.state,'DIFFERENT');
 assert.ok(r.comparison.deltaPercent>9);
 assert.equal(r.scope,'OBSERVATIONS_ONLY_NOT_TRADE_OR_PREDICTION');
 assert.equal(NON_CONNECTED.newsdata,'SERVER_SECRET_REQUIRED');
});
test('provider response without validated timestamp cannot count as fresh',()=>{
 const r=reconcileSources('BTCUSDT',{
  cmc:{state:'OK',data:{priceUsd:100}},
  paprika:{state:'OK',data:{priceUsd:100,observedAt:now+10*60000}}
 },{now});
 assert.equal(r.usable,0);
 assert.equal(r.entries[0].recordStatus,'NO_RELIABLE_TIMESTAMP');
});
