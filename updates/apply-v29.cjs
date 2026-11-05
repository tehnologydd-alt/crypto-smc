/** APEX 2.9 Guardian UI patch after v2.8 source restoration */
const fs=require('node:fs');
const p='src/App.tsx';let s=fs.readFileSync(p,'utf8');
function rep(a,b,label){if(!s.includes(a))throw Error('APEX 2.9 '+label+' not found');s=s.replace(a,b)}
s="import {evaluatePassport} from './radar/guardian';\\n"+s;
rep("savedIds:Set<string>}){\n const [expanded,setExpanded]=useState(false);","savedIds:Set<string>;asset?:AssetState}){\n const [expanded,setExpanded]=useState(false);",'props');
rep("function ScenarioGroupCard({group,now,onDemo,savedIds}:{","function ScenarioGroupCard({group,now,onDemo,savedIds,asset}:{",'component');
rep(" const lead=group.scenarios[0];\n return <section"," const lead=group.scenarios[0];\n const passport=evaluatePassport(lead,asset?{price:asset.price,lastTick:asset.lastTick,signals:asset.signals,volumeRatio:asset.volumeRatio}:null,now);\n return <section",'assess');
rep("  <ScenarioCard scenario={lead} now={now}","  <div className=\"rounded-xl border border-teal-500/20 bg-teal-950/10 p-3 space-y-2\">\n   <div className=\"flex justify-between items-center text-sm\"><strong className=\"text-teal-200\">Паспорт прогноза · Guardian</strong><span className=\"text-xs text-slate-300\">{passport.supported} подтверждают / {passport.conflicted} против</span></div>\n   <div className=\"flex flex-wrap gap-1.5\">{passport.evidence.map(e=><span key={e.frame} title={e.label} className={'rounded-lg border px-2 py-1 text-[11px] '+(e.status==='supports'?'text-teal-300 border-teal-800':e.status==='conflicts'?'text-rose-300 border-rose-800':'text-slate-400 border-slate-700')}>{e.frame.toUpperCase()} · {e.status==='supports'?'подтверждает':e.status==='conflicts'?'против':'н/д'}</span>)}</div>\n   <p className=\"text-xs text-slate-300\">{passport.reason}</p>\n  </div>\n  <ScenarioCard scenario={lead} now={now}",'passport UI');
rep("savedIds={savedDemoIds}/>","savedIds={savedDemoIds} asset={assets[g.symbol]}/>",'pass asset');
rep('РЫНОЧНЫЙ РАДАР • 2.8','РЫНОЧНЫЙ РАДАР • 2.9','version');
fs.writeFileSync(p,s);
fs.copyFileSync('updates/guardian.ts','src/radar/guardian.ts');
fs.copyFileSync('updates/test-guardian.cjs','scripts/test-guardian.cjs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));pkg.scripts.test+=' && node scripts/test-guardian.cjs';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('APEX 2.9 Guardian passport applied');
