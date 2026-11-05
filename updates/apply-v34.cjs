/** APEX 3.4: compact collapsible feed health and descriptive forecast postmortem. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
let app=read('src/App.tsx');
function replaceOnce(before,after,label){if(!app.includes(before))throw Error('APEX 3.4 patch missing '+label);app=app.replace(before,after);}
const importLine="import {inspectDataHealth,ageLabel,type DataHealth} from './radar/data-quality';";
replaceOnce(importLine,importLine+"\nimport {analyzePostmortem} from './radar/postmortem';",'postmortem import');
const state=" const [vaultBusy,setVaultBusy]=useState(false);";
replaceOnce(state,state+"\n const [qualityExpanded,setQualityExpanded]=useState(()=>localStorage.getItem('apex_v34_quality_expanded')==='true');\n const [postmortemOpen,setPostmortemOpen]=useState(()=>localStorage.getItem('apex_v34_postmortem_open')==='true');",'collapse states');
const memo=" const learningReport=useMemo(()=>learningOverview(learning),[learning]);";
replaceOnce(memo,memo+"\n const postmortemReport=useMemo(()=>analyzePostmortem(learning),[learning]);\n useEffect(()=>{try{localStorage.setItem('apex_v34_quality_expanded',String(qualityExpanded));}catch{}},[qualityExpanded]);\n useEffect(()=>{try{localStorage.setItem('apex_v34_postmortem_open',String(postmortemOpen));}catch{}},[postmortemOpen]);",'postmortem and persistence');
const original=read('updates/v33-quality-ui.txt');
if(!app.includes(original))throw Error('APEX 3.4 original quality block not found');
const begin=original.indexOf('     <p className="text-xs text-slate-400">Свежесть');
const end=original.lastIndexOf('   </section>');
if(begin<0||end<begin)throw Error('APEX 3.4 cannot find data-quality content');
const details=original.slice(begin,end).trimEnd();
const compact=[
'   <section className="rounded-2xl border border-cyan-500/20 bg-[#111b2a] p-4">',
'     <button type="button" aria-expanded={qualityExpanded} aria-label="Развернуть или свернуть контроль качества данных" onClick={()=>setQualityExpanded(x=>!x)} className="flex items-center justify-between gap-3 w-full text-left min-h-[44px]">',
'       <span className="flex-1 space-y-1"><strong className="text-sm text-cyan-200">Контроль качества данных</strong>',
'         <span className="block text-xs text-slate-400">Проблемных источников: {candidates.filter(a=>qualityReports[a.symbol].level===\\'bad\\'||qualityReports[a.symbol].level===\\'warning\\').length} из {candidates.length}</span>',
'       </span><span className="text-cyan-200 text-lg" aria-hidden="true">{qualityExpanded?\\'−\\':\\'+\\'}</span>',
'     </button>',
'     {qualityExpanded&&<div className="space-y-3 pt-3 border-t border-white/10 mt-2">',
details,
'     </div>}',
'   </section>'
].join('\n').replace(/\\'/g,"'");
replaceOnce(original,compact,'collapsible quality panel');
const journal="   <section className=\"rounded-2xl border border-teal-500/20 bg-[#101a2a] p-3 space-y-2\">";
replaceOnce(journal,read('updates/v34-postmortem-ui.txt')+'\n'+journal,'postmortem in signal history');
replaceOnce('РЫНОЧНЫЙ РАДАР • 3.3','РЫНОЧНЫЙ РАДАР • 3.4','version');
write('src/App.tsx',app);
fs.copyFileSync('updates/postmortem.ts','src/radar/postmortem.ts');
fs.copyFileSync('updates/test-postmortem.cjs','scripts/test-postmortem.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-postmortem.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 3.4 UX and Postmortem\n- Data-quality panel is collapsed by default, with an accessible summary and expansion state saved locally. Detailed live cards are rendered only when expanded, reducing layout jitter.\n- Learning postmortem counts TP3, SL, TP1-before-SL and factors observed at signal creation; it never claims to identify actual causes or guaranteed profitability.\n- Trading signals, virtual lifecycle, notifications and release-signing rules remain unchanged.\n');
console.log('APEX 3.4 compact data health and postmortem installed');
