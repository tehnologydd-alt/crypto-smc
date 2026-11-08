import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCompletedResearch,classifyResearchPath} from './research-patterns.mjs';
const H=3600000,base=1700002799999,now=base+1500*H;
function caseRecord(i,pattern='STAYED_INSIDE',asset='BTCUSDT'){
 const a=base+i*5*H,target=a+4*H;
 const prices=pattern==='STAYED_INSIDE'?[100,100,101,99,102]:
  pattern==='RETURNED_INSIDE'?[100,100,108,100,101]:
  [100,101,100,103,110];
 const row={id:'range1:'+asset+':1h:'+a,asset,interval:'1h',
  publishedAt:a+1000,status:'COMPLETED',
  hypothesis:JSON.stringify({model:'EMPIRICAL_CLOSE_RANGE_V1',
   anchorCloseAt:a,targetCloseAt:target,anchorClose:100,
   bandLow:95,bandHigh:105,sampleBars:96,horizonBars:4}),
  evaluation:{targetCloseAt:target,evaluatedAt:target+1000,
   outcome:pattern==='FINISHED_OUTSIDE'?'OUTSIDE_RANGE':'WITHIN_RANGE',
   actualClose:prices[4]}};
 const bars=prices.map((close,j)=>({
  t:a+j*H-H+1,closeAt:a+j*H,open:close,close,
  high:close+1,low:close-1,volume:10,closed:true
 }));
 return {row,bars};
}
function dataset(n=42){
 const all=Array.from({length:n},(_,i)=>
  caseRecord(i,['STAYED_INSIDE','RETURNED_INSIDE','FINISHED_OUTSIDE'][i%3]));
 return {rows:all.map(x=>x.row),bars:all.flatMap(x=>x.bars)};
}
test('three predeclared classifications use 4 real next-hour closes',()=>{
 for(const type of ['STAYED_INSIDE','RETURNED_INSIDE','FINISHED_OUTSIDE']){
  const x=caseRecord(0,type);
  const r=compareCompletedResearch([x.row],x.bars,{
   asset:'BTCUSDT',now,totalPublished:1});
  assert.equal(r.overall.counts[type],1);
  assert.equal(r.counts.accepted,1);
 }
 assert.equal(classifyResearchPath(null),null);
});
test('42 nonoverlapping completed studies split into chronological folds',()=>{
 const x=dataset();
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:x.rows.length});
 assert.equal(r.state,'DESCRIPTIVE');
 assert.equal(r.periods.length,3);
 assert.deepEqual(r.periods.map(x=>x.samples),[14,14,14]);
 assert.equal(r.counts.accepted,42);
 assert.equal(r.patterns.reduce((s,p)=>s+p.count,0),42);
 assert.ok(r.patterns.every(p=>p.periodRates.length===3));
});
test('less than 36 studies cannot publish a repeatability percentage',()=>{
 const x=dataset(24);
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:24});
 assert.equal(r.state,'INSUFFICIENT');
 assert.equal(r.patterns[0].periodRates,null);
});
test('truncated journal hides rates even when 42 entries are available',()=>{
 const x=dataset();
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:80});
 assert.equal(r.state,'INCOMPLETE_EVIDENCE');
 assert.equal(r.patterns[1].periodRates,null);
 assert.equal(r.truncated,true);
});
test('overdue scenario without source outcome blocks cherry-picked rates',()=>{
 const x=dataset();
 x.rows.push({...caseRecord(50).row,evaluation:null});
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:x.rows.length});
 assert.equal(r.counts.dueMissing,1);
 assert.equal(r.state,'INCOMPLETE_EVIDENCE');
 assert.equal(r.patterns[0].periodRates,null);
});
test('absence of intermediate H1 bar cannot be interpolated into a pattern',()=>{
 const x=dataset();
 x.bars=x.bars.filter(b=>b.closeAt!==base+9*5*H+2*H);
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:42});
 assert.equal(r.counts.missingCandles,1);
 assert.equal(r.state,'INCOMPLETE_EVIDENCE');
 assert.equal(r.counts.accepted,41);
});
test('source disagreement, duplicate IDs and overlap are not double counted',()=>{
 const x=dataset();
 const extra=caseRecord(0,'STAYED_INSIDE').row;
 x.rows.push({...extra,id:extra.id}); // exact duplicate
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:43});
 assert.equal(r.counts.invalid,1);
 assert.equal(r.state,'INCOMPLETE_EVIDENCE');
 const overlap=caseRecord(0,'STAYED_INSIDE');
 const a=JSON.parse(overlap.row.hypothesis),b={...a,
  anchorCloseAt:a.anchorCloseAt+H,targetCloseAt:a.targetCloseAt+H};
 const shifted={...overlap.row,id:'range1:BTCUSDT:1h:'+b.anchorCloseAt,
  hypothesis:JSON.stringify(b),publishedAt:b.anchorCloseAt+1000,
  evaluation:{...overlap.row.evaluation,targetCloseAt:b.targetCloseAt,
   evaluatedAt:b.targetCloseAt+1000}};
 // Missing shifted future bars -> treated as non-comparable, never accepted.
 const k=compareCompletedResearch([overlap.row,shifted],overlap.bars,{
  asset:'BTCUSDT',now,totalPublished:2});
 assert.ok(k.counts.accepted<=1);
});
test('foreign asset outcomes are never pooled into a single cohort',()=>{
 const x=dataset(40);
 const eth=caseRecord(50,'FINISHED_OUTSIDE','ETHUSDT');
 const r=compareCompletedResearch([...x.rows,eth.row],
  [...x.bars,...eth.bars],{asset:'BTCUSDT',now,totalPublished:41});
 assert.equal(r.counts.accepted,40);
 assert.equal(r.overall.counts.FINISHED_OUTSIDE,13);
});
test('future outcome, corrupted actual close or invalid original method is excluded',()=>{
 const x=dataset();
 x.rows[0]={...x.rows[0],evaluation:{...x.rows[0].evaluation,
  actualClose:999,outcome:'WITHIN_RANGE'}};
 const r=compareCompletedResearch(x.rows,x.bars,{
  asset:'BTCUSDT',now,totalPublished:42});
 assert.equal(r.state,'INCOMPLETE_EVIDENCE');
 assert.equal(r.counts.invalid,1);
});
