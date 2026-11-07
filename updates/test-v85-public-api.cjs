const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const source=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,
  require:n=>n==='./v64-futures-assistant'?load('src/radar/v64-futures-assistant.ts'):require(n),
  Date,JSON,Math,Array,Map,Set,Number});
 return m.exports;
}
const M=load('src/radar/v85-public-stream.ts');
const MS=300000,T=Date.UTC(2026,10,7,14),NOW=T+MS+1000;
const bin='binance:BTCUSDT:5m',byb='bybit:BTCUSDT:5m',another='binance:DOGEUSDT:1h';
const keys=[bin,byb,another,'binance:NOT-a-symbol:5m',bin];
const binUrl=M.publicSocketEndpoint('binance',keys);
assert(binUrl.startsWith('wss://fstream.binance.com/stream?streams='));
assert(binUrl.includes('btcusdt@kline_5m'));
assert(binUrl.includes('dogeusdt@kline_1h'));
assert(!binUrl.includes('NOT-a-symbol'));
assert.equal((binUrl.match(/btcusdt@kline_5m/g)||[]).length,1,'deduplicate Binance channels');
assert.equal(M.publicSocketEndpoint('bybit',keys),'wss://stream.bybit.com/v5/public/linear');
assert.equal(M.publicSocketEndpoint('bybit',[bin]),null,'never share subscription across venue');
assert.deepEqual(Array.from(M.bybitSubscriptionArgs(keys)),['kline.5.BTCUSDT']);
assert.equal(M.venueSocketKeys(keys,'binance').length,2);
assert.equal(M.venueSocketKeys(Array(20).fill(bin),'binance').length,1);
const kline=(time=T,x=true)=>({
 e:'kline',E:time+MS,s:'BTCUSDT',
 k:{t:time,T:time+MS-1,s:'BTCUSDT',i:'5m',o:'100',h:'107',
 l:'97',c:'104',v:'12.5',x}
});
const combined={stream:'btcusdt@kline_5m',data:kline()};
const decoded=M.decodePublicClosedSocketMessage(combined,'binance',keys,NOW);
assert.equal(decoded.length,1);assert.equal(decoded[0].key,bin);
assert.equal(decoded[0].bar.time,T);
assert.equal(decoded[0].bar.close,104);
assert.equal(decoded[0].bar.closed,true);
assert.equal(M.decodePublicClosedSocketMessage({...combined,data:kline(T,false)},'binance',keys,NOW).length,0,
 'an OPEN Binance kline can never count as closed data');
