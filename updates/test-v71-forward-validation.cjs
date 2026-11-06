const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const localRequire=name=>{
  if(name==='./v69-outcome-audit')return load('src/radar/v69-outcome-audit.ts');
  if(name==='./v64-futures-assistant')return load('src/radar/v64-futures-assistant.ts');
  return require(name);
 };
 vm.runInNewContext(js,{module,exports:module.exports,require:localRequire,Date,Math,Number,JSON,Array,Map,Set});
 return module.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 P=load('src/radar/v66-forward-study.ts'),
 H=load('src/radar/v70-hypothesis-discovery.ts'),
 V=load('src/radar/v71-forward-validation.ts');
const T=Date.UTC(2026,10,6,16),D=86400000,M=300000;
const protocol=P.startStudyProtocol(T-1000);
const candles=Array.from({length:36},(_,i)=>({
 time:T-36*M+i*M,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true
}));
const plan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',candles,T);
assert(plan?.study);
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const base=F.createFutureTicket(plan,setup,'manual',T);
const mk=(id,at,highVolume,stop=true)=>({
 ...base,id:base.id+':'+id,createdAt:at,lastBarAt:at-M,closedAt:at+M,
 state:'CLOSED',remainingPct:0,quality:'OK',tpReached:stop?0:3,grossUSDT:stop?-1:2,
 plan:{...base.plan,id:base.id+':'+id,createdAt:at,observedBarAt:at-M,
  study:{...base.plan.study,capturedAt:at,lastClosedAt:at,volumeRatio20:highVolume?2:1}},
 events:[...base.events,{at:at+M,type:stop?'STOP':'COMPLETED',detail:'hypothetical close'}]
});
const early=[];
for(let i=0;i<6;i++){
 const at=T+Math.floor(i/2)*D+(i%2)*3*M;
 early.push(mk('early-high-'+i,at,true,i<5),mk('early-middle-'+i,at+M,false,i===0));
}
const discoveryAt=T+3*D;
const candidate=H.discoverHypotheses(protocol,{version:1,tickets:early},discoveryAt).candidates.find(c=>c.source==='binance'&&c.factor==='volume');
assert(candidate,'must have an explainable research question');
const archive=H.freezeHypothesis(H.EMPTY_HYPOTHESES,protocol,candidate,discoveryAt);
assert.equal(archive.items.length,1);
const frozen=archive.items[0],original=JSON.stringify(archive);
const before=V.evaluateFrozenHypotheses(protocol,archive,{version:1,tickets:early},discoveryAt+M);
assert.equal(before.hypotheses,1);assert.equal(before.ready,0);assert.equal(before.collecting,1);
assert.equal(before.items[0].focus.n,0);assert.equal(before.items[0].comparison.n,0);
assert.equal(before.items[0].exclusions.beforeFreeze,12);
assert.equal(before.items[0].baselineGapPP,candidate.contrast.differencePctPoints);
function futurePairs(highStopCount,otherStopCount){
 const tickets=[];
 for(let i=0;i<12;i++){
  const at=discoveryAt+M+Math.floor(i/3)*D+(i%3)*3*M;
  tickets.push(mk('new-high-'+i,at,true,i<highStopCount));
  tickets.push(mk('new-mid-'+i,at+M,false,i<otherStopCount));
 }
 return tickets;
}
const now=discoveryAt+5*D;
const aligned=V.evaluateFrozenHypotheses(protocol,archive,{version:1,tickets:[...early,...futurePairs(10,2)]},now);
assert.equal(aligned.ready,1);assert.equal(aligned.collecting,0);
assert.equal(aligned.items[0].verdict,'SAME_DIRECTION');
assert.equal(aligned.items[0].focus.n,12);
assert.equal(aligned.items[0].comparison.n,12);
assert.equal(aligned.items[0].focus.days,4);
assert.equal(aligned.items[0].comparison.days,4);
assert(aligned.items[0].futureGapPP>60);
assert.equal(aligned.items[0].baselineGapPP,frozen.contrast.differencePctPoints,'original hypothesis contrast frozen');
assert.equal(JSON.stringify(archive),original,'no research archive mutation');
const opposed=V.evaluateFrozenHypotheses(protocol,archive,{version:1,tickets:[...early,...futurePairs(2,10)]},now);
assert.equal(opposed.items[0].verdict,'OPPOSITE_DIRECTION','negative out-of-sample result must be visible');
const neutral=V.evaluateFrozenHypotheses(protocol,archive,{version:1,tickets:[...early,...futurePairs(6,6)]},now);
assert.equal(neutral.items[0].verdict,'NO_CLEAR_DIFFERENCE');
const tooSmall=V.evaluateFrozenHypotheses(protocol,archive,{version:1,tickets:[...early,...futurePairs(2,10).slice(0,8)]},now);
assert.equal(tooSmall.items[0].verdict,'COLLECTING');
const sourceFuture=futurePairs(10,2),later=sourceFuture[0];
const oldOpened={...mk('old-opened',discoveryAt-M,true),closedAt:discoveryAt+2*M};
const duplicate={...later,id:later.id+':duplicated',plan:{...later.plan,id:later.id+':duplicated'}};
const gap={...mk('gap-new',discoveryAt+4*D+M,true),quality:'GAP'};
const manual=mk('manual-new',discoveryAt+4*D+2*M,true);
manual.events=[...manual.events.slice(0,-1),{at:manual.closedAt,type:'MANUAL',detail:'manually closed'}];
const hanging={...mk('waiting-new',discoveryAt+4*D+3*M,true),state:'WAITING',closedAt:undefined};
const expired={...mk('expired-new',discoveryAt+4*D+4*M,true),state:'EXPIRED'};
const futureClose={...mk('future-close',discoveryAt+4*D+5*M,true),closedAt:now+M};
const wrongCtx=mk('wrong-context',discoveryAt+4*D+6*M,true);
wrongCtx.plan.study.capturedAt=discoveryAt-1;
const noFactor=mk('no-volume',discoveryAt+4*D+7*M,true);
noFactor.plan.study.volumeRatio20=null;
const anotherVenue=mk('bybit-new',discoveryAt+4*D+8*M,true);
anotherVenue.plan.source='bybit';
const harsh={version:1,tickets:[...early,...sourceFuture,oldOpened,duplicate,gap,manual,hanging,expired,futureClose,wrongCtx,noFactor,anotherVenue]};
const stateBefore=JSON.stringify(harsh);
const checked=V.evaluateFrozenHypotheses(protocol,archive,harsh,now);
const one=checked.items[0];
assert.equal(one.verdict,'SAME_DIRECTION');
assert.equal(one.focus.n,12);assert.equal(one.comparison.n,12,'no leakage from rejected data');
assert.equal(one.exclusions.duplicate,1);
assert.equal(one.exclusions.beforeFreeze,13);
assert.equal(one.exclusions.differentVenue,1);
assert.equal(one.exclusions.missingOrGap,2);
assert.equal(one.exclusions.uncertain,1);
assert.equal(one.exclusions.pending,1);
assert.equal(one.exclusions.expired,1);
assert.equal(one.exclusions.notYetClosed,1);
assert.equal(one.exclusions.missingFactor,1);
assert.equal(JSON.stringify(harsh),stateBefore,'never mutate Futures DEMO archive');
assert.equal(JSON.stringify(archive),original,'never mutate frozen hypotheses');
assert.equal(V.evaluateFrozenHypotheses(null,archive,harsh,now).hypotheses,0,'no study protocol');
assert.equal(V.evaluateFrozenHypotheses(P.startStudyProtocol(T),archive,harsh,now).hypotheses,0,'protocol isolation');
assert.equal(V.evaluateFrozenHypotheses(protocol,archive,harsh,discoveryAt-M).hypotheses,0,'no future freeze readings');
const a=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 7.1','APEX 7.1 · Проверка гипотез на новых данных',
 'evaluateFrozenHypotheses','forwardValidation','NO_CLEAR_DIFFERENCE','Сходное отличие',
 'Противоречие','До фиксации','apex_v70_hypothesis_archive','apex_v66_forward_protocol',
 'apex_v64_futures_demo','apex_v63_assistant_demo'])
 assert(a.includes(token),'missing independent research UI '+token);
const parsed=ts.createSourceFile('App.tsx',a,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const source=fs.readFileSync('src/radar/v71-forward-validation.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiKey|apiSecret|sendOrder|executeTrade/.test(source));
console.log('APEX 7.1 PASS: strict post-freeze cohorts, exchange separation, negative results, missing data and duplicate exclusion, no archive mutation or exchange orders');
