/** APEX 6.5: Spot is a first-class DEMO market, evidence stays separate and prospective. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 6.5 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v65-evidence.ts','src/radar/v65-evidence.ts');
fs.copyFileSync('updates/test-v65-evidence.cjs','scripts/test-v65-evidence.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "from './radar/v64-futures-assistant';",
 "from './radar/v64-futures-assistant';\nimport {summarizeDemoEvidence} from './radar/v65-evidence';",
 'evidence import');
app=rep(app,
 " const [showLegacySpotArchive,setShowLegacySpotArchive]=useState(false);",
 " const [showLegacySpotArchive,setShowLegacySpotArchive]=useState(()=>localStorage.getItem('apex_v65_assistant_market')==='spot');",
 'remember market selection');
app=rep(app,
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);",
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);\n const assistantEvidence=useMemo(()=>summarizeDemoEvidence(assistantLedger,futuresLedger),[assistantLedger,futuresLedger]);\n useEffect(()=>{try{localStorage.setItem('apex_v65_assistant_market',showLegacySpotArchive?'spot':'futures');}catch{}},[showLegacySpotArchive]);",
 'separated forward evidence');
app=rep(app,
 "const keys=[...(view==='assistant'?[futuresSelectedKey]:[]),",
 "const keys=[...(view==='assistant'&&!showLegacySpotArchive?[futuresSelectedKey]:[]),",
 'poll chosen market only');
app=rep(app,
 "},[futuresSelectedKey,futuresLedger,view]);",
 "},[futuresSelectedKey,futuresLedger,view,showLegacySpotArchive]);",
 'poll market dependencies');
app=rep(app,
 "{view==='assistant'&&<div className=\"space-y-4\">",
 read('updates/v65-market-ui.txt')+"\n {view==='assistant'&&!showLegacySpotArchive&&<div className=\"space-y-4\">",
 'Futures Spot top selector');
const oldToggle=' <button type="button" onClick={()=>setShowLegacySpotArchive(v=>!v)} className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-[#101c2d] text-xs font-semibold text-slate-200">{showLegacySpotArchive?\'Скрыть архив Spot 6.3\':\'Показать сохранённый архив Spot 6.3\'}</button>';
app=rep(app,oldToggle,'','remove duplicate bottom archive control');
write('src/App.tsx',app);
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v65-evidence.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.5 — two peer demo markets and prospective decision memory\n- Market switch Futures/Spot is visible on Assistant tab, preference persists locally. The archived Spot simulator remains independent and its old ledger is not migrated into Futures or modified; no mixed PnL.\n- New Futures proposals freeze decision-time model/version, last closed candle, volume ratio, range, 8-candle movement and continuity. Historical records receive no invented context.\n- Observational evidence panel reports actual saved prospective demo plans and reviewable outcomes separately. Gross futures results are illustrative and exclude fees/funding/slippage. There is no automatic learning, proof of profitability, real order execution, leverage-setting APIs or private account access.\n');
console.log('APEX 6.5 dual-market, evidence-only learning foundation installed');
