/**
 * Offline-only Reddit Data API readiness and approved-response validation.
 * Does NOT authenticate, call, scrape, poll, store or cache Reddit content.
 * Access requires explicit platform approval and applicable terms.
 */
export const REDDIT_DATA_API_GUIDANCE=Object.freeze({
 documentedFreeQpm:100,
 entitlement:'APPROVAL_REQUIRED',
 oauth:'REQUIRED',
 userAgent:'REGISTERED_APP_REQUIRED',
 retention:'NO_PERSISTENT_CONTENT_STORAGE',
 usage:'READ_ONLY_UNVERIFIED_DISCUSSION'
});
export function redditReadiness({approved=false,oauthReady=false,
 userAgentReady=false}={}){
 const state=!approved?'APPROVAL_REQUIRED':
  !oauthReady?'OAUTH_NOT_CONFIGURED':
  !userAgentReady?'USER_AGENT_NOT_CONFIGURED':'APPROVED_INPUT_ONLY';
 return {state,canFetch:false,quotaLabel:
  'До 100 запросов/мин только при предоставленном бесплатном доступе',
  contentScope:'UNVERIFIED_USER_DISCUSSION_NOT_MARKET_SIGNAL'};
}
export function parseApprovedRedditListing(payload,{
 approved=false,now=Date.now()
}={}){
 if(!approved)return {state:'APPROVAL_REQUIRED',posts:[]};
 const children=payload?.data?.children;
 if(!Array.isArray(children)||children.length>100||
    !Number.isSafeInteger(now)||now<=0)
  return {state:'INVALID',posts:[]};
 const seen=new Set(),posts=[];
 for(const item of children){
  const p=item?.kind==='t3'?item?.data:null;
  if(!p||p.over_18||p.quarantine||p.quarantined||
   p.removed_by_category||p.is_robot_indexable===false||
   p.author==='[deleted]'||p.selftext==='[removed]')continue;
  const title=typeof p.title==='string'?p.title.trim().slice(0,180):'';
  const timestamp=Number.isFinite(p.created_utc)?
   Math.floor(p.created_utc*1000):NaN;
  const path=typeof p.permalink==='string'?p.permalink:'';
  const valid=/^\/r\/[a-zA-Z0-9_]{2,32}\/comments\/[a-z0-9]{3,12}\/[a-zA-Z0-9_%-]*\/?$/.test(path);
  if(!valid||title.length<10||!Number.isSafeInteger(timestamp)||
     timestamp>now+60000||now-timestamp>24*3600000)continue;
  const href='https://www.reddit.com'+path;
  if(seen.has(href))continue;
  seen.add(href);
  // Intentionally exclude usernames, bodies, vote counts and user IDs.
  posts.push({title,href,observedAt:timestamp,
   source:'Reddit',scope:'APPROVED_UNVERIFIED_PUBLIC_DISCUSSION',
   timeKind:'PUBLISHED',notDirectionalEvidence:true});
  if(posts.length>=8)break;
 }
 return {state:posts.length?'OK':'EMPTY',posts,
  persistence:'EPHEMERAL_ONLY_RECHECK_REMOVALS',
  independentVerification:false,marketDirection:'NOT_INFERRED'};
}
