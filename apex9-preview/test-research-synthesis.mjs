import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesizeResearch,SYNTHESIS_RULES} from './research-synthesis.mjs';
const H=3_600_000,T=1700000000000-1700000000000%H;
function bars(asset,{n=900,start=0,pattern='WAVE'}={}){
 const data=[];let price=asset==='BTCUSDT'?35000:asset==='ETHUSDT'?2600:140;
 for(let i=0;i<n;i++){
  const t=T+(start+i)*H,open=price;
  let delta=.003*Math.sin((start+i)*.7)+.002*Math.cos((start+i)*.17);
  if(pattern==='UP')delta=.0012;
  if(pattern==='ALTERNATE')delta=i%2?-.01:.01;
  if(pattern==='CYCLE')delta=Math.sin(i/35)*.005;
  price*=Math.exp(delta);
  data.push({t,closeAt:t+H-1,open,close:price,
   high:Math.max(open,price)*1.001,
   low:Math.min(open,price)*.999,
   volume:100+i%19,closed:true});
 }
 return data;
}
const record=(asset,options)=>({
 asset,native:true,archiveComplete:true,
 candles:bars(asset,options)
});
const input=(asset='BTCUSDT')=>({
 asset,primary:record(asset),
 peers:['BTCUSDT','ETHUSDT','SOLUSDT']
  .filter(id=>id!==asset).map(id=>record(id)),
 now:T+2500*H
});
test('verified synthesis summarizes actual primary and synchronized peer evidence',()=>{
 const r=synthesizeResearch(input());
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.source.archiveComplete,true);
 assert.equal(r.source.missingHours,0);
 assert.ok(r.source.windows>=144);
 assert.equal(r.coverage.regimes,'VERIFIED');
 assert.equal(r.coverage.stability,'VERIFIED');
 assert.equal(r.coverage.transitions,'VERIFIED');
 assert.equal(r.coverage.crossAsset,'DESCRIPTIVE');
 assert.equal(r.asset,'BTCUSDT');
 assert.ok(r.observations.some(x=>/полная проверенная история/i.test(x.title)));
 assert.ok(r.observations.some(x=>x.source.includes('Cross-Asset')));
 assert.ok(r.missing.some(x=>/Прогнозная применимость/.test(x.title)));
 assert.equal(r.rules.noPredictiveScore,true);
 assert.ok(!('score' in r));
});
test('one missing cross peer is excluded, primary research remains factual',()=>{
 const args=input();
 args.peers[1]={asset:'SOLUSDT',native:false,archiveComplete:false,
  error:'Нет Room-архива'};
 const r=synthesizeResearch(args);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.coverage.crossAsset,'DESCRIPTIVE');
 assert.ok(r.missing.some(x=>/SOLUSDT/.test(x.title)&&
  /Room/.test(x.detail)));
});
test('both missing cross peers suppress cross percentages, not primary study',()=>{
 const args=input();
 args.peers=args.peers.map(x=>({...x,native:false,
  archiveComplete:false,error:'Нет архива'}));
 const r=synthesizeResearch(args);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.coverage.crossAsset,'INSUFFICIENT');
 assert.ok(r.missing.some(x=>/Межактивное сравнение недоступно/.test(x.title)));
 assert.ok(!r.observations.some(x=>x.source.includes('Cross-Asset')));
});
test('a selected asset outside fixed cross universe retains solo research',()=>{
 const args=input('TONUSDT');
 const r=synthesizeResearch(args);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.coverage.crossAsset,'NOT_APPLICABLE');
 assert.ok(r.missing.some(x=>/Межактивное сопоставление/.test(x.title)));
 assert.ok(!r.observations.some(x=>x.source.includes('Cross-Asset')));
});
test('missing, gapped, partial and future primary histories hide all conclusions',()=>{
 const args=input();
 const cases=[
  {...args,primary:{...args.primary,archiveComplete:false}},
  {...args,primary:{...args.primary,native:false}},
  {...args,primary:{...args.primary,
   candles:args.primary.candles.filter((_,i)=>i!==50)}},
  {...args,primary:{...args.primary,candles:args.primary.candles.map((x,i)=>
   i===120?{...x,closeAt:T+5000*H}:x)}},
  {...args,primary:{...args.primary,error:'Native request failed'}}
 ];
 for(const variant of cases){
  const r=synthesizeResearch(variant);
  assert.equal(r.state,'HIDDEN');
  assert.equal(r.observations.length,0);
  assert.equal(r.differences.length,0);
  assert.equal(r.source,null);
 }
});
test('invalid asset ownership, duplicates and fake future time are refused',()=>{
 const args=input();
 assert.equal(synthesizeResearch({...args,asset:'SOLUSDT'}).state,'HIDDEN');
 assert.equal(synthesizeResearch({...args,peers:[args.peers[0],args.peers[0]]}).state,'HIDDEN');
 assert.equal(synthesizeResearch({...args,now:0}).state,'HIDDEN');
 assert.equal(synthesizeResearch({...args,asset:'BTC-USDT'}).state,'HIDDEN');
});
test('the reference thresholds cannot depend on later market outcomes',()=>{
 assert.equal(SYNTHESIS_RULES.descriptiveDifferencePp,20);
 assert.equal(SYNTHESIS_RULES.lowCrossAgreementShare,.45);
 const a=input(),r=synthesizeResearch(a);
 const b=input();
 b.primary.candles=b.primary.candles.map((x,i)=>i>650?
  {...x,volume:x.volume+50}:x);
 const s=synthesizeResearch(b);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(s.state,'DESCRIPTIVE');
 assert.equal(r.source.windows,s.source.windows);
 assert.equal(r.source.firstAt,s.source.firstAt);
 assert.equal(r.source.lastAt,s.source.lastAt);
});
test('strong historical regime changes may surface as differences, not forecasts',()=>{
 const args=input();
 args.primary=record('BTCUSDT',{pattern:'CYCLE'});
 const r=synthesizeResearch(args);
 assert.equal(r.state,'DESCRIPTIVE');
 assert.ok(r.differences.every(x=>x.source&&x.detail));
 assert.match(r.note,/не прогноз/);
});
