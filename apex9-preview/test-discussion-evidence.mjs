import test from 'node:test';
import assert from 'node:assert/strict';
import {discussionEvidence,isRestrictedPublicPost} from './discussion-evidence.mjs';
import {parseBlueskyPosts} from './social-public.mjs';
const now=Date.UTC(2026,10,9,12);
test('discussion labels report relevance, age and uncertainty without a trade prediction',()=>{
 const r=discussionEvidence({text:'Bitcoin exchange security update',
  indexedAt:now-3600_000},{symbol:'BTCUSDT',now});
 assert.equal(r.relevance,'MENTIONS_ASSET');
 assert.equal(r.age,'1 ч назад');
 assert.equal(r.trust,'USER_POST_UNVERIFIED');
 assert.equal(r.influence,'PRICE_IMPACT_UNKNOWN');
 assert.equal(r.topics.includes('Безопасность'),true);
});
test('other coin or generic post cannot be treated as evidence for BTC',()=>{
 const r=discussionEvidence({text:'Ethereum network update',
  indexedAt:now},{symbol:'BTCUSDT',now});
 assert.equal(r.relevance,'NOT_ESTABLISHED');
});
test('known sensitive and blocked social labels never enter public preview',()=>{
 assert.equal(isRestrictedPublicPost({labels:[{val:'porn'}]}),true);
 assert.equal(isRestrictedPublicPost({record:{labels:{values:[{val:'graphic-media'}]}}}),true);
 assert.equal(isRestrictedPublicPost({author:{viewer:{blockedBy:true}}}),true);
 const base={author:{handle:'research.example'},
  uri:'at://did:plc:example123/app.bsky.feed.post/test1',
  record:{text:'Bitcoin network update'},
  indexedAt:new Date(now-5000).toISOString()};
 const r=parseBlueskyPosts({posts:[base,
  {...base,uri:'at://did:plc:example123/app.bsky.feed.post/test2',
   labels:[{val:'sexual'}]},
  {...base,uri:'at://did:plc:example123/app.bsky.feed.post/test3',
   author:{handle:'blocked.example',viewer:{blocking:true}}}
 ]},{symbol:'BTCUSDT',receivedAt:now});
 assert.equal(r.state,'OK');
 assert.equal(r.posts.length,1);
 assert.equal(r.posts[0].scope,'PUBLIC_USER_POST_UNVERIFIED');
});
