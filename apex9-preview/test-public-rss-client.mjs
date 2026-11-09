import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublicRssNews,parsePublicRssResponse} from './public-rss-client.mjs';
const now=Date.UTC(2026,10,9,20);
const story={title:'Bitcoin network update from publisher',
 href:'https://www.coindesk.com/markets/2026/11/09/bitcoin-network-update',
 observedAt:now-180000,timeKind:'PUBLISHED',
 source:'CoinDesk RSS',notDirectionalEvidence:true};
test('real RSS metadata is passed only when native source reports a valid reply',async()=>{
 const r=await fetchPublicRssNews({plugin:{fetchPublicRssNews:async()=>({
  state:'OK',articles:[story],fetchedAt:now-10000,cached:false,
  sources:{'CoinDesk RSS':{state:'OK',count:1},
   'Decrypt RSS':{state:'HTTP_403',count:0},
   'Cointelegraph RSS':{state:'TIMEOUT',count:0}}
 })},now:()=>now});
 assert.equal(r.state,'OK');assert.equal(r.articles.length,1);
 assert.equal(r.sources['CoinDesk RSS'].count,1);
 assert.equal(r.sources['Decrypt RSS'].state,'HTTP_403');
 assert.equal(r.sources['Cointelegraph RSS'].state,'TIMEOUT');
 assert.equal(r.articles[0].source,'CoinDesk RSS');
 assert.equal(r.cached,false);
 assert.equal(r.fetchedAt,now-10000);
});
test('no network response, no invented news or connection',async()=>{
 assert.equal((await fetchPublicRssNews({plugin:null})).state,'ANDROID_ONLY');
 const offline=parsePublicRssResponse({state:'OFFLINE',
  sources:{'CoinDesk RSS':{state:'HTTP_500',count:0}}},{now});
 assert.equal(offline.state,'OFFLINE');assert.equal(offline.articles.length,0);
 assert.equal(offline.sources['CoinDesk RSS'].state,'HTTP_500');
});
test('RSS cache and stale items keep their age and remove unsafe URLs',()=>{
 const r=parsePublicRssResponse({state:'STALE',articles:[story,
  {...story,href:'javascript:alert(1)',source:'Decrypt RSS'},
  {...story,source:'UnknownPublisher'},
  {...story,observedAt:now-4*86400000,source:'Decrypt RSS'}
 ],cached:true,fetchedAt:now-3600000},{now});
 assert.equal(r.state,'STALE');assert.equal(r.articles.length,1);
 assert.equal(r.cached,true);assert.equal(r.articles[0].source,'CoinDesk RSS');
});
test('HTTP 200 with no qualifying RSS items is EMPTY, not connected content',()=>{
 const r=parsePublicRssResponse({state:'EMPTY',articles:[],
  sources:{'Decrypt RSS':{state:'EMPTY',count:0}}},{now});
 assert.equal(r.state,'EMPTY');assert.equal(r.articles.length,0);
 assert.equal(r.sources['Decrypt RSS'].state,'EMPTY');
});
