import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTranscript,mergeTranscripts,batchTranscripts,readTranscripts,writeTranscripts,HISTORY_KEY,MAX_TRANSCRIPTS,validateTranscriptArchive} from './apex-research-history.mjs';
const now=1794650000000;
const run=(asset='BTCUSDT',startedAt=now-86400000)=>({
 version:1,asset,startedAt,stage:'ANALYST_READY',
 evidence:[{source_id:'binance:spot:24h:'+asset+':'+startedAt,observed_at:startedAt-1000,text:'Test public snapshot'}],
 sourceIds:['binance:spot:24h:'+asset+':'+startedAt],
 analystText:'Insufficient evidence to establish a causal claim.'
});
const complete=s=>({...s,stage:'COMPLETE',criticAt:s.startedAt+300000,criticText:'The analyst conclusion remains unverified.',criticEvidence:s.evidence});
test('old completed study is restored as history without becoming a live session',()=>{
 const a=run(),b=complete(a);
 assert.equal(normalizeTranscript(b,now).stage,'COMPLETE');
 assert.equal(mergeTranscripts([b],[a],now).length,1);
 assert.equal(mergeTranscripts([b],[a],now)[0].stage,'COMPLETE');
 assert.equal(mergeTranscripts([a],[b],now)[0].stage,'COMPLETE');
});
test('conflicting replay and cross-asset evidence are rejected',()=>{
 const a=run();
 assert.equal(normalizeTranscript({...a,evidence:run('ETHUSDT').evidence},now),null);
 const rows=mergeTranscripts([a],[complete({...a,analystText:'A conflicting replacement for original text.'})],now);
 assert.equal(rows[0].stage,'ANALYST_READY');
});
test('batch recovery and storage are bounded, per asset and replay-idempotent',()=>{
 const a=run(),b=run('ETHUSDT');
 const batch={version:1,stage:'COMPLETE',startedAt:a.startedAt,items:[complete(a),complete(b)]};
 const recovered=batchTranscripts(batch);
 const rows=mergeTranscripts([],recovered,now);
 assert.equal(rows.length,2);
 assert.equal(mergeTranscripts(rows,recovered,now).length,2);
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(writeTranscripts(store,rows),true);
 assert.deepEqual(readTranscripts(store,now),rows);
 assert.equal(writeTranscripts({setItem(){throw Error('quota');}},rows),false);
 const many=Array.from({length:250},(_,i)=>run('BTCUSDT',now-86400000+i));
 assert.equal(mergeTranscripts([],many,now).length,MAX_TRANSCRIPTS);
 map.set(HISTORY_KEY,'broken');
 assert.deepEqual(readTranscripts(store,now),[]);
});

test('portable archive validation rejects duplicate, malformed and over-capacity records',()=>{
 const a=normalizeTranscript(complete(run()),now);
 assert.equal(validateTranscriptArchive({version:1,rows:[a]},now).rows.length,1);
 assert.equal(validateTranscriptArchive({version:1,rows:[a,a]},now),null);
 assert.equal(validateTranscriptArchive({version:1,rows:[{...a,asset:'ETHUSDT'}]},now),null);
 assert.equal(validateTranscriptArchive({version:1,rows:Array(201).fill(a)},now),null);
});
