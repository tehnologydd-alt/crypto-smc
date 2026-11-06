/** APEX 6.0: flatten Center navigation, preserve all research ledgers and signals. */
const fs=require('node:fs'),ts=require('typescript');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 6.0 missing '+label);return s.replace(a,b);}
let app=read('src/App.tsx');
const sf=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function locate(part,tag){
 const hits=[];
 const walk=node=>{
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(sf)===tag){
   const a=node.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.text==='className');
   const v=a&&ts.isJsxAttribute(a)?a.initializer:null;
   if(v&&ts.isStringLiteral(v)&&v.text.includes(part))hits.push(app.slice(node.getStart(sf),node.getEnd()));
  }
  ts.forEachChild(node,walk);
 };
 walk(sf);
 if(hits.length!==1)throw Error('APEX 6.0 expected one '+tag+' '+part+', found '+hits.length);
 return hits[0];
}
const native=locate('border-indigo-500/20 bg-[#101827]','section');
const director=locate('border-fuchsia-400/20 bg-[#19172a]','div');
const start=app.indexOf("{view==='statistics'&&<>"),end=app.indexOf("{view==='settings'&&",start);
if(start<0||end<=start)throw Error('Statistics route not found');
let old=app.slice(start,end).trimEnd();
const prefix="{view==='statistics'&&<>";
if(!old.startsWith(prefix)||!old.endsWith('</>}'))throw Error('Invalid Statistics route');
old=old.slice(prefix.length,-4);
old=rep(old,native,'','rehome native CORE');
old=rep(old,director,'','remove nested Director');
old=rep(old,
'<div><h1 className="text-2xl font-bold">Статистика и исследования</h1><p className="text-sm mt-1 text-slate-400">Автоматические прогнозы APEX · Learning Engine · Проверка гипотез</p></div>',
'','replace old page header');
const workspace=read('updates/v60-center-ui.txt');
if(!workspace.includes('__APEX_NATIVE_CORE__'))throw Error('Missing native CORE placeholder');
const ui=workspace.replace('__APEX_NATIVE_CORE__',native);
const page="{view==='statistics'&&<>\n"+ui+"\n{researchSection==='checks'&&<div className=\"space-y-4\">\n"+
'<section className="rounded-xl border border-sky-400/15 bg-[#111b2a] p-3"><h2 className="text-base font-semibold text-sky-200">Подробные проверки</h2><p className="mt-1 text-xs text-slate-400">CORE, H1/H4 и Learning — исходные научные разделы с сохранёнными данными.</p></section>\n'+old+'\n</div>}\n</>}\n';
app=app.slice(0,start)+page+app.slice(end);
app=rep(app," const [directorExpanded,setDirectorExpanded]=useState(false);"," const [researchSection,setResearchSection]=useState<'overview'|'director'|'data'|'checks'>('overview');",'research routing state');
for(const oldState of [
 " const [queueExpanded,setQueueExpanded]=useState(false);",
 " const [reviewReportsExpanded,setReviewReportsExpanded]=useState(false);",
 " const [coreMemoryExpanded,setCoreMemoryExpanded]=useState(false);"
])app=rep(app,oldState,'','remove obsolete accordion state');
app=rep(app,"{id:'statistics',label:'Статистика',icon:Activity}","{id:'statistics',label:'Центр',icon:Activity}",'navigation label');
app=rep(app,
'<nav className="relative z-30 shrink-0 bg-[#0d1422]/95 backdrop-blur-xl border-t border-white/10 px-3 pb-1"><div className="max-w-3xl mx-auto grid grid-cols-4">',
'<nav className="relative z-30 shrink-0 bg-[#0d1422]/95 backdrop-blur-xl border-t border-white/10 px-3 pb-1.5 pt-1"><div className="max-w-3xl mx-auto grid grid-cols-4 gap-1">',
'better primary tab spacing');
app=rep(app,"'text-teal-300':'text-slate-500'","'text-teal-200 bg-teal-400/10':'text-slate-400'","visible active tab");
app=rep(app,'РЫНОЧНЫЙ РАДАР • 5.6','РЫНОЧНЫЙ РАДАР • 6.0','release');
write('src/App.tsx',app);
let oldTest=read('scripts/test-layout-v40.cjs');
oldTest=rep(oldTest,"label:'Статистика',icon:Activity","label:'Центр',icon:Activity",'v4.0 navigation compatibility test');
write('scripts/test-layout-v40.cjs',oldTest);
fs.copyFileSync('updates/test-layout-v60.cjs','scripts/test-layout-v60.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-layout-v60.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.0 Center UI\n- Keep original 4 main route IDs (Radar, Signals, Statistics now called Center, Settings), without changes to local state, storage keys, collection protocols, signals or background scheduling.\n- The Center has four direct peer sections: overview, Director, native CORE/data/backup, detailed historical checks. Common tasks no longer require a chain of nested accordions.\n- The main Director workbench shows current question, three evidence auditors, prospective repetition, live task queue, immutable reports and decision history directly. Only individual report details optionally expand.\n- All existing Native CORE controls/WorkManager reliability diagnostics and validated CORE Memory export/import now share one first-level Data screen.\n- Detailed H1/H4 and Learning research still exists under Checks, including method descriptions and original observations; no journal deletion or re-registration. Tests assert preserved histories, unique controls and valid TSX.\n');
console.log('APEX 6.0 centered, four-section workspace mounted without modifying research logic');
