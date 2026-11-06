const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const code=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,JSON,Array,Map,Set});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),
 V=load('src/radar/v66-forward-study.ts'),
 A=load('src/radar/v69-outcome-audit.ts');
const T=Date.UTC(2026,10,6,20),H=300000,DAY=86400000;
const protocol=V.startStudyProtocol(T-1000);
const bars=Array.from({length:36},(_,i)=>({time:T-36*H+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true}));
const pB=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',bars,T),
 pY=F.deriveFuturesStudyPlan('bybit','BTCUSDT','5m',bars,T);
assert(pB?.study&&pY?.study);
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const baseB=F.createFutureTicket(pB,setup,'manual',T),
 baseY=F.createFutureTicket(pY,{...setup,exchange:'bybit'},'manual',T);
function outcome(base,id,result,options={}){
 const createdAt=options.at||T,volumeRatio20=options.volume??1,
       move8=(options.impact||1.7)*base.plan.study.range20;
 const study={...base.plan.study,capturedAt:createdAt,volumeRatio20,move8};
 const plan={...base.plan,id:base.plan.id+':'+id,createdAt,
  observedBarAt:createdAt-H,study};
 const event=options.kind||'STOP';
 return {...base,id:plan.id,plan,createdAt,
  state:'CLOSED',remainingPct:0,grossUSDT:result,quality:options.gap?'GAP':'OK',
  setup:{...base.setup,notionalUSDT:options.nominal||100},
  tpReached:options.tp1?1:0,
  events:[...base.events,{at:createdAt+H,type:event,detail:'observed'}]};
}
const early1=outcome(baseB,'early-low',2,{volume:0.5,impact:1,kind:'COMPLETED',tp1:true}),
 early2=outcome(baseB,'early-high',-3,{volume:2,impact:3,kind:'STOP'}),
 laterAt=T+7*DAY,
 later1=outcome(baseB,'later-low',4,{at:laterAt,volume:0.5,impact:1,kind:'COMPLETED',nominal:200,tp1:true}),
 later2=outcome(baseY,'later-high',-5,{at:laterAt+H,volume:2,impact:3,kind:'STOP'}),
 unknown=outcome(baseY,'unknown',0,{volume:0,impact:1,kind:'COMPLETED'});
 unknown.plan.study.volumeRatio20=null;
const invalid=outcome(baseB,'gap',999,{volume:2,gap:true}),
 manual=outcome(baseY,'manual',999,{volume:2,kind:'MANUAL'}),
 old=outcome(baseB,'old',999,{at:T-2000,volume:2});
const staleContext=outcome(baseB,'stale-context',999,{volume:2});
staleContext.plan.study.capturedAt=T+1000;
const ledger={version:1,tickets:[early1,early2,later1,later2,unknown,invalid,manual,old,staleContext]};
const before=JSON.stringify(ledger);
const now=laterAt+2*H;
const volume=A.auditStudyOutcomes(protocol,ledger,'volume',now);
assert.equal(JSON.stringify(ledger),before,'analysis must never mutate saved demo tickets');
assert.equal(volume.total,5);
assert.equal(volume.early,3);assert.equal(volume.later,2);
assert.equal(volume.binance.observations,3);assert.equal(volume.bybit.observations,2);
assert.equal(volume.binance.rows.find(r=>r.key==='low').all.n,2);
assert.equal(volume.binance.rows.find(r=>r.key==='low').early.n,1);
assert.equal(volume.binance.rows.find(r=>r.key==='low').later.n,1);
assert.equal(volume.binance.rows.find(r=>r.key==='high').all.negative,1);
assert.equal(volume.bybit.rows.find(r=>r.key==='unknown').all.n,1);
assert.equal(volume.bybit.rows.find(r=>r.key==='high').later.n,1);
assert.equal(volume.cutoverAt,laterAt-1000+7*DAY);
assert.equal(volume.binance.rows.find(r=>r.key==='low').all.avgGrossPct,2,'gross % is averaged by original notional (2/100,4/200)');
assert.equal(volume.binance.rows.find(r=>r.key==='low').all.tp1,2);
assert.equal(volume.binance.rows.find(r=>r.key==='high').all.status,'SMALL');
const speed=A.auditStudyOutcomes(protocol,ledger,'impulse',now);
assert.equal(speed.binance.rows.find(r=>r.key==='moderate').all.n,2);
assert.equal(speed.binance.rows.find(r=>r.key==='strong').all.n,1);
assert.equal(speed.bybit.rows.find(r=>r.key==='strong').later.n,1);
const dir=A.auditStudyOutcomes(protocol,ledger,'direction',now);
assert.equal(dir.binance.rows.find(r=>r.key==='long').all.n,3);
const frames=A.auditStudyOutcomes(protocol,ledger,'frame',now);
assert.equal(frames.binance.rows.find(r=>r.key==='5m').all.n,3);
assert.equal(frames.bybit.rows.find(r=>r.key==='1h').all.n,0);
assert.equal(A.auditStudyOutcomes(null,ledger,'volume',now).total,0,'no protocol -> no report');
const formal=V.summarizeStudyProtocol(protocol,ledger,now);
assert.equal(formal.reviewable,volume.total,'match reviewable forward-only study cohort');
assert.equal(volume.binance.rows.reduce((sum,r)=>sum+r.all.n,0),formal.binance.complete);
assert.equal(volume.bybit.rows.reduce((sum,r)=>sum+r.all.n,0),formal.bybit.complete);
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['РЫНОЧНЫЙ РАДАР • 6.9','Разбор ошибок и условий','auditStudyOutcomes','auditFactor','auditPeriod',
 'Первые 7 дней','С 8-го дня','apex_v63_assistant_demo','apex_v64_futures_demo','apex_v66_forward_protocol',
 'Контрольные точки','Как условные комиссии меняют результат'])
 assert(app.includes(token),'missing APEX 6.9 integration '+token);
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
const source=fs.readFileSync('src/radar/v69-outcome-audit.ts','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|placeOrder|apiSecret|apiKey/.test(source));
console.log('APEX 6.9 PASS: frozen factors, independent venues, seven-day split, no backfill, gross normalization, exclusion of uncertain/manual, no order writes');
