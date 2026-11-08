import test from 'node:test';import assert from 'node:assert/strict';
import {sparklinePoints} from './sparkline.mjs';
const data=Array.from({length:12},(_,i)=>({t:1700002800000+i*3600000,
 close:100+i*.25,closed:true}));
test('sparkline uses only genuine ordered closed values',()=>{
 const p=sparklinePoints([...data,{t:data.at(-1).t+3600000,close:1e9,closed:false}]);
 assert.equal(p.points.length,12);assert.equal(p.rising,true);
 assert.ok(p.path.startsWith('M'));assert.ok(!p.path.includes('NaN'));
});
test('missing or reversed bars do not create fictional sparklines',()=>{
 assert.equal(sparklinePoints([]),null);
 const wrong=[...data];wrong[7]={...wrong[7],t:wrong[5].t};
 assert.equal(sparklinePoints(wrong),null);
});
