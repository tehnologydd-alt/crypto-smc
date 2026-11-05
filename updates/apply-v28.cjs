/** APEX 2.8: virtual journal, compact nav and fixed last-card scrolling. Applied after 2.7. */
const fs=require('node:fs'),file='src/App.tsx';
let s=fs.readFileSync(file,'utf8');
const change=(from,to)=>{if(!s.includes(from))throw Error('APEX 2.8 patch missing: '+from.slice(0,80));s=s.replace(from,to);};
change("type View='radar'|'history'|'settings';",`type View='radar'|'history'|'settings';
type DemoTicket={scenarioId:string;symbol:string;frame:Timeframe;direction:'LONG'|'SHORT';createdAt:number;entry:number;stop:number;targets:[number,number,number]};
const demoStoreKey='apex_v28_demo_journal';
const loadDemoTickets=():DemoTicket[]=>{try{const data=JSON.parse(localStorage.getItem(demoStoreKey)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.scenarioId==='string'&&Number.isFinite(x.entry)&&Number.isFinite(x.stop)).slice(0,100):[];}catch{return [];}};`);
change('function ScenarioCard({scenario,now}:{scenario:Scenario;now:number}){','function ScenarioCard({scenario,now,onDemo,isSaved=false}:{scenario:Scenario;now:number;onDemo?:(s:Scenario)=>void;isSaved?:boolean}){');
change('<p className="mt-2 text-[10px] text-slate-500">* Исследовательский сценарий',`{onDemo&&(scenario.status==='PENDING'||scenario.status==='ACTIVE')&&<button type="button" disabled={isSaved} onClick={()=>onDemo(scenario)} className="mt-3 w-full rounded-xl border border-teal-500/40 bg-teal-500/10 py-2.5 text-sm font-medium text-teal-200 disabled:opacity-50">{isSaved?'✓ В демо-журнале':'Добавить в демо-журнал'}</button>}
  <p className="mt-2 text-[10px] text-slate-500">* Исследовательский сценарий`);
if(s.includes('function ScenarioGroupCard({group,now}:{group:ScenarioGroup;now:number}){')){
 change('function ScenarioGroupCard({group,now}:{group:ScenarioGroup;now:number}){','function ScenarioGroupCard({group,now,onDemo,savedIds}:{group:ScenarioGroup;now:number;onDemo?:(s:Scenario)=>void;savedIds?:Set<string>}){');
}else{
 change('function GroupCard({group,now}:{group:ReturnType<typeof groupedOpen>[number];now:number}){','function GroupCard({group,now,onDemo,savedIds}:{group:ReturnType<typeof groupedOpen>[number];now:number;onDemo?:(s:Scenario)=>void;savedIds?:Set<string>}){');
}
change('<ScenarioCard scenario={lead} now={now}/>','<ScenarioCard scenario={lead} now={now} onDemo={onDemo} isSaved={savedIds?.has(lead.id)??false}/>');
change('<ScenarioCard key={s.id} scenario={s} now={now}/>','<ScenarioCard key={s.id} scenario={s} now={now} onDemo={onDemo} isSaved={savedIds?.has(s.id)??false}/>');
change(' const [scenarios,setScenarios]=useState<Scenario[]>(safeScenarios);',` const [scenarios,setScenarios]=useState<Scenario[]>(safeScenarios);
 const [demoTickets,setDemoTickets]=useState<DemoTicket[]>(loadDemoTickets);
 const savedDemoIds=useMemo(()=>new Set(demoTickets.map(t=>t.scenarioId)),[demoTickets]);
 const saveDemoScenario=(scenario:Scenario)=>setDemoTickets(old=>old.some(t=>t.scenarioId===scenario.id)?old:[{scenarioId:scenario.id,symbol:scenario.symbol,frame:scenario.frame||'5m',direction:scenario.direction,createdAt:Date.now(),entry:scenario.entry,stop:scenario.stop,targets:targetsOf(scenario)},...old].slice(0,100));`);
