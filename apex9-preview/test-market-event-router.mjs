import test from 'node:test';
import assert from 'node:assert/strict';
import {routeGlobalEvents,assetHeadlineMatches,routeAssetNews} from './market-event-router.mjs';
import {parseBlueskyPosts,fetchBlueskyPosts,socialQuery} from './social-public.mjs';
const now=Date.UTC(2026,10,9,12);
const news={state:'OK',articles:[
 {title:'Bitcoin ETF regulation update',href:'https://example.org/1',observedAt:now-60000},
 {title:'Football news',href:'https://example.org/2',observedAt:now-30000}
]};
const macro={state:'OK',articles:[
 {title:'Federal Reserve interest rates update',href:'https://example.org/3',observedAt:now-20000}
]};
const cal={state:'OK',events:[{id:'1',title:'Consumer Price Index',
 source:'BLS_OFFICIAL_CALENDAR',status:'SCHEDULED_NOT_RELEASED',
 at:now+3600000,sourceUrl:'https://www.bls.gov/schedule/news_release/'}]};
test('overview global events are only source-grounded with topic selection',()=>{
 const all=routeGlobalEvents(news,macro,cal,{now});
 assert.equal(all.length,3);
 assert.equal(all[0].group,'macro');
 assert.equal(all[2].group,'calendar');
 assert.ok(all.every(x=>x.importance!=='VERIFIED_PRICE_IMPACT'));
 assert.equal(routeGlobalEvents({state:'OFFLINE',articles:news.articles},
  {state:'OFFLINE',articles:macro.articles},null,{now}).length,0);
});
test('specific asset name matching disallows ticker substring false positives',()=>{
 assert.equal(assetHeadlineMatches('BTCUSDT','Bitcoin ETF approved'),true);
 assert.equal(assetHeadlineMatches('ETHUSDT','Ethereum launch'),true);
 assert.equal(assetHeadlineMatches('LINKUSDT','New links today'),false);
 assert.equal(assetHeadlineMatches('GRAMUSDT','Toncoin network update'),true);
 assert.equal(assetHeadlineMatches('BTCUSDT','CPI inflation data'),false);
 const result=routeAssetNews('ETHUSDT',{state:'OK',data:{articles:[
  {title:'Bitcoin ETF update',url:'https://x.test/1',seenAt:now},
  {title:'Ethereum protocol update',url:'https://x.test/2',seenAt:now}
 ]}});
 assert.equal(result.length,1);
 assert.equal(result[0].scope,'NAME_MATCH_NOT_VERIFIED_IMPACT');
});
test('Bluesky public posts are URL-bounded, dated and not classified as signals',async()=>{
 assert.equal(socialQuery('GRAMUSDT'),'Toncoin');
 const q='at://did:plc:abc123/app.bsky.feed.post/3abcXYZ';
 const payload={posts:[
  {uri:q,author:{handle:'alice.bsky.social'},record:{text:'Bitcoin discussion'},indexedAt:new Date(now-10000).toISOString()},
  {uri:q,author:{handle:'alice.bsky.social'},record:{text:'duplicate'},indexedAt:new Date(now-10000).toISOString()},
  {uri:'https://evil.example/123',author:{handle:'u.bsky.social'},record:{text:'bad'},indexedAt:new Date(now).toISOString()}
 ]};
 const r=parseBlueskyPosts(payload,{symbol:'BTCUSDT',receivedAt:now});
 assert.equal(r.state,'OK');assert.equal(r.posts.length,1);
 assert.match(r.posts[0].href,/^https:\/\/bsky\.app\/profile\//);
 assert.equal(r.posts[0].notDirectionalEvidence,true);
 let queried=false;
 const fetched=await fetchBlueskyPosts('BTCUSDT',{now:()=>now,fetchImpl:async(url,opts)=>{
  queried=true;assert.match(url,/public\.api\.bsky\.app/);
  assert.equal(opts.credentials,'omit');
  return {ok:true,json:async()=>payload};
 }});
 assert.equal(queried,true);assert.equal(fetched.state,'OK');
 assert.equal((await fetchBlueskyPosts('BTCUSDT',{
  fetchImpl:async()=>({ok:false,status:403})})).state,'ACCESS_DENIED');
 assert.equal((await fetchBlueskyPosts('NONEUSDT',{fetchImpl:async()=>{
  throw Error('should not call');}})).state,'UNSUPPORTED');
});

test('normalized GDELT news remains visible in the asset event archive',()=>{
 const normalized={state:'OK',data:{articles:[
  {title:'Bitcoin network upgrade details',
   href:'https://publisher.example/bitcoin-upgrade',observedAt:now-120000,
   source:'GDELT',timeKind:'INDEXED'},
  {title:'Ethereum network upgrade details',
   href:'https://publisher.example/eth-upgrade',observedAt:now-120000}
 ]}};
 const events=routeAssetNews('BTCUSDT',normalized);
 assert.equal(events.length,1);
 assert.equal(events[0].url,'https://publisher.example/bitcoin-upgrade');
 assert.equal(events[0].seenAt,now-120000);
 assert.equal(events[0].scope,'NAME_MATCH_NOT_VERIFIED_IMPACT');
});
