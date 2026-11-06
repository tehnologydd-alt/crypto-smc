/** APEX 6.2: premium dark + lifecycle progress + real Settings switches.
 * Observational pipeline, stores, native core, alerts and virtual logic unchanged.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 6.2 missing '+label);return s.replace(a,b);}
function exactOne(s,replacement,pattern,label){
 const matches=[...s.matchAll(pattern)];
 if(matches.length!==1)throw Error('APEX 6.2 '+label+' count '+matches.length);
 return s.replace(pattern,replacement);
}
let app=read('src/App.tsx');
const rStart=app.indexOf("{view==='radar'&&!selectedDetail&&"),sStart=app.indexOf("{view==='history'&&",rStart);
if(rStart<0||sStart<=rStart)throw Error('APEX 6.2 invalid Radar route');
let radar=app.slice(rStart,sStart);
radar=rep(radar,'<header className="flex items-center justify-between gap-3">',
 '<header className="apex-aura-radar rounded-2xl px-3.5 py-4 flex items-center justify-between gap-3">','Radar hero');
radar=rep(radar,'<h1 className="text-2xl font-bold text-white">Радар</h1>',
 '<h1 className="text-2xl font-bold text-white tracking-tight">Радар <span className="text-cyan-300">/ Live</span></h1>','Radar heading');
radar=rep(radar,'aria-label="Режим радара" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#141e2d] p-1"',
 'aria-label="Режим радара" className="grid grid-cols-2 gap-1 rounded-xl border border-cyan-400/15 bg-[#101d30] p-1"','Radar tabs');
if(radar.split('bg-[#24484a] text-teal-100').length!==3)throw Error('APEX 6.2 Radar selected tabs expected twice');
radar=radar.replaceAll('bg-[#24484a] text-teal-100','bg-gradient-to-r from-[#177f8f] to-[#244c74] text-white shadow-sm');
const pulseStart=radar.indexOf('<section className="rounded-2xl border border-teal-500/20 bg-gradient-to-br');
const pulseEnd=radar.indexOf('</section>',pulseStart);
if(pulseStart<0||pulseEnd<=pulseStart)throw Error('APEX 6.2 old Market Pulse not found');
radar=radar.slice(0,pulseStart)+read('updates/v62-pulse-ui.txt')+radar.slice(pulseEnd+'</section>'.length);
radar=rep(radar,
 'className="border border-white/5 rounded-2xl bg-[#111b2a] p-3.5 cursor-pointer hover:border-teal-500/30 active:bg-[#19283a] focus-visible:outline focus-visible:outline-teal-400"',
 'className="apex-sheet rounded-xl p-3 cursor-pointer transition-colors hover:border-cyan-500/35 active:bg-[#193047] focus-visible:outline focus-visible:outline-cyan-400"','compact favorites');
radar=rep(radar,
 '{qualityReports[a.symbol]&&<p',
 "{qualityReports[a.symbol]&&qualityReports[a.symbol].level!=='ok'&&<p",'only noteworthy quality warnings');
radar=rep(radar,
 'className="rounded-xl border border-sky-500/20 bg-[#121e30] p-3 space-y-2"',
 'className="rounded-2xl border border-sky-400/25 bg-gradient-to-r from-[#13263d] to-[#1b1e3e] p-3.5 space-y-2"',
 'radar watch gradient');
app=app.slice(0,rStart)+radar+app.slice(sStart);
const sStart2=app.indexOf("{view==='history'&&"),centerStart=app.indexOf("{view==='statistics'&&",sStart2);
if(sStart2<0||centerStart<=sStart2)throw Error('APEX 6.2 invalid Signals route');
let signals=app.slice(sStart2,centerStart);
signals=rep(signals,'<header className="space-y-2">',
 '<header className="apex-aura-signals rounded-2xl p-4 space-y-2">','signal hero');
signals=rep(signals,'<h1 className="text-2xl font-bold text-slate-100">Сигналы</h1>',
 '<h1 className="text-2xl font-bold text-white tracking-tight">Сигналы <span className="text-violet-300">/ Life</span></h1>','signal title');
signals=rep(signals,'aria-label="Разделы сигналов" className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#131e2b] p-1"',
 'aria-label="Разделы сигналов" className="grid grid-cols-3 gap-1 rounded-xl border border-violet-400/20 bg-[#1a1832] p-1"','signals tab nav');
signals=rep(signals,'bg-[#253e51] text-sky-100',
 'bg-gradient-to-r from-[#6651ae] to-[#344e9d] text-white shadow-sm','signal active tab');
signals=rep(signals,'className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-2.5 text-center"',
 'className="rounded-xl border border-amber-400/30 bg-gradient-to-b from-[#3c2d20] to-[#211d29] p-2.5 text-center"','amber pending');
signals=rep(signals,'className="rounded-xl border border-sky-400/15 bg-sky-500/5 p-2.5 text-center"',
 'className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-[#1a3150] to-[#1a1f37] p-2.5 text-center"','blue active');
signals=rep(signals,'className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-2.5 text-center"',
 'className="rounded-xl border border-emerald-400/30 bg-gradient-to-b from-[#163e38] to-[#1b2734] p-2.5 text-center"','green completed');
signals=rep(signals,'className="rounded-2xl border border-teal-500/20 bg-[#101a2a] p-4 space-y-2"',
 'className="rounded-2xl border border-violet-400/25 bg-gradient-to-r from-[#211d3e] to-[#142638] p-4 space-y-2"',
 'demo palette');
app=app.slice(0,sStart2)+signals+app.slice(centerStart);
// Replace only the three general switches: all original onClick callbacks stay attached.
app=exactOne(app,
 '<APEXSwitch enabled={alerts} label="Уведомления о сигналах" onToggle={()=>void toggleNotifications()}/>',
 /<button aria-label=\{alerts\?"Отключить уведомления":"Включить уведомления"\} onClick=\{\(\)=>void toggleNotifications\(\)\}[\s\S]*?<\/button>/g,
 'notifications button');
app=exactOne(app,
 '<APEXSwitch enabled={keepScreenOn} label="Не гасить экран" onToggle={()=>setKeepScreenOn(v=>!v)}/>',
 /<button type="button" aria-label="Переключить режим не гасить экран"[\s\S]*?<\/button>/g,
 'screen-on button');
app=exactOne(app,
 '<APEXSwitch enabled={background} label="Фоновая проверка Android" onToggle={()=>void toggleBackground()}/>',
 /<button aria-label="Переключить фоновый мониторинг"[\s\S]*?<\/button>/g,
 'background button');
app=rep(app,'<input type="checkbox" checked={stagePrefs[k]} onChange={e=>setStagePrefs(p=>({...p,[k]:e.target.checked}))} className="h-5 w-5 accent-teal-400" />',
 '<span className="relative inline-flex shrink-0"><input type="checkbox" role="switch" aria-label={"Уведомлять: "+k} checked={stagePrefs[k]} onChange={e=>setStagePrefs(p=>({...p,[k]:e.target.checked}))} className="apex-stage-switch peer sr-only"/><span className="apex-stage-track" aria-hidden="true"/></span>',
 'per-stage notification switches');
const signalCardStart=app.indexOf('function SignalCard('),colorsStart=app.indexOf('const COLORS:Record<ScenarioStatus,string>',signalCardStart);
if(signalCardStart<0||colorsStart<=signalCardStart)throw Error('SignalCard refactor boundary missing');
app=app.slice(0,signalCardStart)+read('updates/v62-watch-card.txt')+'\n'+app.slice(colorsStart);
const groupStart=app.indexOf('function GroupCard('),appStart=app.indexOf('export default function App(){',groupStart);
if(groupStart<0||appStart<=groupStart)throw Error('GroupCard refactor boundary missing');
app=app.slice(0,groupStart)+read('updates/v62-group-card.txt')+'\n\n'+read('updates/v62-switch-component.txt')+'\n\n'+app.slice(appStart);
const scenarioStart=app.indexOf('function ScenarioCard('),scenarioEnd=app.indexOf('const exchangePrice=',scenarioStart);
if(scenarioStart<0||scenarioEnd<=scenarioStart)throw Error('ScenarioCard refactor boundary missing');
let sc=app.slice(scenarioStart,scenarioEnd);
sc=rep(sc,' const [detailsOpen,setDetailsOpen]=useState(false);',
 " const [detailsOpen,setDetailsOpen]=useState(false);\n const entryRecorded=!!scenario.activatedAt||scenario.status==='ACTIVE'||scenario.status==='TARGET'||scenario.status==='STOP';\n const finished=scenario.status!=='PENDING'&&scenario.status!=='ACTIVE';",
 'recorded scenario phases');
sc=rep(sc,
 'return <section className={\x60border rounded-2xl p-4 \x24{COLORS[scenario.status]}\x60}>',
 'return <section className={\x60border rounded-2xl p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] \x24{COLORS[scenario.status]}\x60}>',
 'polished scenario card');
const head='<div className="flex flex-wrap justify-between gap-2 items-center"><strong className="text-sm text-slate-100">{pairName(scenario.symbol)} · {(scenario.frame||\'5m\').toUpperCase()} · {scenario.direction}</strong><span className="text-xs font-bold">{STATUS[scenario.status]}</span></div>';
sc=rep(sc,head,head+'\n  '+read('updates/v62-scenario-stage.txt'),'honest timeline');
app=app.slice(0,scenarioStart)+sc+app.slice(scenarioEnd);
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.1','РЫНОЧНЫЙ РАДАР • 6.2','version');
write('src/App.tsx',app);
fs.appendFileSync('src/index.css','\n'+read('updates/v62-theme.css'));
fs.copyFileSync('updates/test-layout-v62.cjs','scripts/test-layout-v62.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-layout-v62.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.2 Premium Dark UX\n- Multicolor, accessible Radar (cyan/teal) and Signals (violet/blue), semantic pending amber/active blue/finished emerald colors; no monochrome screen. Compact Market Pulse, one-line watch observations and favorite quality warnings only when not OK. Original chart and asset detail remain accessible.\n- Signal cards show recorded creation, activation and completion separately; an expired/cancelled scenario never falsely shows an activation. TP segments represent stored tpReached only. Research and virtual studies unchanged.\n- Settings on/off controls are accessible switches for notifications, screen-on, background WorkManager and eight stage notification preferences. Existing persistence and onClick handlers preserved.\n- Native scheduler, signal calculations, notification delivery, wallet API, learning and CORE archival protocols unchanged. Reduced motion and focus-visible controls supported.\n');
console.log('APEX 6.2 visual redesign and switch actions applied');
