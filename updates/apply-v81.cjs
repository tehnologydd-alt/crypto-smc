/** APEX 8.1: Assistant layout only; never changes paper orders or studies. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function replaceOne(s,a,b,name){
 const hits=s.split(a).length-1;
 if(hits!==1)throw Error('APEX 8.1 '+name+' expected one, found '+hits);
 return s.replace(a,b);
}
function removeSection(app,heading,opening,name){
 const pos=app.indexOf(heading);
 if(pos<0)throw Error('APEX 8.1 missing '+name);
 const from=app.lastIndexOf(opening,pos);
 if(from<0||pos-from>500)throw Error('APEX 8.1 bad section '+name);
 const closers=['\n </section>','\n</section>'];
 const candidates=closers.map(tag=>({at:app.indexOf(tag,pos),tag})).filter(c=>c.at>=0).sort((a,b)=>a.at-b.at);
 if(!candidates.length)throw Error('APEX 8.1 missing section end '+name);
 const end=candidates[0].at+candidates[0].tag.length;
 return {content:app.slice(from,end),app:app.slice(0,from)+app.slice(end)};
}
function extractCard(section,begin,end,name){
 const start=section.indexOf(begin),stop=section.lastIndexOf(end);
 if(start<0||stop<start)throw Error('APEX 8.1 cannot extract '+name);
 return section.slice(start+begin.length,stop)+end.slice(0,end.indexOf(')}'));
}
let app=read('src/App.tsx');
app=replaceOne(app," const [futuresBackgroundMessage,setFuturesBackgroundMessage]=useState('');",
 " const [futuresBackgroundMessage,setFuturesBackgroundMessage]=useState('');\n const [assistantSubtab,setAssistantSubtab]=useState<'positions'|'research'>(()=>localStorage.getItem('apex_v81_assistant_subtab')==='research'?'research':'positions');",
 'inner tab state');
app=replaceOne(app," const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);",
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);\n useEffect(()=>{try{localStorage.setItem('apex_v81_assistant_subtab',assistantSubtab);}catch{}},[assistantSubtab]);",
 'remember UI tab only');
// Keep Spot / Futures choice on top, and move only the evidence diary to Research.
const originalMarket=read('updates/v65-market-ui.txt');
let market=replaceOne(originalMarket,
 ' <div className="space-y-2">\n  <div className="flex items-center justify-between gap-2"><strong className="text-[12px] text-white">Дневник проверки решений</strong>',
 ' {assistantSubtab===\'research\'&&<div className="space-y-2 rounded-xl border border-white/10 bg-[#0b1929] p-3">\n  <div className="flex items-center justify-between gap-2"><strong className="text-[12px] text-white">Дневник проверки решений</strong>',
 'hide research diary from Positions');
market=replaceOne(market,' </div>\n</section>}',' </div>}\n</section>}','close conditional diary');
app=replaceOne(app,originalMarket,market+'\n'+read('updates/v81-assistant-nav.txt'),'top selector + new navigation');
// Move all research-only panels WITHOUT changing their event handlers, state or criteria.
const sources=[
 ['quality','v68-market-health-ui.txt'],
 ['profit','v75-demo-profit-ui.txt'],
 ['audit','v69-outcome-audit-ui.txt'],
 ['fees','v68-fee-ui.txt'],
 ['hypotheses','v70-hypothesis-ui.txt'],
 ['validation','v71-forward-validation-ui.txt'],
 ['shadow','v72-shadow-lab-ui.txt'],
 ['mentor','v73-mentor-ui.txt'],
 ['monitor','v77-monitor-ui.txt'],
 ['android','v78-background-panel.txt'],
 ['native','v79-native-background-ui.txt'],
 ['stability','v80-release-panel.txt']
];
const research={};
for(const [name,file] of sources){
 const panel=read('updates/'+file);
 app=replaceOne(app,panel,'','move '+name);
 research[name]=panel;
}
// Version 6.7 study center had later AUTO/rolling edits; extract the LIVE JSX
// so those edits survive rather than restoring an outdated source snippet.
const study=removeSection(app,'Центр независимой проверки',
 '<section className="rounded-2xl border border-violet-400/20 bg-[#131f32]',
 'prospective study');
research.study=study.content;app=study.app;
// The original ticket detail JSX is reused verbatim for active and closed items.
const fut=removeSection(app,'Futures DEMO · журнал','<section className="space-y-2">','futures mixed ledger');
app=fut.app;
const futuresCard=extractCard(fut.content,
 'futuresLedger.tickets.slice(0,30).map(o=>','</article>)}','futures card');
const futuresByVenue=[
 '<section className="space-y-3">',
 ' <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold text-white">Позиции Futures · DEMO</h2><span className="text-[11px] text-slate-400">{futuresLedger.tickets.length} в журнале</span></div>',
 " {(['binance','bybit'] as const).map(exchange=>{",
 "  const venue=futuresLedger.tickets.filter(o=>o.plan.source===exchange);",
 "  const active=venue.filter(o=>o.state==='WAITING'||o.state==='OPEN');",
 "  const closed=venue.filter(o=>o.state!=='WAITING'&&o.state!=='OPEN');",
 '  return <section key={exchange} className="space-y-2 rounded-2xl border border-white/10 bg-[#111d2d] p-3">',
 '   <div className="flex items-center justify-between gap-2">',
 "    <div><h3 className=\"text-sm font-bold text-white\">{exchange==='binance'?'Binance Futures':'Bybit Futures'}</h3>",
 '     <p className="text-[10px] text-slate-400">{active.length} открыто или ожидает · {closed.length} завершено</p></div>',
 '    <span className="rounded-lg border border-teal-400/25 bg-teal-400/10 px-2 py-1 text-[10px] font-semibold text-teal-200">DEMO</span>',
 '   </div>',
 '   {active.length===0?<p className="rounded-lg border border-dashed border-slate-600 p-3 text-[11px] text-slate-400">Нет открытых или ожидающих виртуальных позиций.</p>:',
 '    active.map(o=>'+futuresCard+')}',
 '   <details className="rounded-xl border border-slate-600/40 bg-[#0a1728] p-2.5">',
 '    <summary className="cursor-pointer text-xs font-semibold text-slate-300">История завершённых · {closed.length} <span className="text-[10px] text-slate-500">(раскрыть)</span></summary>',
 '    <div className="space-y-2 pt-3">{closed.length===0?<p className="text-[11px] text-slate-500">Пока нет закрытых виртуальных сценариев.</p>:',
 '     closed.map(o=>'+futuresCard+')}</div>',
 '   </details>',
 '  </section>;',
 ' })}',
 '</section>'
].join('\n');
const futuresFooter=' <p className="text-[11px] leading-relaxed text-slate-500">Учебный расчёт отражает только валовое изменение цены без комиссий';
app=replaceOne(app,futuresFooter,futuresByVenue+'\n'+futuresFooter,'new Binance/Bybit Futures ledger');
// Spot also uses preserved virtual ticket detail markup: no new actions.
const spot=removeSection(app,'Демо-ордера и сопровождение','<section className="space-y-3">','Spot mixed ledger');
app=spot.app;
const spotCard=extractCard(spot.content,
 'assistantLedger.orders.slice(0,30).map(o=>','</div>)}','Spot card');
const spotByVenue=[
 '<section className="space-y-3">',
 ' <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold text-white">Позиции Spot · DEMO</h2><span className="text-[11px] text-slate-400">{assistantLedger.orders.length} в журнале</span></div>',
 " {(['binance','bybit'] as const).map(exchange=>{",
 '  const venue=assistantLedger.orders.filter(o=>o.exchange===exchange);',
 "  const active=venue.filter(o=>o.state==='WAITING'||o.state==='OPEN');",
 "  const closed=venue.filter(o=>o.state!=='WAITING'&&o.state!=='OPEN');",
 '  return <section key={exchange} className="space-y-2 rounded-2xl border border-white/10 bg-[#111d2d] p-3">',
 '   <div className="flex items-center justify-between gap-2">',
 "    <div><h3 className=\"text-sm font-bold text-white\">{exchange==='binance'?'Binance Spot':'Bybit Spot'}</h3>",
 '     <p className="text-[10px] text-slate-400">{active.length} открыто или ожидает · {closed.length} завершено</p></div>',
 '    <span className="rounded-lg border border-teal-400/25 bg-teal-400/10 px-2 py-1 text-[10px] font-semibold text-teal-200">DEMO</span>',
 '   </div>',
 '   {active.length===0?<p className="rounded-lg border border-dashed border-slate-600 p-3 text-[11px] text-slate-400">Нет активных виртуальных Spot-позиций.</p>:',
 '    active.map(o=>'+spotCard+')}',
 '   <details className="rounded-xl border border-slate-600/40 bg-[#0a1728] p-2.5">',
 '    <summary className="cursor-pointer text-xs font-semibold text-slate-300">История завершённых · {closed.length} <span className="text-[10px] text-slate-500">(раскрыть)</span></summary>',
 '    <div className="space-y-2 pt-3">{closed.length===0?<p className="text-[11px] text-slate-500">Пока нет закрытых виртуальных позиций.</p>:',
 '     closed.map(o=>'+spotCard+')}</div>',
 '   </details>',
 '  </section>;',
 ' })}',
 '</section>'
].join('\n');
const spotFooter=' <p className="text-[11px] leading-relaxed text-slate-500">Ассистент обрабатывает только реально полученные закрытые свечи.';
app=replaceOne(app,spotFooter,spotByVenue+'\n'+spotFooter,'new Binance/Bybit Spot ledger');
// Hide full Spot working console on research, keeping research diary accessible.
app=replaceOne(app,
 "{showLegacySpotArchive&&view==='assistant'&&<div className=\"space-y-4\">",
 "{showLegacySpotArchive&&view==='assistant'&&assistantSubtab==='positions'&&<div className=\"space-y-4\">",
 'Spot positions guard');
// Wrap the existing Futures screen with Positions guard, append Research groups.
const open="{view==='assistant'&&!showLegacySpotArchive&&<div className=\"space-y-4\">";
const rootStart=app.indexOf(open);
if(rootStart<0||app.indexOf(open,rootStart+1)>=0)throw Error('APEX 8.1 Futures root is not unique');
const lastNote=app.indexOf(futuresFooter,rootStart);
const end=app.indexOf('\n</div>}',lastNote);
if(lastNote<rootStart||end<0||end-rootStart>120000)throw Error('APEX 8.1 Futures root end not found');
const root=app.slice(rootStart,end+'\n</div>}'.length);
if(root.includes('Центр независимой проверки')||root.includes('APEX 7.7 · Качество наблюдения'))
 throw Error('APEX 8.1 research panels still inside Futures positions');
const group=(heading,blocks,openDefault=false)=>[
 ' <details '+(openDefault?'open ':'')+'className="rounded-xl border border-slate-600/35 bg-[#101d2e] p-3">',
 '  <summary className="cursor-pointer text-sm font-semibold text-white">'+heading+'</summary>',
 '  <div className="space-y-3 pt-3">',...blocks,'  </div>',
 ' </details>'
].join('\n');
const researchView=[
 '<section className="space-y-3">',
 ' <header className="rounded-2xl border border-violet-400/25 bg-gradient-to-r from-[#22213c] to-[#103038] p-4">',
 '  <h2 className="text-lg font-bold text-white">Исследовательский центр APEX</h2>',
 '  <p className="pt-1 text-[11px] text-slate-300">Проверки и статистика вынесены из управления DEMO-позициями. Исследования не изменяют открытые виртуальные заявки.</p>',
 ' </header>',
 group('Независимый протокол и 64 контрольные точки',[research.study],true),
 group('Качество рыночных данных и перерывы',[research.quality,research.monitor]),
 group('Результаты, комиссии и разбор ошибок',[research.profit,research.audit,research.fees]),
 group('Гипотезы, будущая проверка, SHADOW и наставник',[research.hypotheses,research.validation,research.shadow,research.mentor]),
 group('Фоновая работа Android и паспорт стабильности',[research.android,research.native,research.stability]),
 ' <p className="text-[10px] text-slate-500">Статистика учебная; она не подтверждает точность прогнозов, доходность или непрерывный сбор при ограничениях Android.</p>',
 '</section>'
].join('\n');
const wrapped=root.replace(open,open+"\n {assistantSubtab==='positions'&&<>")
 .replace(/\n<\/div>\}$/, "\n </>}\n {assistantSubtab==='research'&&<>\n"+researchView+"\n </>}\n</div>}");
if(wrapped===root||!wrapped.includes("assistantSubtab==='research'"))throw Error('APEX 8.1 futures tabs wrapping failed');
app=replaceOne(app,root,wrapped,'Futures positions/research separation');
const spotLab='{view===\'assistant\'&&showLegacySpotArchive&&assistantSubtab===\'research\'&&<section className="rounded-2xl border border-violet-400/20 bg-[#101d30] p-4 space-y-2"><h2 className="text-sm font-semibold text-white">Исследования Spot DEMO</h2><p className="text-[11px] text-slate-300">Сводка Spot находится в дневнике выше. Независимый протокол и контрольные точки Futures не объединяются со Spot — переключись на Futures для их просмотра.</p><p className="text-[10px] text-slate-500">Все виртуальные Spot-позиции доступны на вкладке «Позиции».</p></section>}';
app=replaceOne(app,
 "{showLegacySpotArchive&&view==='assistant'&&assistantSubtab==='positions'&&<div className=\"space-y-4\">",
 spotLab+"\n {showLegacySpotArchive&&view==='assistant'&&assistantSubtab==='positions'&&<div className=\"space-y-4\">",
 'Spot research explanation');
app=replaceOne(app,'РЫНОЧНЫЙ РАДАР • 8.0','РЫНОЧНЫЙ РАДАР • 8.1','version');
write('src/App.tsx',app);
fs.copyFileSync('updates/test-v81-assistant-layout.cjs','scripts/test-v81-assistant-layout.cjs');
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;
 let test=read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.0','РЫНОЧНЫЙ РАДАР • 8.1');
 if(f==='test-demo-assistant.cjs'){
  test=test.replace("'Демо-ордера и сопровождение'","'Позиции Spot · DEMO'");
 }
 if(f==='test-v65-evidence.cjs'){
  test=test.replace("/showLegacySpotArchive&&view==='assistant'&&<div/g",
   "/showLegacySpotArchive&&view==='assistant'&&assistantSubtab==='positions'&&<div/g");
 }
 write(p,test);
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v81-assistant-layout.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.1 — Assistant UI tabs, venue-separated active DEMO positions, collapsed history\n- Inside the Assistant, Spot/Futures market selection remains, then **Позиции · DEMO** (default) and **Исследования** tabs. Futures and Spot paper ledgers are independently grouped by original Binance/Bybit venue, with WAITING/OPEN first, all CLOSED/EXPIRED/CANCELLED behind collapsed history details; individual ticket actions and event details remain intact. Existing DEMO settings and fresh scenarios stay visible on Positions.\n- All previous research UI sections are moved intact into named expandable groups: forward protocol and rolling snapshots, data quality and pause journal, hypothetical costs and results, frozen hypotheses/forward validation/shadow/mentor, native WorkManager and stability passport. Read-only Spot research evidence stays independent from the Futures cohort.\n- No changes to stored tickets, signal generation, favorite-four configuration, exchange observations, validity checkpoints, Android permissions or native background schedule. Interface only, no real trading APIs.\n');
console.log('APEX 8.1 Assistant two-tabs with source-isolated active paper positions and organized research UI installed');
