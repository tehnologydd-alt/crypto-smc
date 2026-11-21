import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, RULE_KEYS, volumeGate } from './strategy-rules.js';
import { detectResearchSignals } from './strategy.js';

const HOUR=3600000;
function bullish(period=HOUR,start=0,count=40, breakoutVolume=1) {
  return Array.from({length:count},(_,i)=>{
    const time=start+i*period;
    const c={time,end:time+period-1,open:100,high:101,low:99,close:100,volume:1};
    if(i===count-10)c.high=103;
    if(i===count-2)Object.assign(c,{open:101,close:100,high:102});
    if(i===count-1)Object.assign(c,{open:102.5,low:102.5,high:107,close:106,volume:breakoutVolume});
    return c;
  });
}
function parentFor(bars) {
  const last=bars.at(-1).end;
  return bullish(4*HOUR,last-20*4*HOUR+1,20);
}
test('frozen version registry has all three nested rule gates',()=>{
  assert.deepEqual(RULE_KEYS,['v0.1','v0.2','v0.3']);
  assert.equal(RULES[0].liquidity,false);
  assert.equal(RULES[1].liquidity,true);
  assert.equal(RULES[1].htf,false);
  assert.equal(RULES[2].htf,true);
  assert.equal(RULES[2].volumeLookback,20);
  assert.equal(RULES[2].minVolumeRatio,1.2);
});
test('liquidity proxy looks only at 20 previously closed candles',()=>{
  const bars=bullish(HOUR,0,40,2);
  assert.equal(volumeGate(bars,39).allowed,true);
  assert.equal(volumeGate(bars,39).ratio,2);
  bars.push({...bars.at(-1),time:bars.at(-1).end+1,end:bars.at(-1).end+HOUR,volume:10000});
  assert.equal(volumeGate(bars,39).ratio,2);
  assert.equal(volumeGate(bars,39,20,2.01).allowed,false);
  assert.equal(volumeGate(bars,12).reason,'NO_VOLUME_HISTORY');
});
test('all versions share base rule, but filters select nested subsets',()=>{
  const strong=bullish(HOUR,0,40,2);
  const versions=detectResearchSignals(strong,'spot','BTCUSDT','1h',parentFor(strong));
  assert.deepEqual(versions.map(s=>s.ruleVersion),RULE_KEYS);
  assert.equal(new Set(versions.map(s=>s.id)).size,3);
  assert.ok(versions.every(s=>s.strategyVersion===3 && s.state==='WAITING'));
  assert.ok(versions.every(s=>s.ruleSnapshot?.volumeRatio===2));
  assert.ok(versions.every(s=>s.entry===versions[0].entry && s.stop===versions[0].stop));
  const noParent=detectResearchSignals(strong,'spot','BTCUSDT','1h',null);
  assert.deepEqual(noParent.map(s=>s.ruleVersion),['v0.1','v0.2']);
  const weak=bullish(HOUR,0,40,1);
  assert.deepEqual(detectResearchSignals(weak,'spot','BTCUSDT','1h',parentFor(weak)).map(s=>s.ruleVersion),['v0.1']);
});
test('break gate ignores future candle volume',()=>{
  const baseline=bullish(HOUR,0,40,1);
  const changed=baseline.map(c=>({...c}));
  changed[39].volume=2;
  assert.deepEqual(detectResearchSignals(baseline,'spot','BTCUSDT','1h',parentFor(baseline)).map(x=>x.ruleVersion),['v0.1']);
  assert.deepEqual(detectResearchSignals(changed,'spot','BTCUSDT','1h',parentFor(changed)).map(x=>x.ruleVersion),RULE_KEYS);
});
