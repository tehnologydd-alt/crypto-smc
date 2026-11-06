const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const s=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Map,Set,Date,Math,Number,Array,JSON});
 return m.exports;
}
const A=load('src/radar/v65-evidence.ts'),F=load('src/radar/v64-futures-assistant.ts');
const empty=A.summarizeDemoEvidence({version:1,orders:[]},{version:1,tickets:[]});
assert.equal(empty.spot.total,0);assert.equal(empty.futures.total,0);
assert.equal(empty.status,'INSUFFICIENT');assert.equal(empty.futures.grossTotalUSDT,0);
const now=Date.UTC(2026,10,6,15),H=300000;
const bars=Array.from({length:36},(_,i)=>({time:now-36*H+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:i===35?50:10,closed:true}));
const plan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',bars,now);
assert(plan);assert(plan.study);
assert.equal(plan.study.modelVersion,'futures-study-v1');
assert.equal(plan.study.lastClosedAt,now);
assert.equal(plan.study.sampleBars,36);
assert.equal(plan.study.continuous,true);
assert(plan.study.volumeRatio20>1,'volume ratio captured before future results');
const setup={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
const ticket=F.createFutureTicket(plan,setup,'manual',now);
assert(ticket.plan.study,'frozen prospective context attached to virtual order');
const closed={...ticket,state:'CLOSED',quality:'OK',remainingPct:0,grossUSDT:3,events:[...ticket.events,{at:now+H,type:'COMPLETED',detail:'three targets'}]};
const stopped={...closed,id:'futures:binance:ETHUSDT:5m:other',plan:{...plan,id:'futures:binance:ETHUSDT:5m:other',symbol:'ETHUSDT'},grossUSDT:-2,
 events:[...ticket.events,{at:now+H,type:'STOP',detail:'stop'}]};
const uncertain={...closed,id:'futures:bybit:BTCUSDT:5m:gap',plan:{...plan,id:'futures:bybit:BTCUSDT:5m:gap',source:'bybit'},grossUSDT:99,quality:'GAP'};
const spot={version:1,orders:[
 {exchange:'bybit',state:'CLOSED',tpReached:1,events:[{type:'STOP'}]},
 {exchange:'binance',state:'WAITING',tpReached:0,events:[{type:'PLANNED'}]}
]};
const result=A.summarizeDemoEvidence(spot,{version:1,tickets:[closed,stopped,uncertain]});
assert.equal(result.spot.total,2);assert.equal(result.spot.reviewable,1);
assert.equal(result.spot.byVenue.binance,1);assert.equal(result.spot.byVenue.bybit,1);
assert.equal(result.futures.total,3);assert.equal(result.futures.reviewable,2);
assert.equal(result.futures.positive,1);assert.equal(result.futures.negative,1);
assert.equal(result.futures.grossTotalUSDT,1,'exclude gap and do not mix Spot statistics');
assert.equal(result.futures.gap,1);assert.equal(result.futures.unresolved,1);
assert.equal(result.futures.byVenue.bybit,1);
assert.equal(result.futures.withContext,3);
assert.equal(result.status,'INSUFFICIENT','not enough to claim learning or profit');
assert.equal(A.summarizeDemoEvidence(spot,{version:1,tickets:[{...closed,plan:{...plan,study:undefined}}]}).futures.withContext,0,
 'do not fabricate decision context for old records');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const token of ['Рынок ассистента','Дневник проверки решений','apex_v65_assistant_market','summarizeDemoEvidence',
 'setShowLegacySpotArchive(true)','setShowLegacySpotArchive(false)','assistantEvidence.spot','assistantEvidence.futures'])
 assert(app.includes(token),'missing dual-market evidence UI '+token);
assert(app.includes('apex_v63_assistant_demo')&&app.includes('apex_v64_futures_demo'),'both local archives preserved');
assert(!app.includes('Показать сохранённый архив Spot 6.3'),'archive is a peer tab, not a nested button');
assert.equal((app.match(/view==='assistant'&&!showLegacySpotArchive&&<div/g)||[]).length,1);
assert.equal((app.match(/showLegacySpotArchive&&view==='assistant'&&<div/g)||[]).length,1);
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
console.log('APEX 6.5 evidence PASS: separate full Spot/Futures, stored decision-time snapshot, no fabricated context or joined returns');
