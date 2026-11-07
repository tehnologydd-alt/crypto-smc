const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Number,JSON,Map,Set,Array,
  URL,AbortController,setTimeout,clearTimeout});
 return m.exports;
}
async function run(){
 const A=load('src/radar/v87-testnet-lab.ts');
 const NOW=Date.UTC(2026,10,7,14);
 assert.equal(A.FIXED_TESTNET_PUBLIC_CLOCK_ENDPOINTS.binance,
  'https://demo-fapi.binance.com/fapi/v1/time');
 assert.equal(A.FIXED_TESTNET_PUBLIC_CLOCK_ENDPOINTS.bybit,
  'https://api-testnet.bybit.com/v5/market/time');
 assert.equal(A.parseSandboxClockResponse('binance',{serverTime:NOW},NOW),NOW);
 assert.equal(A.parseSandboxClockResponse('bybit',
  {retCode:0,time:NOW,result:{timeSecond:String(Math.floor(NOW/1000))}},NOW),NOW);
 assert.equal(A.parseSandboxClockResponse('bybit',
  {retCode:0,result:{timeSecond:String(Math.floor(NOW/1000))}},NOW),NOW);
 for(const [venue,raw] of [
  ['binance',{serverTime:'not-a-number'}],
  ['binance',{serverTime:NOW+31*86400000}],
  ['bybit',{retCode:1001,result:{timeSecond:String(Math.floor(NOW/1000))}}],
  ['bybit',{retCode:0,result:{timeSecond:'whatever'}}]
 ])assert.throws(()=>A.parseSandboxClockResponse(venue,raw,NOW));
 let seen=[];
 const fake=async(url,init)=>{
  seen.push({url,init});
  return {ok:true,status:200,text:async()=>JSON.stringify(
   url.includes('binance')?{serverTime:NOW}:{retCode:0,time:NOW})};
 };
 const b=await A.checkSandboxPublicClock('binance',fake,()=>NOW);
 const y=await A.checkSandboxPublicClock('bybit',fake,()=>NOW);
 assert.equal(b.status,'OK');assert.equal(y.status,'OK');
 assert.equal(b.kind,'TESTNET_PUBLIC_CLOCK');
 assert.equal(b.latencyMs,0);
 assert.equal(b.clockSkewMs,0);
 assert.equal(b.exchangeClockMs,NOW);
 assert.equal(y.exchangeClockMs,NOW);
 assert.equal(seen.length,2);
 for(const req of seen){
  assert(req.url.startsWith('https://'));
  assert(req.url.includes('testnet')||req.url.includes('demo-fapi'));
  assert.equal(req.init.method,'GET');
  assert.equal(req.init.credentials,'omit');
  assert.equal(req.init.redirect,'error');
  assert(!req.init.body);
  assert(!req.init.headers.Authorization);
 }
 const failed=await A.checkSandboxPublicClock('binance',async()=>{throw Error('network unavailable')},()=>NOW);
 assert.equal(failed.status,'ERROR');assert.equal(failed.exchangeClockMs,null);
 assert(!failed.note.includes('network unavailable'),'no raw network exception details leaked');
 const rejected=await A.checkSandboxPublicClock('bybit',
  async()=>({ok:false,status:403,text:async()=>''}),()=>NOW);
 assert.equal(rejected.status,'ERROR');
 const corrupted=await A.checkSandboxPublicClock('bybit',
  async()=>({ok:true,status:200,text:async()=>'<html>bad</html>'}),()=>NOW);
 assert.equal(corrupted.status,'ERROR');
 const complete=A.makeLocalSandboxOrderSequence('binance',NOW,'complete');
 const cancelled=A.makeLocalSandboxOrderSequence('bybit',NOW,'cancel');
 assert.equal(complete.length,3);
 assert.equal(complete[0].stage,'NEW');
 assert.equal(complete[1].stage,'PARTIALLY_FILLED');
 assert.equal(complete[2].stage,'FILLED');
 assert.equal(complete[2].filledPct,100);
 assert.equal(cancelled[2].stage,'CANCELLED');
 assert.equal(cancelled[2].filledPct,30);
 assert(complete.every(e=>e.origin==='LOCAL_FIXTURE'));
 assert.equal(A.checkLocalSandboxLifecycle(complete).valid,true);
 assert.equal(A.checkLocalSandboxLifecycle(cancelled).valid,true);
 assert.equal(A.checkLocalSandboxLifecycle([]).valid,false);
 for(const events of [
  complete.slice(1),
  [complete[0],{...complete[1],filledPct:-1}],
  [complete[0],{...complete[1],filledPct:101}],
  [complete[0],{...complete[1],origin:'REAL_EXCHANGE'}],
  [complete[0],{...complete[1],venue:'bybit'}],
  [complete[0],{...complete[1],at:NOW-10}],
  [complete[0],complete[2],complete[1]],
  [complete[0],{...complete[2],filledPct:50}]
 ])assert.equal(A.checkLocalSandboxLifecycle(events).valid,false);
 const code=fs.readFileSync('src/radar/v87-testnet-lab.ts','utf8');
 const ui=fs.readFileSync('updates/v87-testnet-ui.txt','utf8');
 const overlay=fs.readFileSync('updates/apply-v87.cjs','utf8');
 assert(!/(apiSecret|apiKey|Authorization:|listenKey|createOrder|\/fapi\/v1\/order|\/v5\/order\/create|leverageOrder|privateKey|POST|DELETE|PUT)/.test(code),
  'read-only public lab cannot create authenticated trade operations');
 assert(!/(setFuturesLedger\(|setDemoWalletBook\(|transferDemoCash\(|localStorage|setFuturesBars\()/.
  test(ui+overlay),'testnet fixture must not edit paper positions or stored capital');
 const app=fs.readFileSync('src/App.tsx','utf8');
 for(const text of [
  'РЫНОЧНЫЙ РАДАР • 8.7','APEX 8.7 · Биржевой Testnet · проверка протокола',
  'checkSandboxPublicClock','sandboxTestnetProbes','setSandboxTestnetProbes',
  'sandboxLocalEvents','checkLocalSandboxLifecycle','makeLocalSandboxOrderSequence',
  'Проверить тестовые серверы','ЛОКАЛЬНАЯ ИМИТАЦИЯ','Тестовый сервер отвечает',
  'APEX 8.6 · Снимки счетов · только просмотр',
  'APEX 8.5 · Биржевые API · публичные потоки',
  'Позиции Futures · DEMO','checkDemoMargin','apex_v76_rolling_checkpoints'
 ])assert(app.includes(text),'APEX 8.7 missing '+text);
 const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.equal(ast.parseDiagnostics.length,0,ast.parseDiagnostics.map(x=>
  ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
 console.log('APEX 8.7 PASS: fixed public Testnet GET hosts, no credentials/private orders, local mock lifecycle, DEMO state unchanged');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
