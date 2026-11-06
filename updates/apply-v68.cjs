/** APEX 6.8: observational data quality and transparent, hypothetical paper-cost sensitivity. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 6.8 '+name+' matches='+n);return s.replace(a,b);}
for(const file of ['v68-market-health.ts','v68-cost-sensitivity.ts'])fs.copyFileSync('updates/'+file,'src/radar/'+file);
fs.copyFileSync('updates/test-v68-quality.cjs','scripts/test-v68-quality.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {restoreStudyCheckpoints,saveStudyCheckpoint,checkpointsForProtocol,type CheckpointArchive} from './radar/v67-checkpoints';",
 "import {restoreStudyCheckpoints,saveStudyCheckpoint,checkpointsForProtocol,type CheckpointArchive} from './radar/v67-checkpoints';\nimport {assessFuturesMarketHealth} from './radar/v68-market-health';\nimport {studyCostSensitivity} from './radar/v68-cost-sensitivity';",
 'imports');
app=rep(app,
 " const futuresSelectedKey=futuresExchange+':'+futuresSymbol+':'+futuresFrame;",
 " const futuresSelectedKey=futuresExchange+':'+futuresSymbol+':'+futuresFrame;\n const futuresMarketHealth=useMemo(()=>assessFuturesMarketHealth(futuresBars[futuresSelectedKey]||[],futuresFrame,now),[futuresBars,futuresSelectedKey,futuresFrame,now]);",
 'market-health calculation');
app=rep(app,
 " const studySnapshots=useMemo(()=>checkpointsForProtocol(studyCheckpointArchive,studyProtocol),[studyCheckpointArchive,studyProtocol]);",
 " const studySnapshots=useMemo(()=>checkpointsForProtocol(studyCheckpointArchive,studyProtocol),[studyCheckpointArchive,studyProtocol]);\n const studySensitivity=useMemo(()=>studyCostSensitivity(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);",
 'cost sensitivity observation');
const scenarioAnchor=' <section className="rounded-2xl border border-white/10 bg-[#141e30] p-3.5 space-y-2">\n  <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Учебный фьючерсный сценарий</h2>';
app=rep(app,scenarioAnchor,read('updates/v68-market-health-ui.txt')+'\n'+scenarioAnchor,'source health ui');
const index=app.indexOf('Futures DEMO · журнал');
const start=index>=0?app.lastIndexOf('<section className="space-y-2">',index):-1;
if(start<0||index-start>350)throw Error('APEX 6.8 cannot locate Futures journal position');
app=app.slice(0,start)+read('updates/v68-fee-ui.txt')+'\n '+app.slice(start);
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.7','РЫНОЧНЫЙ РАДАР • 6.8','version');
write('src/App.tsx',app);
for(const file of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+file;
 let s=read(path);
 s=s.replaceAll('РЫНОЧНЫЙ РАДАР • 6.7','РЫНОЧНЫЙ РАДАР • 6.8');
 write(path,s);
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v68-quality.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.8 — market observation health and hypothetical fee sensitivity\n- Data health reports read-only closed-futures-candle freshness, invalid observations, gaps and a continuous 36-bar research window for the selected source/frame. It never invents missing candles or authorizes trading.\n- A separate prospective-only sensitivity report compares 0, 5 and 10 hypothetical basis points per side on independently reviewed Futures DEMO closes by exchange. These are NOT verified Binance/Bybit tariffs, and funding, slippage, mark-price liquidation and other real execution variables are excluded.\n- Past tickets, Spot/Futures journals, immutable protocol and saved checkpoints remain unchanged. The displayed values are illustrative, not real net performance or trading advice. No exchange account connectivity or order endpoints were added.\n');
console.log('APEX 6.8 public futures data quality and illustrative paper-cost sensitivity installed');
