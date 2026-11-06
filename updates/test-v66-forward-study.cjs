const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,JSON,Set,Map,Array});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),V=load('src/radar/v66-forward-study.ts');
const T=Date.UTC(2026,10,6,20,0,0),H=300000;
const s=V.startStudyProtocol(T-1000);
assert.equal(s.id,'forward-demo-v1:'+(T-1000));
assert.equal(V.restoreStudyProtocol(JSON.stringify(s),T)?.id,s.id);
assert.equal(V.restoreStudyProtocol(JSON.stringify({...s,startedAt:T+1}),T),null,'future cutoff invalid');
assert.equal(V.restoreStudyProtocol(JSON.stringify({...s,modelVersion:'changed-model'}),T),null,'model switch invalid');
assert.equal(V.summarizeStudyProtocol(null,F.EMPTY_FUTURES_LEDGER,T).verdict,'NOT_STARTED');
const bars=Array.from({length:36},(_,i)=>({
 time:T-36*H+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true
}));
const plan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',bars,T);
assert(plan?.study,'real frozen context');
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const p=F.createFutureTicket(plan,setup,'manual',T);
const closed={...p,state:'CLOSED',quality:'OK',remainingPct:0,grossUSDT:3,closedAt:T+H,
 events:[...p.events,{at:T+H,type:'COMPLETED',detail:'three targets'}]};
const bybit={...closed,id:'futures:bybit:BTCUSDT:5m:next',
 plan:{...plan,id:'futures:bybit:BTCUSDT:5m:next',source:'bybit'},grossUSDT:-4,
 events:[...p.events,{at:T+H,type:'STOP',detail:'stop'}]};
const manual={...closed,id:'futures:binance:ETHUSDT:5m:manual',
 plan:{...plan,id:'futures:binance:ETHUSDT:5m:manual'},grossUSDT:99,
 events:[...p.events,{at:T+H,type:'MANUAL',detail:'unknown fill'}]};
const missing={...closed,id:'futures:bybit:ETHUSDT:5m:gap',
 plan:{...plan,id:'futures:bybit:ETHUSDT:5m:gap',source:'bybit'},quality:'GAP',grossUSDT:100};
const prior={...closed,id:'futures:binance:BTCUSDT:5m:prior',createdAt:T-2000,
 plan:{...plan,id:'futures:binance:BTCUSDT:5m:prior'},grossUSDT:200};
const backfill={...closed,id:'futures:binance:BTCUSDT:5m:backfill',
 plan:{...plan,id:'futures:binance:BTCUSDT:5m:backfill',study:{...plan.study,capturedAt:T+1}},grossUSDT:300};
const mismatch={...closed,id:'futures:binance:BTCUSDT:5m:mismatch',
 plan:{...plan,id:'futures:binance:BTCUSDT:5m:mismatch',model:'new-model'},grossUSDT:400};
const result=V.summarizeStudyProtocol(s,{version:1,tickets:[closed,bybit,manual,missing,prior,backfill,mismatch]},T+2*H);
assert.equal(result.eligible,4);
assert.equal(result.priorExcluded,1);
assert.equal(result.unmatchedExcluded,2);
assert.equal(result.reviewable,2);
assert.equal(result.binance.complete,1);
assert.equal(result.bybit.complete,1);
assert.equal(result.binance.grossUSDT,3);
assert.equal(result.bybit.grossUSDT,-4);
assert.equal(result.binance.unscored,1,'unknown execution omitted');
assert.equal(result.bybit.gaps,1,'missing candles omitted');
assert.equal(result.verdict,'COLLECTING');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['Начать проверку на новых данных','apex_v66_forward_protocol','summarizeStudyProtocol','forwardStudy.binance','forwardStudy.bybit',
 'Виртуальный номинал позиции','Расчётная маржа','(futuresNotional/100).toFixed(2)'])
 assert(app.includes(token),'missing forward-study interface '+token);
assert(app.includes('apex_v63_assistant_demo')&&app.includes('apex_v64_futures_demo'),'both pre-existing journals preserved');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
console.log('APEX 6.6 PASS: nominal/margin clarity, opt-in frozen future-only study, independent venues, exclusion of pre-existing, backfilled or uncertain outcomes');
