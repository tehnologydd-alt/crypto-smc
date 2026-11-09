/**
 * Source-neutral editorial evidence. No API keys or speculative sentiment.
 * A story may be indexed by multiple services; repeated headlines are not
 * independent confirmation. Keep the original publisher for attribution.
 */
const tracking=/^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i;
export function cleanArticleUrl(value){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||!u.hostname.includes('.')||
   u.username||u.password)return null;
  u.hash='';
  for(const key of [...u.searchParams.keys()])
   if(tracking.test(key))u.searchParams.delete(key);
  u.searchParams.sort();
  return u.href.replace(/\/$/,'');
 }catch{return null;}
}
export function headlineKey(title){
 return String(title||'').normalize('NFKC').toLowerCase()
  .replace(/https?:\/\/\S+/g,' ')
  .replace(/[^\p{L}\p{N}]+/gu,' ')
  .trim().replace(/\s+/g,' ').slice(0,200);
}
export function consolidateArticles(input,{limit=18,perDomain=2}={}){
 const candidates=[];
 for(const x of Array.isArray(input)?input:[]){
  const href=cleanArticleUrl(x?.href||x?.url);
  const title=String(x?.title||'').trim().slice(0,220);
  const observedAt=x?.observedAt??x?.seenAt;
  if(!href||title.length<2||!Number.isSafeInteger(observedAt)||
   observedAt<=0)continue;
  const domain=new URL(href).hostname.toLowerCase();
  const source=String(x?.source||x?.provider||'GDELT').slice(0,50);
  // Preserve source attribution already established by the gateway.
  // Do not confuse multiple indexers with independent event verification.
  const indexedBy=[source];
  if(Array.isArray(x?.indexedBy))
   for(const name of x.indexedBy.slice(0,8))
    if(typeof name==='string'&&name.length>0&&name.length<=50&&
       !indexedBy.includes(name))indexedBy.push(name);
  candidates.push({...x,title,href,domain,observedAt,source,indexedBy,
   confirmationCount:indexedBy.length});
 }
 candidates.sort((a,b)=>b.observedAt-a.observedAt);
 const unique=[],byUrl=new Map(),byHeadline=new Map();
 for(const item of candidates){
  const key=headlineKey(item.title);
  const existing=byUrl.get(item.href)||(key.length>=18?byHeadline.get(key):null);
  if(existing){
   const providers=new Set([...(existing.indexedBy||[existing.source]),
    ...(item.indexedBy||[item.source])]);
   existing.indexedBy=[...providers];
   existing.confirmationCount=providers.size;
   continue;
  }
  const entry={...item,indexedBy:[...item.indexedBy]};
  unique.push(entry);byUrl.set(entry.href,entry);
  if(key.length>=18)byHeadline.set(key,entry);
 }
 const domains=new Map(),articles=[];
 for(const item of unique){
  if((domains.get(item.domain)||0)>=perDomain)continue;
  domains.set(item.domain,(domains.get(item.domain)||0)+1);
  articles.push(item);
  if(articles.length>=limit)break;
 }
 return articles;
}
export const KEYED_NEWS_PROVIDERS=Object.freeze({
 cryptopanic:Object.freeze({state:'PERSONAL_ANDROID_KEY_OR_GATEWAY_REQUIRED',
  reason:'Personal Android Keystore or authenticated HTTPS gateway; plan entitlement required'}),
 newsdata:Object.freeze({state:'PERSONAL_ANDROID_KEY_OR_GATEWAY_REQUIRED',
  reason:'Personal Android Keystore or authenticated HTTPS gateway; free tier news delayed'}),
 reddit:Object.freeze({state:'NEEDS_OAUTH_OR_APPROVED_PUBLIC_ACCESS',
  reason:'Never imply Reddit API access before OAuth is configured'})
});
