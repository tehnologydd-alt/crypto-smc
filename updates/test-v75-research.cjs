const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};const requireLocal=name=>{
  const known={'./v64-futures-assistant':'src/radar/v64-futures-assistant.ts',
   './v67-checkpoints':'src/radar/v67-checkpoints.ts'};
  return known[name]?load(known[name]):require(name);
 };
 vm.runInNewContext(js,{module:m,exports:m.exports,require:requireLocal,Date,Math,Number,JSON,Array,Set,Map});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts');
const V=load('src/radar/v66-forward-study.ts');
const C=load('src/radar/v67-checkpoints.ts');
const G=load('src/radar/v75-favorites-research.ts');
const S=load('src/radar/v75-checkpoint-continuation.ts');
const P=load('src/radar/v75-demo-profit.ts');
const T=Date.UTC(2026,10,7,11),H=300000,DAY=86400000;
assert.equal(G.normalizeFavoriteSymbol('tonusdt'),'GRAMUSDT','old ticker is renamed only when preparing new requests');
assert.equal(G.normalizeFavoriteSymbol(' DOGEUSDT '),'DOGEUSDT');
assert.equal(G.normalizeFavoriteSymbol('NOTAUDITEDBTC'),null);
assert.equal(G.normalizeFavoriteSymbol('TONBTC'),null);
assert.equal(G.futuresFavoriteUniverse(['BTCUSDT','TONUSDT','GRAMUSDT','DOGEUSDT','DOGEUSDT','ETHBTC']).join(','),'BTCUSDT,GRAMUSDT,DOGEUSDT');
const fav=['DOGEUSDT','GRAMUSDT','BTCUSDT','ETHUSDT','XRPUSDT','ADAUSDT','SOLUSDT'];
const visited=new Set([0,1,2].flatMap(round=>G.favoriteBatch(fav,round)));
assert.equal(visited.size,7,'all favorite pairs get seen over bounded rotating scans');
assert.equal(G.favoriteBatch(fav,0).length,4);assert.equal(G.favoriteBatch(fav,1).length,4);
const keys=G.favoritesObserveKeys('binance','5m','BTCUSDT',fav,0,true,true,F.EMPTY_FUTURES_LEDGER);
assert(keys.includes('binance:DOGEUSDT:5m'));assert(keys.includes('binance:GRAMUSDT:5m'));
assert(keys.every(x=>x.startsWith('binance:')));
assert.equal(G.favoritesObserveKeys('binance','5m','BTCUSDT',fav,0,false,true,F.EMPTY_FUTURES_LEDGER).length,1);
assert.equal(G.favoritesObserveKeys('binance','5m','BTCUSDT',fav,0,true,false,F.EMPTY_FUTURES_LEDGER).length,4);
const bars=Array.from({length:36},(_,i)=>({time:T-36*H+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
const observations={'binance:DOGEUSDT:5m':bars,'binance:GRAMUSDT:5m':bars};
const plans=G.deriveFavoritePlans('binance','5m',fav,0,observations,T);
assert.equal(plans.length,2);
assert(plans.some(x=>x.symbol==='GRAMUSDT'));assert(plans.some(x=>x.symbol==='DOGEUSDT'));
assert.equal(G.deriveFavoritePlans('bybit','5m',fav,0,observations,T).length,0);
const feed=G.favoriteFeedOverview('binance','5m',fav,observations,F.EMPTY_FUTURES_LEDGER,T);
assert.equal(feed.length,7);
assert.equal(feed.find(x=>x.symbol==='DOGEUSDT').state,'SIGNAL');
assert.equal(feed.find(x=>x.symbol==='SOLUSDT').state,'NO_DATA');
const noSignal=bars.map((b,i)=>({...b,open:101,high:102,low:100,close:101,volume:10}));
const f2=G.favoriteFeedOverview('binance','5m',['DOGEUSDT'],{'binance:DOGEUSDT:5m':noSignal},F.EMPTY_FUTURES_LEDGER,T);
assert.equal(f2[0].state,'OBSERVING','no signal is not a fetch failure');
const frameOld=G.favoriteFeedOverview('binance','5m',['DOGEUSDT'],observations,F.EMPTY_FUTURES_LEDGER,T+2*H);
assert.equal(frameOld[0].state,'STALE');
const fixtureSetup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',
 notionalUSDT:100,portions:[50,30,20],breakeven:true};
const fixture=F.createFutureTicket(plans[0],fixtureSetup,'manual',T);
const scored=(id,exchange,gross)=>({
 ...fixture,id:fixture.id+':'+id,createdAt:T,closedAt:T+H,state:'CLOSED',quality:'OK',
 remainingPct:0,grossUSDT:gross,
 plan:{...fixture.plan,id:fixture.plan.id+':'+id,source:exchange,createdAt:T,study:{...fixture.plan.study,capturedAt:T}},
 setup:{...fixtureSetup,exchange},
 events:[...fixture.events,{at:T+H,type:gross<0?'STOP':'COMPLETED',detail:'study'}]
});
const protocol=V.startStudyProtocol(T-1000),now=T+2*H;
const ledger={version:1,tickets:[
 scored('b-plus','binance',4),scored('b-minus','binance',-2),scored('y-zero','bybit',0)
]};
const previous=JSON.stringify(ledger);
const p=P.demoProfitBreakdown(protocol,ledger,5,now);
assert.equal(p.total.reviewed,3);assert.equal(p.total.profitable,1);
assert.equal(p.total.losing,1);assert.equal(p.total.flat,1);
assert.equal(p.total.grossGainsUSDT,4);assert.equal(p.total.grossLossesUSDT,-2);
assert.equal(p.total.grossUSDT,2);
assert(Math.abs(p.total.hypotheticalFeesUSDT-0.3)<1e-10);
assert(Math.abs(p.total.illustrativeNetUSDT-1.7)<1e-10);
assert.equal(p.binance.reviewed,2);assert.equal(p.bybit.reviewed,1);
assert.equal(P.demoProfitBreakdown(protocol,ledger,0,now).total.illustrativeNetUSDT,2);
assert.equal(P.demoProfitBreakdown(null,ledger,5,now).total.reviewed,0);
assert.equal(JSON.stringify(ledger),previous,'P&L view never modifies demo tickets');
const emptyVenue={plans:0,complete:0,active:0,expired:0,gaps:0,unscored:0,positive:0,negative:0,flat:0,grossUSDT:0};
function report(n){return {startedAt:protocol.startedAt,modelVersion:protocol.modelVersion,eligible:n,
 binance:{...emptyVenue,plans:n,complete:n,positive:n,grossUSDT:n},bybit:{...emptyVenue},
 priorExcluded:0,unmatchedExcluded:0,reviewable:n,verdict:'COLLECTING',daysObserved:0};}
let legacy=C.EMPTY_CHECKPOINTS,cont=S.EMPTY_CONTINUATION;
for(let i=1;i<=64;i++){
 const r=S.appendCheckpoint(legacy,cont,protocol,report(i),T+i*1000);
 assert.equal(r.written,'legacy');legacy=r.legacy;cont=r.continuation;
}
assert.equal(legacy.snapshots.length,64);assert.equal(cont.segments.length,0);
const legacyBefore=JSON.stringify(legacy);
let r=S.appendCheckpoint(legacy,cont,protocol,report(65),T+65000);
assert.equal(r.written,'continuation');cont=r.continuation;
assert.equal(JSON.stringify(legacy),legacyBefore,'past 64 are untouched');
assert.equal(cont.segments.length,1);assert.equal(cont.segments[0].snapshots[0].reviewable,65);
assert.equal(S.combinedCheckpoints(legacy,cont,protocol).length,65);
assert.equal(S.restoreContinuation(JSON.stringify(cont),legacy,T+65000).segments.length,1);
const noAuto=S.autoAppendCheckpoint(legacy,cont,protocol,report(65),true,T+66000);
assert.equal(noAuto.written,null,'no automatic duplicate');
const yesAuto=S.autoAppendCheckpoint(legacy,cont,protocol,report(70),true,T+70000);
assert.equal(yesAuto.written,'continuation');cont=yesAuto.continuation;
assert.equal(cont.segments.at(-1).snapshots.length,2);
const manual=S.appendCheckpoint(legacy,cont,protocol,report(71),T+71000);
assert.equal(manual.written,'continuation');
const autoOff=S.autoAppendCheckpoint(legacy,cont,protocol,report(76),false,T+72000);
assert.equal(autoOff.written,null);
assert.equal(S.restoreContinuation(JSON.stringify(cont),legacy,T+65000).segments.length,0,'future snapshots rejected');
assert.equal(S.combinedCheckpoints(legacy,cont,V.startStudyProtocol(T)).length,0,'protocol isolation');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const word of ['РЫНОЧНЫЙ РАДАР • 7.5','Все избранные · DEMO','Избранные','DOGEUSDT',
 'favoritesObserveKeys','deriveFavoritePlans','futuresFavoriteUniverse','favoriteRound',
 'apex_v75_checkpoint_continuation','combinedCheckpoints','autoAppendCheckpoint','appendCheckpoint',
 'Сохранить контрольную точку','Положительные и отрицательные результаты DEMO','demoProfitBreakdown',
 'grossGainsUSDT','hypotheticalFeesUSDT','apex_v66_forward_protocol','apex_v67_study_checkpoints',
 'apex_v64_futures_demo','apex_v70_hypothesis_archive','APEX 7.3 · Интеллектуальный наставник'])
 assert(app.includes(word),'7.5 expected integration: '+word);
assert(!app.includes('disabled={studySnapshots.length>=64}'),'UI must not block after 64');
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
for(const name of ['v75-favorites-research.ts','v75-checkpoint-continuation.ts','v75-demo-profit.ts']){
 const code=fs.readFileSync('src/radar/'+name,'utf8');
 assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiSecret|apiKey|executeTrade/.test(code));
}
console.log('APEX 7.5 PASS: all favorites rotated, GRAM migration only new, source separation, growing immutable checkpoints beyond 64, win/loss and hypothetical fees');
