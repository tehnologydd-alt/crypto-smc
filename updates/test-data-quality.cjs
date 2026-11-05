const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('src/radar/data-quality.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require,Date,Math,Array,Number,Set,Map});
const {inspectFrame,inspectDataHealth,ageLabel}=m.exports;
const f={ '5m':300000,'1h':3600000,'4h':14400000 };
const NOW=10_000_000_000;
function make(frame,now=NOW){
 const d=f[frame],bars=[];
 for(let i=80;i>=1;i--){const open=now-i*d;bars.push({time:open,open:100,high:101,low:99,close:100,volume:500,closed:true});}
 return bars;
}
function inspect(s){
 const market={symbol:'BTCUSDT',price:100,lastTick:NOW-5000,candles:make('5m'),frames:{'1h':make('1h'),'4h':make('4h')},...s};
 return inspectDataHealth(market,NOW);
}
assert.equal(inspect().level,'ok');
assert.equal(inspect({lastTick:NOW-180000}).level,'bad');
assert.equal(inspect({lastTick:NOW+60000}).level,'bad');
assert.equal(inspect({lastTick:0}).level,'bad');
assert.equal(inspect({candles:[]}).level,'warning');
assert.equal(inspect({candles:[],frames:{}}).level,'warning');
assert.equal(inspect({candles:[],frames:{},lastTick:0}).level,'loading');
const missing=inspectFrame('5m',make('5m').slice(-12),NOW);assert.equal(missing.status,'missing');
const invalid=make('5m');invalid[invalid.length-1]={...invalid[invalid.length-1],high:50};
assert.equal(inspectFrame('5m',invalid,NOW).status,'invalid');
const stale=make('5m').map(x=>({...x,time:x.time-1200000}));
assert.equal(inspectFrame('5m',stale,NOW).status,'stale');
const gap=make('5m');gap.splice(55,3);assert.equal(inspectFrame('5m',gap,NOW).status,'gaps');
const duplicate=make('5m');duplicate.push({...duplicate[duplicate.length-1]});assert.equal(inspectFrame('5m',duplicate,NOW).duplicateCount,1);
const formed=[...make('1h'),{...make('1h')[79],time:NOW,closed:false}];
assert.equal(inspectFrame('1h',formed,NOW).status,'ok','forming candle is not a closed bar');
const future=make('5m');future.push({...future[79],time:NOW+240000});
assert.equal(inspectFrame('5m',future,NOW).status,'invalid');
assert.equal(ageLabel(null),'неизвестно');
console.log('APEX 3.3 quality tests PASS: fresh/stale, gaps, duplicates, invalid, missing, clock skew');
