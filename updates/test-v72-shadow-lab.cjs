const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const src=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 const localRequire=name=>{
  const known={'./v69-outcome-audit':'src/radar/v69-outcome-audit.ts',
   './v64-futures-assistant':'src/radar/v64-futures-assistant.ts',
   './v70-hypothesis-discovery':'src/radar/v70-hypothesis-discovery.ts',
   './v71-forward-validation':'src/radar/v71-forward-validation.ts'};
  return known[name]?load(known[name]):require(name);
 };
 vm.runInNewContext(js,{module:m,exports:m.exports,require:localRequire,Date,Math,Number,JSON,Array,Set,Map});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 P=load('src/radar/v66-forward-study.ts'),
 H=load('src/radar/v70-hypothesis-discovery.ts'),
 V=load('src/radar/v72-shadow-lab.ts');
const T=Date.UTC(2026,10,6,15),D=86400000,M=300000;
const protocol=P.startStudyProtocol(T-1000);
const candles=Array.from({length:36},(_,i)=>({time:T-36*M+i*M,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
const plan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',candles,T);
assert(plan?.study);
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const ticket=F.createFutureTicket(plan,setup,'manual',T);
function mk(id,at,high,stop=true){
 const p={...ticket.plan,id:ticket.plan.id+':'+id,createdAt:at,observedBarAt:at-M,
  study:{...ticket.plan.study,capturedAt:at,lastClosedAt:at,volumeRatio20:high?2:1}};
 return {...ticket,id:p.id,plan:p,createdAt:at,lastBarAt:at-M,closedAt:at+M,
  state:'CLOSED',remainingPct:0,quality:'OK',grossUSDT:stop?-1:1,tpReached:stop?0:3,
  events:[...ticket.events,{at:at+M,type:stop?'STOP':'COMPLETED',detail:'synthetic test fixture only'}]};
}
const discoveryHistory=[];
for(let i=0;i<6;i++){
 const at=T+Math.floor(i/2)*D+(i%2)*3*M;
 discoveryHistory.push(mk('before-high-'+i,at,true,i<5),mk('before-mid-'+i,at+M,false,i===0));
}
const discoveryAt=T+3*D;
const candidate=H.discoverHypotheses(protocol,{version:1,tickets:discoveryHistory},discoveryAt).candidates
 .find(h=>h.source==='binance'&&h.factor==='volume');
assert(candidate,'expected an explicit study question');
const frozen=H.freezeHypothesis(H.EMPTY_HYPOTHESES,protocol,candidate,discoveryAt).items[0];
const started=discoveryAt+M;
const first=V.createShadowVersion(V.EMPTY_SHADOW_ARCHIVE,protocol,frozen,started);
assert.equal(first.items.length,1);
assert.equal(first.items[0].selected,'comparison','model chosen before future evidence');
assert.equal(first.items[0].source,'binance');
assert.equal(first.items[0].createdAt,started);
assert.equal(first.items[0].hypothesis.contrast.differencePctPoints,candidate.contrast.differencePctPoints);
assert.equal(V.createShadowVersion(first,protocol,frozen,started+M),first,'duplicate experiment idempotent');
assert.equal(V.shadowsForProtocol(first,protocol).length,1);
assert.equal(V.shadowsForProtocol(first,P.startStudyProtocol(T)).length,0);
const startOnly=V.compareShadowVersions(protocol,first,{version:1,tickets:discoveryHistory},started+2*M);
assert.equal(startOnly.experiments,1);
assert.equal(startOnly.items[0].status,'COLLECTING');
assert.equal(startOnly.items[0].baselineCount,0);
assert.equal(startOnly.items[0].shadowCount,0);
assert.equal(startOnly.items[0].coveragePct,null);
assert.equal(startOnly.items[0].exclusions.beforeFreeze,12);
const future=(id,highStops,midStops)=>{
 const entries=[];
 for(let i=0;i<12;i++){
  const at=started+M+Math.floor(i/3)*D+(i%3)*3*M;
  entries.push(mk(id+'-high-'+i,at,true,i<highStops));
  entries.push(mk(id+'-mid-'+i,at+M,false,i<midStops));
 }
 return entries;
};
const observed=future('normal',10,2),now=started+5*D;
const ledger={version:1,tickets:[...discoveryHistory,...observed]};
const ledgerBefore=JSON.stringify(ledger),archiveBefore=JSON.stringify(first);
const report=V.compareShadowVersions(protocol,first,ledger,now);
assert.equal(report.experiments,1);assert.equal(report.descriptive,1);
const s=report.items[0];
assert.equal(s.status,'DESCRIPTIVE');
assert.equal(s.baselineCount,24);assert.equal(s.baselineStops,12);
assert.equal(s.baselineStopPct,50);
assert.equal(s.shadowCount,12);assert.equal(s.shadowStops,2);
assert(Math.abs(s.shadowStopPct-100*2/12)<1e-7);
assert.equal(s.passedOverCount,12);
assert.equal(s.coveragePct,50);
assert.equal(s.daysSelected,4);assert.equal(s.daysPassedOver,4);
assert(s.observedDifferencePP<-30);
assert.equal(JSON.stringify(first),archiveBefore,'snapshot remains frozen');
assert.equal(JSON.stringify(ledger),ledgerBefore,'paper ledger remains untouched');
// The same frozen selected subset must NOT flip when future evidence reverses.
const inverted=V.compareShadowVersions(protocol,first,{version:1,tickets:[...discoveryHistory,...future('inverted',2,10)]},now);
assert.equal(inverted.items[0].shadowCount,12);
assert.equal(inverted.items[0].shadowStops,10);
assert(inverted.items[0].observedDifferencePP>30,'show harmful outcome, no adaptive hindsight');
assert.equal(first.items[0].selected,'comparison');
// Compare multiple interruptions and bad records: they cannot improve shadow statistics.
const oldButClosedLater={...mk('old-closed-later',started-M,true),closedAt:started+3*M};
const duplicate={...observed[0],id:observed[0].id+':duplicate',plan:{...observed[0].plan,id:observed[0].plan.id+':duplicate'}};
const otherVenue=mk('other-venue',started+4*D+M,true);otherVenue.plan.source='bybit';
const gap={...mk('gap',started+4*D+2*M,true),quality:'GAP'};
const uncertain=mk('uncertain',started+4*D+3*M,false);
uncertain.events=[...uncertain.events.slice(0,-1),{at:uncertain.closedAt,type:'MANUAL',detail:'not automatically closed'}];
const futureClosed={...mk('future-closed',started+4*D+4*M,true),closedAt:now+M};
const pending={...mk('pending',started+4*D+5*M,true),state:'OPEN'};
const absentFactor=mk('missing-feature',started+4*D+6*M,true);absentFactor.plan.study.volumeRatio20=null;
const badContext=mk('badContext',started+4*D+7*M,true);badContext.plan.study.capturedAt=started-1;
const mixed={version:1,tickets:[...ledger.tickets,oldButClosedLater,duplicate,otherVenue,gap,
 uncertain,futureClosed,pending,absentFactor,badContext]};
const mixedBefore=JSON.stringify(mixed);
const reviewed=V.compareShadowVersions(protocol,first,mixed,now).items[0];
assert.equal(reviewed.baselineCount,24);assert.equal(reviewed.shadowCount,12);
assert.equal(reviewed.exclusions.beforeFreeze,13);
assert.equal(reviewed.exclusions.duplicate,1);
assert.equal(reviewed.exclusions.differentVenue,1);
assert.equal(reviewed.exclusions.missingOrGap,2);
assert.equal(reviewed.exclusions.missingFactor,1);
assert.equal(reviewed.exclusions.notYetClosed,1);
assert.equal(reviewed.exclusions.uncertain,1);
assert.equal(reviewed.exclusions.pending,1);
assert.equal(JSON.stringify(mixed),mixedBefore);
const parsed=V.restoreShadowArchive(JSON.stringify(first),now);
assert.equal(parsed.items.length,1);
assert.equal(V.restoreShadowArchive(JSON.stringify(first),started-1).items.length,0,'cannot restore future shadow study');
const forged={...first.items[0],selected:'focus'};
assert.equal(V.restoreShadowArchive(JSON.stringify({version:1,items:[forged]}),now).items.length,0,'cannot silently change frozen rule');
assert.equal(V.restoreShadowArchive(JSON.stringify({version:1,items:[first.items[0],first.items[0]]}),now).items.length,0,'duplicate prevention');
assert.throws(()=>V.createShadowVersion(V.EMPTY_SHADOW_ARCHIVE,P.startStudyProtocol(T),frozen,started));
assert.equal(V.compareShadowVersions(null,first,ledger,now).experiments,0);
const sparse=V.compareShadowVersions(protocol,first,{version:1,tickets:[...discoveryHistory,...observed.slice(0,8)]},now);
assert.equal(sparse.items[0].status,'COLLECTING','tiny sample cannot be rated');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 7.2','APEX 7.2 · Лаборатория адаптации DEMO',
 'compareShadowVersions','createShadowVersion','restoreShadowArchive','apex_v72_shadow_archive',
 'Исходная модель','Экспериментальный фильтр','Создать учебную экспериментальную версию',
 'apex_v63_assistant_demo','apex_v64_futures_demo','apex_v66_forward_protocol',
 'apex_v70_hypothesis_archive','APEX 7.1 · Проверка гипотез на новых данных'])
 assert(app.includes(token),'missing APEX 7.2 integration '+token);
const tsx=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(tsx.parseDiagnostics.length,0,tsx.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const src=fs.readFileSync('src/radar/v72-shadow-lab.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiSecret|apiKey|sendOrder|executeTrade/.test(src));
console.log('APEX 7.2 PASS: frozen opt-in shadow variants, identical future cohorts, coverage, opposing evidence, exclusions, persistence, no trading');
