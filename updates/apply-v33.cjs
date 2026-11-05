/** APEX 3.3: quality diagnostics over live ticks and each independent candle timeframe. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
let app=read('src/App.tsx');
function rep(before,after,name){if(!app.includes(before))throw Error('APEX 3.3 patch missing '+name);app=app.replace(before,after);}
const imp="import {exportResearch,importResearch,mergeResearch,auditLearning} from './radar/vault';";
rep(imp,imp+"\nimport {inspectDataHealth,ageLabel,type DataHealth} from './radar/data-quality';",'import');
const mark=" const candidates=useMemo(()=>favorites.map(s=>assets[s]).filter((a):a is AssetState=>Boolean(a)),[favorites,assets]);";
rep(mark,mark+"\n const qualityReports=useMemo<Record<string,DataHealth>>(()=>Object.fromEntries(candidates.map(a=>[a.symbol,inspectDataHealth(a,now)])),[candidates,now]);",'quality state');
const detail='<p className="text-[11px] text-teal-400 mt-2 text-right">Подробнее об активе ›</p>';
const cardNote="{qualityReports[a.symbol]&&<p className={'text-[10px] mt-2 '+(qualityReports[a.symbol].level==='ok'?'text-teal-300':qualityReports[a.symbol].level==='warning'?'text-amber-300':qualityReports[a.symbol].level==='loading'?'text-slate-400':'text-rose-300')}>Данные: {qualityReports[a.symbol].label}</p>}";
rep(detail,cardNote+'\n    '+detail,'radar card quality');
const setting='<div className="bg-[#111b2a] border border-white/5 rounded-2xl divide-y divide-slate-800">';
rep(setting,read('updates/v33-quality-ui.txt')+'\n  '+setting,'quality settings dashboard');
rep('РЫНОЧНЫЙ РАДАР • 3.2','РЫНОЧНЫЙ РАДАР • 3.3','version header');
write('src/App.tsx',app);
fs.copyFileSync('updates/data-quality.ts','src/radar/data-quality.ts');
fs.copyFileSync('updates/test-data-quality.cjs','scripts/test-data-quality.cjs');
const p=JSON.parse(read('package.json'));p.scripts.test+=' && node scripts/test-data-quality.cjs';
write('package.json',JSON.stringify(p,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.3 Data Quality Guardian\n- Observes recently loaded M5/H1/H4 candles, missing history, gaps and duplicates, delayed live ticks, malformed OHLC and clock mismatch.\n- Quality indicators are diagnostic only; they are not predictive confidence or a measured trading edge.\n- Existing scenarios, notifications, Learning Engine and exchange connectors remain unchanged.\n');
console.log('APEX 3.3 Data Quality monitoring patch applied');
