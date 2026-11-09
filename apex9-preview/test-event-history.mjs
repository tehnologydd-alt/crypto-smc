import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventHistory} from './event-history.mjs';
import {summarizeAssetQuality} from './asset-quality.mjs';
const at=Date.UTC(2026,10,9,12);
function mem(){
 const data=new Map();
 return {getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,value),data};
}
const general={state:'OK',fetchedAt:at,articles:[
 {title:'Bitcoin ETF regulation update',href:'https://example.org/a',observedAt:at-900000},
 {title:'Unrelated sports news',href:'https://example.org/b',observedAt:at-900000}
]};
const macro={state:'OK',fetchedAt:at,articles:[
 {title:'Federal Reserve interest rates decision',href:'https://example.org/m',observedAt:at-120000}]};
test('global events accumulate, deduplicate, and do not turn schedules into actual releases',()=>{
 const store=mem(),h=createEventHistory({storage:store,now:()=>at});
 const cal={state:'OK',fetchedAt:at,events:[{
  id:'cpi-1',title:'Consumer Price Index',source:'BLS_OFFICIAL_CALENDAR',
  status:'SCHEDULED_NOT_RELEASED',at:at+3600000,
  sourceUrl:'https://www.bls.gov/schedule/news_release/'
 }]};
 assert.equal(h.captureGlobal({news:general,macro,calendar:cal}).added,3);
 assert.equal(h.captureGlobal({news:general,macro,calendar:cal}).added,0);
 const r=h.list();
 assert.equal(r.total,3);
 assert.equal(r.events.find(e=>e.kind==='SCHEDULE').timeKind,'SCHEDULED');
 assert.equal(r.events.every(e=>e.unverifiedImpact),true);
 assert.equal(r.events.filter(e=>e.kind==='MACRO').length,1);
 assert.equal(h.list({symbol:'ETHUSDT'}).total,0);
 assert.equal(h.list({symbol:'ETHUSDT',includeGlobal:true}).total,1);
});
test('asset news and social observations merge per symbol but not unrelated assets',()=>{
 const h=createEventHistory({storage:mem(),now:()=>at});
 const feed={state:'OK',fetchedAt:at,data:{articles:[
  {title:'Ethereum network update',url:'https://example.org/e',seenAt:at-120000},
  {title:'Bitcoin ETF update',url:'https://example.org/b',seenAt:at-120000}
 ]}};
 const social={state:'OK',fetchedAt:at,posts:[
  {text:'Ethereum development discussion',href:'https://bsky.app/profile/a.bsky.social/post/123',
   indexedAt:at-90000}]};
 assert.equal(h.captureAsset('ETHUSDT',{news:feed,social}).added,2);
 assert.equal(h.captureAsset('ETHUSDT',{news:feed,social}).added,0);
 assert.equal(h.list({symbol:'ETHUSDT'}).total,2);
 assert.equal(h.list({symbol:'BTCUSDT'}).total,0);
 assert.equal(h.list({symbol:'UNKNOWN'}).state,'OK');
});
test('failed persistence and corrupted local archive fail closed',()=>{
 const h=createEventHistory({storage:null,now:()=>at});
 assert.equal(h.captureGlobal({news:general}).state,'STORAGE_UNAVAILABLE');
 const storage=mem();
 storage.setItem('apex9:observed-event-history:v1','not-json');
 const broken=createEventHistory({storage,now:()=>at});
 assert.equal(broken.list().state,'STORAGE_UNAVAILABLE');
 assert.equal(broken.captureGlobal({news:general}).state,'STORAGE_UNAVAILABLE');
});
test('per-asset scoreboard excludes other assets, never makes up results',()=>{
 const by=summarizeAssetQuality([
  {id:'x1',asset:'BTCUSDT'},
  {id:'x2',asset:'ETHUSDT'},
  {id:'x3',asset:'NOT A SYMBOL'}
 ],{now:at,totalLoaded:12});
 assert.deepEqual(by.assets,[]);
 assert.equal(by.partial,true);
 assert.equal(by.scanned,3);
 assert.match(by.note,/не рассчитаны/);
});
