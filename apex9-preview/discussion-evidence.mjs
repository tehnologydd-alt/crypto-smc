/**
 * Lightweight source-neutral labels for public discussion excerpts.
 * Posts are unverified context, never market sentiment or a price signal.
 */
import {describeNewsEvidence} from './news-evidence.mjs';
const quoteSuffix=/^(?:USDT|USDC|USD|EUR|BTC)$/;
export function discussionEvidence(post,{symbol='',now=Date.now()}={}){
 const raw=String(symbol).trim().toUpperCase();
 const base=raw.replace(/(USDT|USDC|USD|EUR)$/,'');
 const asset=base&&base!==raw||quoteSuffix.test(raw)?base:raw;
 const text=typeof post?.text==='string'?post.text.slice(0,280):'';
 const observedAt=post?.indexedAt;
 const evidence=describeNewsEvidence({title:text,observedAt,
  source:'Public discussion',timeKind:'INDEXED'},{asset,now});
 const relevance=evidence.focus==='DIRECT'?'MENTIONS_ASSET':
  evidence.focus==='GENERAL'?'GENERAL_TOPIC':'NOT_ESTABLISHED';
 return {relevance,age:evidence.ageLabel,freshness:evidence.freshness,
  topics:evidence.topics,
  trust:'USER_POST_UNVERIFIED',
  influence:'PRICE_IMPACT_UNKNOWN',
  indexedNotPublished:true};
}
const BLOCKED_LABELS=new Set([
 'porn','sexual','nudity','graphic-media','gore','self-harm',
 'intolerant','hate','extremist','violence','adult','nsfl'
]);
export function isRestrictedPublicPost(post){
 if(post?.author?.viewer?.blocking||post?.author?.viewer?.blockedBy||
  post?.viewer?.hidden||post?.viewer?.threadMuted)return true;
 const values=[
  ...(Array.isArray(post?.labels)?post.labels:[]),
  ...(Array.isArray(post?.record?.labels?.values)?post.record.labels.values:[])
 ];
 return values.some(v=>typeof v?.val==='string'&&
  BLOCKED_LABELS.has(v.val.toLowerCase()));
}
