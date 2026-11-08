import test from 'node:test';import assert from 'node:assert/strict';
import {parseEditorialFeed,loadEditorialFeed} from './editorial-core.mjs';
const now=1794139200000;
const date=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const item=(title,domain,mins)=>({
 title,domain,url:'https://'+domain+'/news/'+mins,
 seendate:date(now-mins*60000)
});
test('news never manufactures stories, excludes stale and off-topic results',()=>{
 const raw={articles:[item('Bitcoin regulation and new institutional adoption','example.org',20),
 item('Beautiful flowers this autumn season','flowers.org',10),
 item('Ethereum ETF opens new access to funds','crypto.news',50),
 item('Bitcoin regulation and new exchange research','example.org',80),
 item('Bitcoin market and blockchain adoption','example.org',90),
 item('Bitcoin market 2020 recap','older.org',4000)]};
 const r=parseEditorialFeed(raw,{mode:'news',now});
 assert.equal(r.state,'OK');assert.equal(r.articles.length,3);
 assert.ok(r.articles.every(x=>x.href.startsWith('https://')));
});
test('macro feed uses its own topic with no fabricated calendar date',()=>{
 const r=parseEditorialFeed({articles:[item('Federal Reserve rates inflation report','macro.org',20)]},{mode:'macro',now});
 assert.equal(r.articles.length,1);
 assert.equal(r.articles[0].observedAt,now-20*60000);
});
test('429 and network failure are reported, not replaced with fake headlines',async()=>{
 const x=await loadEditorialFeed('news',{fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(x.state,'RATE_LIMITED');assert.equal(x.articles.length,0);
 const y=await loadEditorialFeed('macro',{fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(y.state,'OFFLINE');
});
