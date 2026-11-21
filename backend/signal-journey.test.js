import test from 'node:test';
import assert from 'node:assert/strict';
import { journey, isFinished, bucket, levelSegments } from './public/signal-journey.js';

const sample = (side='LONG', state='OPEN') => ({
  id:'spot:BTCUSDT:1h:1:LONG', side, state, detectedAt:1000,
  entry:100,stop:98,targets:[102,104,106],
  hitTargets:0,events:[{type:'CREATED',at:1000,price:103},{type:'ENTRY',at:2000,price:100}]
});
test('only terminal states leave the current signals tab',()=>{
  for(const state of ['WAITING','OPEN','UNCERTAIN'])assert.equal(isFinished(state),false);
  for(const state of ['STOPPED','COMPLETED','CANCELLED','EXPIRED'])assert.equal(isFinished(state),true);
  assert.equal(bucket('WAITING'),'waiting');
  assert.equal(bucket('OPEN'),'active');
  assert.equal(bucket('UNCERTAIN'),'active');
  assert.equal(bucket('STOPPED'),'finished');
});
test('long STOP after TP1 remains a completed scenario with dated exit',()=>{
  const s=sample();s.state='STOPPED';s.hitTargets=1;
  s.events.push({type:'TP1',at:3000,price:102},{type:'STOP',at:4000,price:98});
  const path=journey(s);
  assert.equal(path.finished,true);
  assert.equal(path.entry.at,2000);assert.equal(path.exit.at,4000);
  assert.equal(path.lastTarget??path.reached,1);
  assert.equal(path.percent,-2);
  assert.equal(path.result,'Стоп после входа');
});
test('short final TP3 has positive directional movement despite falling prices',()=>{
  const s=sample('SHORT','COMPLETED');
  s.events.push({type:'TP1',at:3000,price:98},{type:'TP2',at:4000,price:96},
    {type:'TP3',at:5000,price:94});
  const path=journey(s);
  assert.equal(path.percent,6);assert.equal(path.exit.type,'TP3');
  assert.equal(path.reached,3);
});
test('expired without entry has no fabricated exit performance',()=>{
  const s=sample('LONG','EXPIRED');
  s.events.splice(1);
  s.events.push({type:'EXPIRED',at:5000,price:99});
  const path=journey(s);
  assert.equal(path.finished,true);assert.equal(path.entry,null);
  assert.equal(path.percent,null);assert.equal(path.result,'Завершён без входа');
});
test('unknown data gap stays current and never invents closure',()=>{
  const s=sample('LONG','UNCERTAIN');s.events.push({type:'DATA_GAP',at:3000,price:101});
  const path=journey(s);
  assert.equal(path.finished,false);assert.equal(path.exit,null);
  assert.equal(path.percent,null);
});

test('level lines start at creation and stop at each target latest touch',()=>{
  const s=sample('LONG','STOPPED');
  s.events.push({type:'TP1',at:3000,price:102},{type:'TP1',at:3500,price:102},
    {type:'STOP',at:5000,price:98});
  const segments=levelSegments(s,9000);
  assert.deepEqual(segments.map(x=>x.name),['ENTRY','SL','TP1','TP2','TP3']);
  assert.ok(segments.every(x=>x.startAt===1000));
  assert.equal(segments[0].endAt,2000);
  assert.equal(segments[0].touched,true);
  assert.equal(segments[1].endAt,5000);
  assert.equal(segments[1].touched,true);
  assert.equal(segments[2].endAt,3500);
  assert.equal(segments[2].touched,true);
  assert.equal(segments[3].endAt,5000);
  assert.equal(segments[3].touched,false);
  assert.equal(segments[4].endAt,5000);
});
test('pending levels extend only to current last closed candle',()=>{
  const s=sample('LONG','OPEN');
  const segments=levelSegments(s,9000);
  assert.equal(segments.find(x=>x.name==='ENTRY').endAt,2000);
  assert.equal(segments.find(x=>x.name==='TP1').endAt,9000);
  assert.equal(segments.find(x=>x.name==='SL').endAt,9000);
  assert.equal(segments.find(x=>x.name==='TP1').touched,false);
});
test('no future extension for cancelled, expired and data gap',()=>{
  for (const [state,type] of [['CANCELLED','INVALIDATED'],['EXPIRED','EXPIRED'],['UNCERTAIN','DATA_GAP']]) {
    const s=sample('LONG',state);
    s.events.push({type,at:5000,price:99});
    assert.ok(levelSegments(s,10000).every(level=>level.endAt<=5000));
  }
});
