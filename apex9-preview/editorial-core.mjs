/**
 * APEX independent public editorial feed. GDELT Doc 2.1 only.
 * Priority means recency/relevance and domain diversity, not verified impact.
 */
import {parseGdeltDate} from './context-sources.mjs';
import {consolidateArticles} from './news-source-fusion.mjs';
const API='https://api.gdeltproject.org/api/v2/doc/doc';
const TOPICS=Object.freeze({
 news:'(cryptocurrency OR bitcoin OR ethereum OR blockchain) (regulation OR adoption OR ETF OR hack OR exchange OR market)',
 macro:'("Federal Reserve" OR "ECB" OR inflation OR "interest rates" OR CPI OR "central bank") (economy OR markets)'
});
const titleRelevant=(s,mode)=>mode==='news'?
 /crypto|bitcoin|ethereum|blockchain|stablecoin|exchange|ETF|token|digital asset|regulat/i.test(s):
 /inflation|interest|rates|Federal|Fed|ECB|central bank|CPI|GDP|jobs|economy|monetary|tariff/i.test(s);
export function parseEditorialFeed(raw,{mode,now}={}){
 if(!Object.hasOwn(TOPICS,mode)||!Number.isSafeInteger(now)||!Array.isArray(raw?.articles))
  return {state:'INVALID',articles:[],reason:'Invalid public article metadata'};
 const seen=new Set(),rank=[];
 for(const item of raw.articles){
  const t=parseGdeltDate(item?.seendate);
  if(!Number.isSafeInteger(t)||t>now+60000||now-t>48*3600000)continue;
  const title=String(item.title||'').trim().slice(0,200);
  if(title.length<15||!titleRelevant(title,mode))continue;
  let u;
  try{u=new URL(item.url);}catch{continue;}
  if(u.protocol!=='https:'||!u.hostname.includes('.')||seen.has(u.href))continue;
  const domain=String(item.domain||u.hostname).trim().slice(0,70);
  if(!domain)continue;
  seen.add(u.href);
  rank.push({title,href:u.href,domain,observedAt:t,timeKind:'INDEXED',
   language:String(item.language||'').slice(0,24)});
 }
 rank.sort((a,b)=>b.observedAt-a.observedAt||a.domain.localeCompare(b.domain));
 const output=consolidateArticles(rank,{limit:18,perDomain:2});
 return {state:output.length?'OK':'EMPTY',articles:output,
  note:'GDELT index articles from the last 48h; editorial importance or price effects unverified'};
}
export async function loadEditorialFeed(mode,{fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 if(!Object.hasOwn(TOPICS,mode))return {state:'INVALID',articles:[]};
 const url=API+'?query='+encodeURIComponent(TOPICS[mode])+
  '&mode=artlist&maxrecords=75&timespan=48h&format=json&sort=datedesc';
 try{
  const res=await fetchImpl(url,{method:'GET',credentials:'omit',cache:'no-store',signal});
  if(res?.status===429)return {state:'RATE_LIMITED',articles:[]};
  if(!res?.ok)return {state:'OFFLINE',articles:[],reason:'HTTP '+(res?.status||'unavailable')};
  return parseEditorialFeed(await res.json(),{mode,now:now()});
 }catch(e){return {state:'OFFLINE',articles:[],reason:String(e?.message||e).slice(0,140)};}
}
