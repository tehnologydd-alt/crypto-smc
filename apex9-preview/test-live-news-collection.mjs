import test from 'node:test';
import assert from 'node:assert/strict';
import {composeLiveNews,sourceStatusLine} from './live-news-collection.mjs';
const now=Date.UTC(2026,10,9,20);
const story={title:'Bitcoin developers announce research update',
 href:'https://www.coindesk.com/research/bitcoin-developers',
 source:'CoinDesk RSS',observedAt:now-70000,timeKind:'PUBLISHED'};
test('GDELT local WAIT_INTERVAL must not hide a genuine RSS network response',()=>{
 const merged=composeLiveNews({
  gdelt:{state:'WAIT_INTERVAL',articles:[]},
  rss:{state:'OK',articles:[story],fetchedAt:now-2000,
   sources:{'CoinDesk RSS':{state:'OK',count:1},
    'Decrypt RSS':{state:'HTTP_403',count:0}}},
  personal:{state:'NO_VERIFIED_NEWS',
   providers:{cryptopanic:'NOT_CONFIGURED',newsdata:'NOT_CONFIGURED'}}
 },{now});
 assert.equal(merged.state,'OK');
 assert.equal(merged.articles.length,1);
 assert.equal(merged.fetchedAt,now-2000);
 assert.equal(merged.sources.GDELT,'WAIT_INTERVAL');
 assert.equal(merged.sources['CoinDesk RSS'].count,1);
 assert.match(sourceStatusLine(merged.sources),/пауза локального лимита/);
 assert.match(sourceStatusLine(merged.sources),/HTTP 403/);
});
test('archived data cannot become live news, and indexer duplicates are merged',()=>{
 const rss={state:'STALE',articles:[{...story,outdated:true}]};
 const gdelt={state:'OK',articles:[{...story,source:'GDELT',timeKind:'INDEXED'}]};
 const mixed=composeLiveNews({rss,gdelt},{now});
 assert.equal(mixed.articles.length,1);
 assert.deepEqual(new Set(mixed.articles[0].indexedBy),
  new Set(['GDELT','CoinDesk RSS']));
 assert.equal(mixed.state,'OK');
 const old=composeLiveNews({rss},{now});
 assert.equal(old.state,'STALE');assert.equal(old.articles[0].outdated,true);
});
test('unconfigured, offline and throttled services never count as live',()=>{
 const r=composeLiveNews({gdelt:{state:'WAIT_INTERVAL'},
  rss:{state:'OFFLINE'},personal:{providers:{
   newsdata:'INVALID_CREDENTIALS',cryptopanic:'NOT_CONFIGURED'}}
 },{now});
 assert.equal(r.state,'UNAVAILABLE');
 assert.equal(r.articles.length,0);
 assert.match(sourceStatusLine(r.sources),/ключ отклонён/);
});
