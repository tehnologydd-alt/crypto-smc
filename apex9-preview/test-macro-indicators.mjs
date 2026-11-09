import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchBlsIndicators,parseBlsIndicators,BLS_SERIES,BLS_ENDPOINT} from './macro-indicators.mjs';
const t=Date.UTC(2026,10,9,12);
const p=(year,month,value)=>({year:String(year),period:'M'+month,value:String(value)});
const valid={status:'REQUEST_SUCCEEDED',Results:[{series:[
 {seriesID:'CUSR0000SA0',data:[p(2026,'10',334.1),p(2026,'09',333.0),p(2025,'10',325.1)]},
 {seriesID:'LNS14000000',data:[p(2026,'10',4.4)]},
 {seriesID:'CES0000000001',data:[p(2026,'10',160000)]},
 {seriesID:'CES0500000003',data:[p(2026,'10',36.1)]}
]}]};
test('one no-key BLS v1 batch request contains precisely the fixed indicators',async()=>{
 let called=0;
 const x=await fetchBlsIndicators({now:()=>t,fetchImpl:async(url,init)=>{
  called++;
  assert.equal(url,BLS_ENDPOINT);
  assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');
  const body=JSON.parse(init.body);
  assert.deepEqual(body.seriesid,BLS_SERIES.map(x=>x.id));
  assert.equal(body.registrationkey,undefined);
  return {ok:true,json:async()=>valid};
 }});
 assert.equal(called,1);assert.equal(x.state,'OK');
 assert.equal(x.indicators.length,4);
 assert.equal(x.indicators[0].yoyPercent,2.768);
 assert.equal(x.indicators[0].publishedAt,null);
 assert.equal(x.indicators[0].period,'2026-10');
});
test('malformed, mislabeled and invalid periods cannot create macro values',()=>{
 assert.equal(parseBlsIndicators({status:'REQUEST_FAILED'},{receivedAt:t}).state,'INVALID');
 const spoofed={status:'REQUEST_SUCCEEDED',Results:[{series:[
  {seriesID:'FAKE',data:[p(2026,'10',20)]},
  {seriesID:'LNS14000000',data:[p(2026,'13',9)]}
 ]}]};
 assert.equal(parseBlsIndicators(spoofed,{receivedAt:t}).state,'EMPTY');
 assert.equal(parseBlsIndicators({...valid,Results:[{series:valid.Results[0].series.slice(0,1)}]},
  {receivedAt:t}).coverage,'1/4');
});
test('429 and unavailable provider never substitute imaginary readings',async()=>{
 assert.equal((await fetchBlsIndicators({fetchImpl:async()=>({ok:false,status:429})})).state,'RATE_LIMITED');
 assert.equal((await fetchBlsIndicators({fetchImpl:async()=>{throw Error('offline');}})).state,'OFFLINE');
});
