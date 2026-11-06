/** APEX 6.1: distinct mobile Radar and Signals workspaces, without new routes or data mutations. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){if(!s.includes(a))throw Error('APEX 6.1 missing '+label);return s.replace(a,b);}
let app=read('src/App.tsx');
const rStart=app.indexOf("{view==='radar'&&!selectedDetail&&"),
 hStart=app.indexOf("{view==='history'&&",rStart),
 cStart=app.indexOf("{view==='statistics'&&",hStart);
if(rStart<0||hStart<=rStart||cStart<=hStart)throw Error('APEX 6.1 route boundaries not found');
const oldRadar=app.slice(rStart,hStart);
const pulseAnchor='<section className="rounded-2xl border border-teal-500/20 bg-gradient-to-br';
const pStart=oldRadar.indexOf(pulseAnchor),pEnd=oldRadar.indexOf('</section>',pStart);
if(pStart<0||pEnd<=pStart)throw Error('Pulse card not found in Radar');
const pulse=oldRadar.slice(pStart,pEnd+'</section>'.length);
const fStart=oldRadar.indexOf('<div className="space-y-2">',pEnd),
 situation=oldRadar.indexOf('<div className="flex items-center justify-between"><h2 className="font-semibold text-lg">Ситуации сейчас',fStart);
if(fStart<0||situation<=fStart)throw Error('Favorite-list boundary not found');
let favoriteRows=oldRadar.slice(fStart,situation).trim();
const duplicate=/\{FRAMES\.some\(f=>a\.signals\[f\]\)&&<div className="mt-3 flex justify-between items-center border-t border-white\/5 pt-2 text-xs">[\s\S]*?<\/div>\}/;
if(!duplicate.test(favoriteRows))throw Error('Repeated per-pair signal summary missing');
favoriteRows=favoriteRows.replace(duplicate,'');
favoriteRows=rep(favoriteRows,'<p className="text-[11px] text-teal-400 mt-2 text-right">Подробнее об активе ›</p>','','remove redundant tap hint');
const newRadar=read('updates/v61-radar-ui.txt');
if(!newRadar.includes('__APEX_PULSE__')||!newRadar.includes('__APEX_FAVORITES__'))throw Error('UI placeholders missing');
const newSignals=read('updates/v61-signals-ui.txt');
app=app.slice(0,rStart)+newRadar.replace('__APEX_PULSE__',pulse).replace('__APEX_FAVORITES__',favoriteRows)+'\n'+newSignals+'\n'+app.slice(cStart);
app=rep(app," const [view,setView]=useState<View>('radar');",
" const [view,setView]=useState<View>('radar');\n const [radarArea,setRadarArea]=useState<'assets'|'watch'>('assets');\n const [signalArea,setSignalArea]=useState<'current'|'done'|'demo'>('current');\n const [signalStatusFilter,setSignalStatusFilter]=useState<'all'|'PENDING'|'ACTIVE'>('all');",
'new direct screen sections');
app=rep(app,
"setSelectedDetail(null);setView('history');setHighlightScenario(id);",
"setSelectedDetail(null);setView('history');setSignalArea('current');setSignalStatusFilter('all');setHighlightScenario(id);",
'notification deep-link to visible stage');
app=rep(app,
"},[view,highlightScenario]);",
"},[view,highlightScenario,signalArea,signalStatusFilter]);",
'deep-link scroll after stage switch');

app=rep(app,
" const [scenarios,setScenarios]=useState<Scenario[]>(safeScenarios);",
" const [scenarios,setScenarios]=useState<Scenario[]>(safeScenarios);\n useEffect(()=>{if(view!=='history'||!highlightScenario)return;const selected=scenarios.find(s=>s.id===highlightScenario);if(selected&&selected.status!=='PENDING'&&selected.status!=='ACTIVE')setSignalArea('done');},[view,highlightScenario,scenarios]);",
'closed notification opens completed history');

const cardStart=app.indexOf('function ScenarioCard('),cardEnd=app.indexOf('const exchangePrice=',cardStart);
if(cardStart<0||cardEnd<=cardStart)throw Error('ScenarioCard function missing');
let card=app.slice(cardStart,cardEnd);
card=rep(card,
"function ScenarioCard({scenario,now,onDemo,isSaved=false}:{scenario:Scenario;now:number;onDemo?:(s:Scenario)=>void;isSaved?:boolean}){",
"function ScenarioCard({scenario,now,onDemo,isSaved=false,compact=false}:{scenario:Scenario;now:number;onDemo?:(s:Scenario)=>void;isSaved?:boolean;compact?:boolean}){\n const [detailsOpen,setDetailsOpen]=useState(false);",
'compact history card state');
card=rep(card,
'  <div className="grid grid-cols-2 gap-3 mt-3 text-xs">',
'  {compact&&<button type="button" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(v=>!v)} className="mt-3 min-h-[44px] w-full rounded-lg border border-white/10 bg-slate-900/35 px-3 text-left text-xs font-semibold text-sky-200">{detailsOpen?"Скрыть параметры":"Показать вход, цели и итог"}</button>}\n  {(!compact||detailsOpen)&&<>\n  <div className="grid grid-cols-2 gap-3 mt-3 text-xs">',
'details only when opened for completed');
card=rep(card,'</section>;','</>}\n  </section>;','close history details fragment');
const repeated='<p className="text-[11px] text-slate-400 mt-2">Виртуальное сопровождение: после TP1 можно рассматривать уменьшение риска, но приложение не изменяет никаких реальных ордеров.</p>';
if(!card.includes(repeated))throw Error('repeated card caveat not found');
card=card.replace(repeated,'');
const foot='<p className="mt-2 text-[10px] text-slate-500">* Исследовательский сценарий после подтверждённого пробоя, ожидает повторного касания уровня. Никаких реальных ордеров. Порядок цен внутри свечи неизвестен.</p>';
if(!card.includes(foot))throw Error('repeated card footer not found');
card=card.replace(foot,'');
app=app.slice(0,cardStart)+card+app.slice(cardEnd);
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.0','РЫНОЧНЫЙ РАДАР • 6.1','app version');
write('src/App.tsx',app);
fs.copyFileSync('updates/test-layout-v61.cjs','scripts/test-layout-v61.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-layout-v61.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.1 Radar and Signals mobile workspace\n- Keeps the existing bottom routes while splitting Radar into favorite-price overview and observational WATCH/confirmed radar results. Market Pulse stays in favorites; the duplicated active scenario list is removed from Radar and kept in Signals only.\n- Signals now has three direct peer sections: current virtual scenarios with optional PENDING/ACTIVE filters, completed forecast history with compact expandable details, and the separately retained manual demo journal. No research evidence or scenario records are altered or backfilled.\n- All existing filters, asset charts, pair catalog, price copy, demo actions, state transitions, stage notifications and GitHub APK signing remain intact. Android notification deep links switch to the current view before scrolling to the referenced scenario.\n- This is UI-only navigation; no exchange order submission, changes to strategies, paper accounting or CORE engine. Historical store keys, statuses and back-end subscriptions are unchanged.\n');
console.log('APEX 6.1 Radar and Signals UI isolation applied; lifecycle unchanged');
