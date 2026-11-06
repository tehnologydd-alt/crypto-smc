const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,JSON,Set,Map,Array});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts');
const V=load('src/radar/v66-forward-study.ts');
const D=load('src/radar/v67-study-diagnostics.ts');
const C=load('src/radar/v67-checkpoints.ts');
const T=Date.UTC(2026,10,6,21),H=300000;
const p=V.startStudyProtocol(T-1000),now=T+3*H;
const bars=Array.from({length:36},(_,i)=>({
 time:T-36*H+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true
}));
const binancePlan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',bars,T);
const bybitPlan=F.deriveFuturesStudyPlan('bybit','BTCUSDT','5m',bars,T);
assert(binancePlan?.study&&bybitPlan?.study,'forward decision context captured from closed bars');
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const base=F.createFutureTicket(binancePlan,setup,'manual',T);
const other=F.createFutureTicket(bybitPlan,{...setup,exchange:'bybit'},'manual',T);
const variant=(ticket,suffix,props={})=>({...ticket,id:ticket.id+':'+suffix,plan:{...ticket.plan,id:ticket.id+':'+suffix},...props});
const finished=(ticket,gross,type='COMPLETED')=>({...ticket,state:'CLOSED',grossUSDT:gross,
 remainingPct:0,closedAt:T+H,events:[...ticket.events,{at:T+H,type,detail:'test only'}]});
const success=finished(variant(base,'completed'),2);
const loss=finished(variant(other,'stop'),-3,'STOP');
const active=variant(base,'active');
const expired=variant(other,'expired',{state:'EXPIRED'});
const gap=variant(base,'gap',{quality:'GAP'});
const ambiguous=finished(variant(other,'manual'),500,'MANUAL');
const old=variant(base,'old',{createdAt:T-2000});
const changed=variant(base,'changed',{plan:{...base.plan,id:base.id+':changed',model:'hypothesis-v2'}});
const contextless=variant(base,'contextless',{plan:{...base.plan,id:base.id+':contextless',study:undefined}});
const ledger={version:1,tickets:[success,loss,active,expired,gap,ambiguous,old,changed,contextless]};
const report=V.summarizeStudyProtocol(p,ledger,now);
const details=D.explainFutureStudy(p,ledger,now);
assert.equal(report.eligible,6);assert.equal(report.reviewable,2);
assert.equal(details.total,9);assert.equal(details.reviewed,report.reviewable);
assert.equal(details.eligible,report.eligible);
assert.equal(details.excludedBeforeStart,report.priorExcluded);
assert.equal(details.excludedModelMismatch+details.excludedMissingContext,report.unmatchedExcluded);
assert.equal(details.excludedBeforeStart,1);assert.equal(details.excludedModelMismatch,1);
assert.equal(details.excludedMissingContext,1);assert.equal(details.active,1);
assert.equal(details.expiredOrCancelled,1);assert.equal(details.dataGaps,1);
assert.equal(details.unscoredClosed,1);
assert.equal(report.binance.complete,1);assert.equal(report.bybit.complete,1);
let archive=C.saveStudyCheckpoint(C.EMPTY_CHECKPOINTS,p,report,now);
assert.equal(archive.snapshots.length,1);
assert.equal(archive.snapshots[0].binance.complete,1);
assert.equal(archive.snapshots[0].bybit.complete,1);
assert.equal(C.saveStudyCheckpoint(archive,p,report,now),archive,'same-time snapshot is not a duplicate');
const nextTime=now+H;
const archived=C.saveStudyCheckpoint(archive,p,report,nextTime);
assert.equal(archived.snapshots.length,2);
assert.equal(archive.snapshots.length,1,'past snapshot never overwritten');
assert.equal(C.restoreStudyCheckpoints(JSON.stringify(archived),nextTime).snapshots.length,2);
assert.equal(C.restoreStudyCheckpoints(JSON.stringify(archived),now).snapshots.length,0,'cannot restore future snapshots');
assert.equal(C.checkpointsForProtocol(archived,p).length,2);
assert.equal(C.checkpointsForProtocol(archived,V.startStudyProtocol(T)).length,0,'old protocol isolation');
assert.throws(()=>C.saveStudyCheckpoint(archive,p,{...report,modelVersion:'model-changed'},nextTime));
assert.equal(D.explainFutureStudy(null,ledger,now).reviewed,0);
const app=fs.readFileSync('src/App.tsx','utf8');
for(const k of ['Центр независимой проверки','ПРОВЕРКА АКТИВНА','Сохранить контрольную точку','explainFutureStudy',
 'restoreStudyCheckpoints','saveStudyCheckpoint','studySnapshots','apex_v67_study_checkpoints',
 'setShowLegacySpotArchive(true)','forwardStudy.binance','forwardStudy.bybit','РЫНОЧНЫЙ РАДАР • 6.7'])
 assert(app.includes(k),'APEX 6.7 missing: '+k);
assert(app.includes('apex_v66_forward_protocol'),'original protocol unchanged');
assert(app.includes('apex_v63_assistant_demo')&&app.includes('apex_v64_futures_demo'),'Spot and Futures ledgers preserved');
assert(!app.includes('/v5/order/create')&&!app.includes('/fapi/v1/order'),'not connected to real order execution');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
console.log('APEX 6.7 PASS: visible active study, independent venues, exclusions, checkpoint history, no reset or real trading');
