/** APEX 3.5 Market Pulse: quiet watchlist breadth, no signal or order changes. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
let app=read('src/App.tsx');
function rep(a,b,label){if(!app.includes(a))throw Error('APEX 3.5 missing '+label);app=app.replace(a,b);}
const imports="import {analyzePostmortem} from './radar/postmortem';";
rep(imports,imports+"\nimport {summarizePulse} from './radar/market-pulse';",'pulse import');
const state=" const [postmortemOpen,setPostmortemOpen]=useState(()=>localStorage.getItem('apex_v34_postmortem_open')==='true');";
rep(state,state+"\n const [pulseExpanded,setPulseExpanded]=useState(()=>localStorage.getItem('apex_v35_pulse_expanded')==='true');",'pulse state');
const scores=" const qualityReports=useMemo<Record<string,DataHealth>>(()=>Object.fromEntries(candidates.map(a=>[a.symbol,inspectDataHealth(a,now)])),[candidates,now]);";
rep(scores,scores+"\n const marketPulse=useMemo(()=>summarizePulse(candidates,qualityReports,now),[candidates,qualityReports,now]);",'pulse aggregation');
const persist=" useEffect(()=>{try{localStorage.setItem('apex_v34_postmortem_open',String(postmortemOpen));}catch{}},[postmortemOpen]);";
rep(persist,persist+"\n useEffect(()=>{try{localStorage.setItem('apex_v35_pulse_expanded',String(pulseExpanded));}catch{}},[pulseExpanded]);",'pulse preference');
const target='   <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-lg">Мои активы</h2>';
rep(target,read('updates/v35-pulse-ui.txt')+'\n'+target,'radar pulse panel');
rep('РЫНОЧНЫЙ РАДАР • 3.4','РЫНОЧНЫЙ РАДАР • 3.5','app version');
write('src/App.tsx',app);
fs.copyFileSync('updates/market-pulse.ts','src/radar/market-pulse.ts');
fs.copyFileSync('updates/test-market-pulse.cjs','scripts/test-market-pulse.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-market-pulse.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.5 Market Pulse\n- Watchlist-only market breadth summary (not all of crypto market); one count per favorite.\n- Confirms directional agreement across 2+ fresh M5/H1/H4 confirmed signals, rejects conflicting/stale/missing data.\n- Does not add trading orders or modify scenario lifecycle, notifications, Guardian, Research or Vault.\n');
console.log('APEX 3.5 Market Pulse watchlist panel installed');
