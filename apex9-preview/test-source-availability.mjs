import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeDepthAvailability} from './source-availability.mjs';
import {chainForAsset} from './onchain-core.mjs';
import {chainHeadSourceForAsset} from './onchain-chain-head.mjs';

test('not-listed spot pairs differ from API outages and absent samples',()=>{
 assert.equal(describeDepthAvailability('bybit',{state:'NOT_LISTED'},0).state,
  'NOT_LISTED');
 assert.match(describeDepthAvailability('bybit',{state:'NOT_LISTED'},0).reason,
  /Spot-пара/);
 assert.equal(describeDepthAvailability('binance',{state:'RATE_LIMITED'},0).state,
  'RATE_LIMITED');
 assert.equal(describeDepthAvailability('binance',{state:'ACCESS_DENIED'},0).state,
  'ACCESS_DENIED');
 assert.equal(describeDepthAvailability('binance',{state:'OK'},0).state,
  'SAVE_PENDING');
 assert.equal(describeDepthAvailability('bybit',null,0).state,
  'NOT_CHECKED');
 assert.equal(describeDepthAvailability('bybit',null,12).state,
  'NOT_CHECKED');
 assert.equal(describeDepthAvailability('bybit',{state:'OFFLINE',
  error:'HTTP 500'},0).state,'OFFLINE');
 assert.equal(describeDepthAvailability('bybit',{state:'INVALID'},0).state,
  'INVALID');
});
test('token network availability must not inherit BTC or Ethereum samples',()=>{
 assert.equal(chainForAsset('TRBUSDT'),null);
 assert.equal(chainHeadSourceForAsset('TRBUSDT'),null);
 assert.notEqual(chainForAsset('BTCUSDT'),null);
 assert.notEqual(chainHeadSourceForAsset('BNBUSDT'),null);
});
test('switching assets in an open Data tab refreshes source statuses',()=>{
 const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 const liquidity=readFileSync(new URL('./liquidity-dashboard.mjs',import.meta.url),'utf8');
 const chain=readFileSync(new URL('./onchain-dashboard.mjs',import.meta.url),'utf8');
 const prepared=readFileSync(new URL('../apex9-android/scripts/prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(app.includes('liquidityDashboard.setSourceStatuses(chosen,snapshot.sources)'));
 assert.ok(app.includes('void onChainDashboard.refresh(symbol)'));
 assert.ok(liquidity.includes('describeVenue(venue,latestSources[venue.venue])'));
 assert.ok(chain.includes('Доступен поиск DEX-пулов двух публичных источников'));
 assert.ok(prepared.includes("'source-availability.mjs'"));
});
