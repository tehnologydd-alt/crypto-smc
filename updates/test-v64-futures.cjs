const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const src=fs.readFileSync(path,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Map,Set,Date,Math,Number,Array,JSON});
 return m.exports;
}
const F=load('src/radar/v64-futures-assistant.ts'),M=load('src/radar/v64-futures-market.ts');
const H=300000,T=Date.UTC(2026,10,6,12);
const setting={exchange:'binance',leverage:2,marginMode:'ISOLATED',positionMode:'ONE_WAY',notionalUSDT:100,portions:[50,30,20],breakeven:true};
assert(F.validFutureSetup(setting));assert(!F.validFutureSetup({...setting,leverage:1000}));
const candles=Array.from({length:36},(_,i)=>({
 time:T+i*H,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,closed:true
}));
const now=T+36*H;
const plan=F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',candles,now);
assert(plan,'prospective futures observation');assert.equal(plan.source,'binance');assert.equal(plan.model,'futures-study-v1');
assert.equal(F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',candles.slice(0,35),now),null,'history gate');
assert.equal(F.deriveFuturesStudyPlan('binance','BTCUSDT','5m',[...candles.slice(0,30),...candles.slice(31)],now),null,'gap gate');
let ledger=F.enrollFutureTicket(F.EMPTY_FUTURES_LEDGER,plan,setting,'manual',now);
assert.equal(ledger.tickets.length,1);assert.equal(ledger.tickets[0].state,'WAITING');
assert.equal(ledger.tickets[0].setup.leverage,2);
assert.equal(F.enrollFutureTicket(ledger,plan,setting,'manual',now),ledger);
const bar=(i,lo,hi,cl)=>({time:T+i*H,low:lo,high:hi,open:cl,close:cl,volume:12,closed:true});
const entry=bar(36,plan.entry-.1,plan.entry+.1,plan.entry);
const opened=F.advanceFuturesTicket(ledger.tickets[0],[entry],now+H);
assert.equal(opened.state,'OPEN');
assert.equal(opened.tpReached,0);
const tp=F.advanceFuturesTicket(opened,[bar(37,plan.entry+.1,plan.targets[0]+.1,plan.targets[0])],now+2*H);
assert.equal(tp.tpReached,1);assert.equal(tp.remainingPct,50);
assert.equal(tp.protectiveStop,plan.entry,'BE from next candle');
assert(tp.grossUSDT>0);
const ambiguous=F.advanceFuturesTicket(tp,[bar(38,plan.entry-.1,plan.targets[1]+.1,plan.targets[1])],now+3*H);
assert.equal(ambiguous.state,'CLOSED');
assert.equal(ambiguous.tpReached,1,'stop wins ambiguous future candle');
const gap=F.advanceFuturesTicket(opened,[bar(38,plan.entry,plan.entry+1,plan.entry)],now+3*H);
assert.equal(gap.state,'OPEN');assert.equal(gap.quality,'GAP');assert.equal(gap.lastBarAt,opened.lastBarAt);
assert.equal(F.restoreFuturesLedger(JSON.stringify(ledger),now).tickets.length,1,'persistence');
const onewayOpposite={...plan,id:plan.id+':opposite',direction:'SHORT',entry:plan.entry,stop:plan.entry+2,targets:[plan.entry-1,plan.entry-2,plan.entry-3]};
assert.equal(F.enrollFutureTicket(ledger,onewayOpposite,setting,'auto',now).tickets.length,1,'one way opposing contract blocked');
const pair=[[''+(T+H),'101','102','99','100','5'],[''+T,'100','102','98','101','3']];
const binance=M.decodeFutureKlines(pair,'binance','5m',T+2*H);
assert.equal(binance.length,2);
assert(binance[0].time<binance[1].time);
const bybit=M.decodeFutureKlines({retCode:0,result:{category:'linear',list:pair}},'bybit','5m',T+2*H);
assert.equal(bybit.length,2);
assert.equal(M.decodeFutureKlines({retCode:0,result:{category:'linear',list:pair}},'bybit','5m',T+H).length,1);
assert.throws(()=>M.decodeFutureKlines({retCode:0,result:{category:'spot',list:pair}},'bybit','5m',T+2*H),'never ingest Bybit Spot for futures');
const marketSource=fs.readFileSync('src/radar/v64-futures-market.ts','utf8');
assert(marketSource.includes('fapi.binance.com/fapi/v1/klines'));
assert(marketSource.includes("category:'linear'"));
const executableMarket=marketSource.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert(!/\/order\/|placeOrder|apiSecret|apiKey|\/wallet|\/position\/set-leverage/i.test(executableMarket),'public-market-only');
const app=fs.readFileSync('src/App.tsx','utf8');
for(const k of ['APEX Futures','Binance USD-M','Bybit Linear','apex_v64_futures_demo','showLegacySpotArchive','futuresMode',
 'fetchFuturesClosedBars','stepFuturesLedger','futuresLeverage','futuresMarginMode','futuresPositionMode','Futures DEMO'])
 assert(app.includes(k),'missing Futures UI: '+k);
assert(app.includes('apex_v63_assistant_demo'),'old Spot history preserved');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
console.log('APEX 6.4 Futures DEMO PASS: dual USDT perpetual sources, continuous futures-only candles, isolated archive, virtual settings, forward-only TP/BE/stop journal, no exchange account writes');
