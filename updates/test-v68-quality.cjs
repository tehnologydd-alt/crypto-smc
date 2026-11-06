const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Map,Set,Date,Math,Number,JSON,Array});
 return m.exports;
}
const H=load('src/radar/v68-market-health.ts'),S=load('src/radar/v68-cost-sensitivity.ts'),
 F=load('src/radar/v64-futures-assistant.ts'),V=load('src/radar/v66-forward-study.ts');
const T=Date.UTC(2026,10,6,18),STEP=300000;
const bars=Array.from({length:36},(_,i)=>({time:T-36*STEP+i*STEP,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
assert.equal(H.assessFuturesMarketHealth([], '5m',T).status,'NO_DATA');
const ready=H.assessFuturesMarketHealth(bars,'5m',T);
assert.equal(ready.status,'READY');assert(ready.has36Continuous);
assert.equal(ready.gaps,0);assert.equal(ready.lastClosedAt,T);
const stale=H.assessFuturesMarketHealth(bars,'5m',T+2*STEP);
assert.equal(stale.status,'STALE','stale data must not seem current');
const gap=H.assessFuturesMarketHealth([...bars.slice(0,20),...bars.slice(21)],'5m',T);
assert.equal(gap.status,'GAP');assert.equal(gap.gaps,1);
assert.equal(H.assessFuturesMarketHealth(bars.slice(-8),'5m',T).status,'INCOMPLETE');
const duplicate=H.assessFuturesMarketHealth([...bars,bars[32]],'5m',T);
assert.equal(duplicate.status,'INCOMPLETE');assert.equal(duplicate.invalid,1);
const wrong=H.assessFuturesMarketHealth(bars.map((b,i)=>i===4?{...b,low:b.high+1}:b),'5m',T);
assert.notEqual(wrong.status,'READY','invalid data cannot be reported as pristine');
const p=V.startStudyProtocol(T-1000),ledgerEmpty=F.EMPTY_FUTURES_LEDGER;
const missing=S.studyCostSensitivity(null,ledgerEmpty,T);
assert.equal(missing.observations,0);
const planB=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',bars,T);
const planY=F.deriveFuturesStudyPlan('bybit','BTCUSDT','5m',bars,T);
assert(planB&&planY);
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const ticketB=F.createFutureTicket(planB,setup,'manual',T),
 ticketY=F.createFutureTicket(planY,{...setup,exchange:'bybit'},'manual',T);
const closed=(o,result,eventType)=>({...o,state:'CLOSED',quality:'OK',remainingPct:0,grossUSDT:result,
 closedAt:T+STEP,events:[...o.events,{at:T+STEP,type:eventType,detail:'test-only'}]});
const goodB=closed(ticketB,2,'COMPLETED'),goodY=closed(ticketY,-3,'STOP');
const badGap={...closed(ticketY,999,'STOP'),id:ticketY.id+':gap',plan:{...ticketY.plan,id:ticketY.id+':gap'},quality:'GAP'};
const badManual={...closed(ticketB,999,'MANUAL'),id:ticketB.id+':manual',plan:{...ticketB.plan,id:ticketB.id+':manual'}};
const earlier={...closed(ticketB,999,'STOP'),id:ticketB.id+':old',plan:{...ticketB.plan,id:ticketB.id+':old'},createdAt:T-2000};
const noSnapshot={...closed(ticketB,999,'STOP'),id:ticketB.id+':no-context',plan:{...ticketB.plan,id:ticketB.id+':no-context',study:undefined}};
const ledger={version:1,tickets:[goodB,goodY,badGap,badManual,earlier,noSnapshot]};
const before=JSON.stringify(ledger);
const result=S.studyCostSensitivity(p,ledger,T+2*STEP);
assert.equal(JSON.stringify(ledger),before,'sensitivity must not modify original studies');
assert.equal(result.observations,2);
assert.equal(result.binance.cases[0].grossUSDT,2);
assert.equal(result.bybit.cases[0].grossUSDT,-3);
assert.equal(result.binance.cases[0].estimatedFeesUSDT,0);
assert(Math.abs(result.binance.cases[1].estimatedFeesUSDT-0.1)<1e-9);
assert(Math.abs(result.binance.cases[1].illustrativeAfterFeesUSDT-1.9)<1e-9);
assert(Math.abs(result.binance.cases[2].illustrativeAfterFeesUSDT-1.8)<1e-9);
assert.equal(result.bybit.cases[1].observations,1);
assert.equal(result.scope,'FROZEN_FORWARD_DEMO');
assert(result.warning.includes('НЕ фактический'));
const formal=V.summarizeStudyProtocol(p,ledger,T+2*STEP);
assert.equal(formal.reviewable,result.observations,'cost sensitivity uses exact scoring population');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 6.8','Качество данных','Как условные комиссии меняют результат',
 'futuresMarketHealth','studySensitivity','assessFuturesMarketHealth','studyCostSensitivity',
 'apex_v63_assistant_demo','apex_v64_futures_demo','apex_v66_forward_protocol'])
 assert(app.includes(token),'APEX 6.8 missing '+token);
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
for(const name of ['v68-cost-sensitivity.ts','v68-market-health.ts']){
 const contents=fs.readFileSync('src/radar/'+name,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 assert(!/placeOrder|createOrder|apiKey|apiSecret|signRequest|\/v5\/order\/|\/fapi\/v1\/order/.test(contents),'no real execution in '+name);
}
console.log('APEX 6.8 PASS: futures data integrity, stale/gap detection, prospective-only fee scenarios, no ledger mutation or exchange orders');