assert.equal(M.decodePublicClosedSocketMessage({...combined,stream:'btcusdt@kline_1h'},'binance',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({...combined,data:{...kline(),s:'DOGEUSDT'}},'binance',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({...combined,data:{...kline(),k:{...kline().k,v:'-5'}}},'binance',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({...combined,data:{...kline(),k:{...kline().k,h:'99'}}},'binance',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({...combined,data:kline(T+MS)},'binance',keys,NOW).length,0,
 'future candles cannot be recognized');
assert.equal(M.decodePublicClosedSocketMessage(combined,'binance',[byb],NOW).length,0);
const bybit=(time=T,confirm=true)=>({
 topic:'kline.5.BTCUSDT',type:'snapshot',ts:NOW,
 data:[{start:time,end:time+MS-1,interval:'5',open:'100',high:'107',
 low:'97',close:'105',volume:'12',confirm}]
});
const bd=M.decodePublicClosedSocketMessage(bybit(),'bybit',keys,NOW);
assert.equal(bd.length,1);assert.equal(bd[0].key,byb);assert.equal(bd[0].bar.close,105);
assert.equal(M.decodePublicClosedSocketMessage(bybit(T,false),'bybit',keys,NOW).length,0,
 'Bybit confirm=false must be ignored');
assert.equal(M.decodePublicClosedSocketMessage({...bybit(),topic:'kline.60.BTCUSDT'},'bybit',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({...bybit(),topic:'kline.5.ETHUSDT'},'bybit',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({...bybit(),data:[{...bybit().data[0],interval:'60'}]},'bybit',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage({},'bybit',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage(null,'binance',keys,NOW).length,0);
assert.equal(M.decodePublicClosedSocketMessage(bybit(),'binance',keys,NOW).length,0,'cannot mix Binance and Bybit protocol');
let obs={};
obs=M.addSocketObservation(obs,decoded[0],NOW);
assert.equal(obs[bin].lastConfirmedAt,T+MS);
assert.equal(obs[bin].messages,1);
assert.equal(obs[bin].gaps,0);
assert.equal(M.addSocketObservation(obs,decoded[0],NOW),obs,'duplicates must not add fake candles');
obs=M.addSocketObservation(obs,bd[0],NOW);
assert.equal(obs[byb].close,105);
assert.equal(obs[bin].close,104,'venue prices stay independent');
const later=M.decodePublicClosedSocketMessage({...combined,data:kline(T+2*MS)},'binance',keys,T+3*MS+1000)[0];
obs=M.addSocketObservation(obs,later,T+3*MS+1000);
assert.equal(obs[bin].messages,2);
assert.equal(obs[bin].gaps,1,'missing one closed candle recorded, not invented');
const state={venue:'binance',status:'OPEN',connectedAt:NOW,lastMessageAt:NOW,attempts:1,error:null,subscriptions:2};
assert.equal(M.socketAgeState(obs[bin],state,'5m',T+3*MS+1000),'FRESH');
assert.equal(M.socketAgeState(obs[bin],state,'5m',T+10*MS),'STALE');
assert.equal(M.socketAgeState(undefined,state,'5m',NOW),'NO_CLOSE');
assert.equal(M.socketAgeState(obs[bin],{...state,status:'PAUSED'},'5m',NOW),'PAUSED');
assert.equal(M.socketAgeState(obs[bin],{...state,status:'ERROR'},'5m',NOW),'ERROR');
assert.equal(M.socketAgeState(obs[bin],{...state,status:'RETRYING'},'5m',NOW),'CONNECTING');
assert.equal(M.socketAgeState(obs[bin],undefined,'5m',NOW),'OFF');
const code=fs.readFileSync('src/radar/v85-public-stream.ts','utf8');
assert(!/apiKey|apiSecret|placeOrder|sendOrder|fapi\/v1\/order|v5\/order\/create|listenKey/.test(code));
const app=fs.readFileSync('src/App.tsx','utf8');
for(const label of ['РЫНОЧНЫЙ РАДАР • 8.5',
 'APEX 8.5 · Биржевые API · публичные потоки',
 'publicSocketEnabled','publicSocketStates','publicSocketObservations',
 'publicSocketKeyList','venueSocketKeys','publicSocketEndpoint',
 'decodePublicClosedSocketMessage','addSocketObservation',
 'socketAgeState','wss://','WebSocket','visibilitychange','clearTimeout',
 'Счёт Binance','Режимы виртуального ассистента',
 'apex_v76_rolling_checkpoints','apex_v64_futures_demo',
 'checkDemoMargin','Виртуальный баланс']){
 if(label==='wss://')continue;
 assert(app.includes(label),'APEX 8.5 source/UI missing '+label);
}
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
 ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
assert(app.includes('fetchFuturesClosedBars('),'existing REST closed-candle authority preserved');
assert(!app.includes('setFuturesBars(prev=>addSocketObservation'),
 'socket diagnostics must NEVER be the source of paper trading bars');
assert(!fs.readFileSync('updates/apply-v85.cjs','utf8').includes('enrollMarginAwareTicket('),
 'this overlay must not change execution or margin admission');
console.log('APEX 8.5 PASS: whitelisted dual-exchange public API streams, strict closure/source evidence, gaps, offline statuses and unchanged REST DEMO research');
