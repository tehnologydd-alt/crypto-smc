const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const source=fs.readFileSync(path,'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(compiled,{module:m,exports:m.exports,require:name=>name==='./v69-outcome-audit'?load('src/radar/v69-outcome-audit.ts'):require(name),Date,Math,Number,JSON,Array,Set,Map});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 V=load('src/radar/v66-forward-study.ts'),
 G=load('src/radar/v70-hypothesis-discovery.ts');
const T=Date.UTC(2026,10,6,18),DAY=86400000,H=300000;
const protocol=V.startStudyProtocol(T-1000),now=T+5*DAY;
const bars=Array.from({length:36},(_,i)=>({time:T-36*H+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
const plan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',bars,T);
assert(plan?.study,'must capture predecision conditions');
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const base=F.createFutureTicket(plan,setup,'manual',T);
function outcome(id,volume,finishedAs,at){
 const p={...base.plan,id:base.plan.id+':'+id,createdAt:at,observedBarAt:at-H,
 study:{...base.plan.study,capturedAt:at,volumeRatio20:volume}};
 return {...base,id:p.id,plan:p,createdAt:at,lastBarAt:at-H,closedAt:at+H,
  state:'CLOSED',remainingPct:0,grossUSDT:finishedAs==='STOP'?-1:1,quality:'OK',
  events:[...base.events,{at:at+H,type:finishedAs,detail:'only paper history'}]};
}
const valid=[];
for(let i=0;i<6;i++){
 const at=T+Math.floor(i/2)*DAY+i*1000;
 valid.push(outcome('high-'+i,2,i<5?'STOP':'COMPLETED',at));
 valid.push(outcome('middle-'+i,1,i===0?'STOP':'COMPLETED',at+20));
}
const excludedBefore=outcome('old',2,'STOP',T-2000);
const excludedGap={...outcome('gap',2,'STOP',T+DAY),quality:'GAP'};
const excludedManual={...outcome('manual',2,'MANUAL',T+DAY)};
const excludedFutureClosed={...outcome('from-future',2,'STOP',T+DAY),closedAt:now+H};
const excludedWithoutClose={...outcome('no-closed-time',2,'STOP',T+DAY),closedAt:undefined};
const excludedWrongContext=outcome('late-context',2,'STOP',T+DAY);
excludedWrongContext.plan.study.capturedAt=excludedWrongContext.createdAt+1;
const ledger={version:1,tickets:[...valid,excludedBefore,excludedGap,excludedManual,excludedFutureClosed,
 excludedWithoutClose,excludedWrongContext]};
const before=JSON.stringify(ledger);
const report=G.discoverHypotheses(protocol,ledger,now);
assert.equal(JSON.stringify(ledger),before,'generator must not mutate demo ledger');
assert.equal(report.screened,8);
assert.equal(report.eligibleClosed,12,'only previously closed reviewable outcomes');
assert.equal(report.candidates.length,1,'only one predefined contrast passes sample and difference gates');
const c=report.candidates[0];
assert.equal(c.source,'binance');assert.equal(c.factor,'volume');assert.equal(c.focusKey,'high');
assert.equal(c.contrast.focusN,6);assert.equal(c.contrast.otherN,6);
assert.equal(c.contrast.focusStop,5);assert.equal(c.contrast.otherStop,1);
assert(c.contrast.differencePctPoints>60);
assert.equal(c.observationEndAt,now);assert.equal(c.discoveryAt,now);
assert.equal(c.researchOnly,true);
assert(report.candidates.every(x=>!x.description.includes('доказано')),'no evidence overclaims');
let archive=G.freezeHypothesis(G.EMPTY_HYPOTHESES,protocol,c,now);
assert.equal(archive.items.length,1);assert.equal(archive.items[0].stage,'AWAITING_FUTURE_TEST');
assert.equal(G.freezeHypothesis(archive,protocol,c,now),archive,'immutable ID prevents duplicate history');
assert.equal(G.hypothesesForProtocol(archive,protocol).length,1);
assert.equal(G.hypothesesForProtocol(archive,V.startStudyProtocol(T)).length,0,'protocol isolation');
const copy=G.restoreHypothesisArchive(JSON.stringify(archive),now);
assert.equal(copy.items.length,1,'local restoration');
assert.equal(G.restoreHypothesisArchive(JSON.stringify(archive),now-1).items.length,0,
 'cannot accept a frozen hypothesis from the future');
assert.equal(G.restoreHypothesisArchive(JSON.stringify({version:1,items:[archive.items[0],archive.items[0]]}),now).items.length,0,
 'reject duplicates in persisted research archive');
const tampered={...archive.items[0],contrast:{...archive.items[0].contrast,focusStopPct:99}};
assert.equal(G.restoreHypothesisArchive(JSON.stringify({version:1,items:[tampered]}),now).items.length,0,
 'reject self-inconsistent evidence');
const changed=G.discoverHypotheses(protocol,{version:1,tickets:[...valid.slice(0,3)]},now);
assert.equal(changed.candidates.length,0,'small sample cannot be promoted to a candidate');
assert.equal(archive.items[0].contrast.focusN,6,'archived baseline never updates with new data');
assert.equal(G.discoverHypotheses(null,ledger,now).candidates.length,0);
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 7.0','APEX 7.0 · Генератор гипотез DEMO','discoverHypotheses',
 'freezeHypothesis','restoreHypothesisArchive','apex_v70_hypothesis_archive',
 'Зафиксировать для будущей проверки','frozenStudyHypotheses',
 'apex_v63_assistant_demo','apex_v64_futures_demo','apex_v66_forward_protocol','apex_v67_study_checkpoints',
 'Разбор ошибок и условий'])
 assert(app.includes(token),'missing APEX 7.0 UI/source token: '+token);
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const raw=fs.readFileSync('src/radar/v70-hypothesis-discovery.ts','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiKey|apiSecret|sendOrder|executeTrade/.test(raw),'no trading orders or credentials');
console.log('APEX 7.0 PASS: prospective research-only hypotheses, fixed gates, closed-at cutoff, sample checks, immutable persistence, no signal modification');
