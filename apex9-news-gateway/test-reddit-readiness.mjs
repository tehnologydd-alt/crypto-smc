import test from 'node:test';
import assert from 'node:assert/strict';
import {redditReadiness,parseApprovedRedditListing} from './reddit-readiness.mjs';
const now=Date.UTC(2026,10,9,12);
test('no Reddit content is processed without approved access',()=>{
 assert.equal(redditReadiness().state,'APPROVAL_REQUIRED');
 assert.equal(redditReadiness({approved:true}).state,'OAUTH_NOT_CONFIGURED');
 assert.equal(redditReadiness({approved:true,oauthReady:true}).state,
  'USER_AGENT_NOT_CONFIGURED');
 assert.equal(redditReadiness({approved:true,oauthReady:true,
  userAgentReady:true}).canFetch,false);
 assert.equal(parseApprovedRedditListing({data:{children:[]}}).state,
  'APPROVAL_REQUIRED');
});
test('approved fixtures are ephemeral and exclude restricted or removed entries',()=>{
 const base={kind:'t3',data:{title:'Bitcoin network developer discussion',
  created_utc:(now-2000)/1000,
  permalink:'/r/Bitcoin/comments/abc123/bitcoin_network_discussion/'}};
 const result=parseApprovedRedditListing({data:{children:[
  base,
  {...base,data:{...base.data,permalink:'/r/Bitcoin/comments/abc124/post/',
   over_18:true}},
  {...base,data:{...base.data,permalink:'/r/Bitcoin/comments/abc125/post/',
   selftext:'[removed]'}},
  {...base,data:{...base.data,permalink:'/r/Bitcoin/comments/abc126/post/',
   author:'[deleted]'}}
 ]}},{approved:true,now});
 assert.equal(result.state,'OK');
 assert.equal(result.posts.length,1);
 assert.equal(result.posts[0].source,'Reddit');
 assert.equal(result.posts[0].author,undefined);
 assert.equal(result.posts[0].notDirectionalEvidence,true);
 assert.equal(result.persistence,'EPHEMERAL_ONLY_RECHECK_REMOVALS');
});