change(" useEffect(()=>{try{localStorage.setItem('apex_v2_history',JSON.stringify(history));}catch{};},[history]);",` useEffect(()=>{try{localStorage.setItem('apex_v2_history',JSON.stringify(history));}catch{};},[history]);
 useEffect(()=>{try{localStorage.setItem(demoStoreKey,JSON.stringify(demoTickets));}catch{}},[demoTickets]);`);
change('РЫНОЧНЫЙ РАДАР • 2.7','РЫНОЧНЫЙ РАДАР • 2.8');
change('min-h-screen bg-[#080d17] text-slate-100 pb-16 selection:bg-teal-500/25','min-h-[100dvh] bg-[#080d17] text-slate-100 pb-[calc(104px+env(safe-area-inset-bottom,0px))] selection:bg-teal-500/25');
change('<main className="max-w-3xl mx-auto px-4 pt-5 space-y-5">','<main id="apex-content" className="max-w-3xl mx-auto px-4 pt-5 pb-4 space-y-5">');
change('pb-[max(env(safe-area-inset-bottom),4px)]','pb-1');
change('gap-0.5 py-1.5 text-[11px]','justify-center gap-0.5 min-h-[54px] py-1 text-[11px]');
change('onClick={()=>{setView(x.id);setSelectedDetail(null);}}',"onClick={()=>{setView(x.id);setSelectedDetail(null);window.scrollTo({top:0,behavior:'instant'});}}");
if(s.includes('<ScenarioGroupCard group={g} now={now}/>'))
 s=s.replaceAll('<ScenarioGroupCard group={g} now={now}/>','<ScenarioGroupCard group={g} now={now} onDemo={saveDemoScenario} savedIds={savedDemoIds}/>');
else if(s.includes('<GroupCard group={g} now={now}/>'))
 s=s.replaceAll('<GroupCard group={g} now={now}/>','<GroupCard group={g} now={now} onDemo={saveDemoScenario} savedIds={savedDemoIds}/>');
else throw Error('APEX 2.8 group cards missing');
change('<ScenarioCard scenario={x} now={now}/>','<ScenarioCard scenario={x} now={now} onDemo={saveDemoScenario} isSaved={savedDemoIds.has(x.id)}/>');
change('   {scenarios.length?<div className="space-y-3">',`   <section className="rounded-2xl border border-teal-500/20 bg-[#101a2a] p-3 space-y-2">
    <div className="flex justify-between items-center gap-2"><strong className="text-sm text-teal-200">Демо-журнал</strong><span className="text-xs text-slate-400">{demoTickets.length} записей</span></div>
    <p className="text-[11px] text-slate-400">Нажми «Добавить в демо-журнал» на карточке сигнала. Entry, SL и три TP сохраняются локально. Реальные ордера не открываются.</p>
    {demoTickets.slice(0,5).map(t=>{const live=scenarios.find(s=>s.id===t.scenarioId);return <div key={t.scenarioId} className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs"><span className="font-medium">{pairName(t.symbol)} · {t.frame.toUpperCase()} · {t.direction}</span><span className="text-slate-300">{live?STATUS[live.status]:'Нет актуального сценария'}</span></div>})}
   </section>
   {scenarios.length?<div className="space-y-3">`);
fs.writeFileSync(file,s);
fs.appendFileSync('src/index.css','\n/* Last card scrolls fully above fixed navigation. */\nhtml { scroll-padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px)); }\n#apex-content { scroll-margin-bottom: calc(104px + env(safe-area-inset-bottom, 0px)); }\n');
fs.appendFileSync('README.md','\n\n## APEX 2.8\n- Compact bottom tabs; last card can scroll above the navigation.\n- Virtual demo journal stores Entry, SL, TP1-3; no actual orders.\n');
console.log('APEX 2.8 patch applied');
