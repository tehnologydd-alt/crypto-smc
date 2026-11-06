const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const app=fs.readFileSync('src/App.tsx','utf8');
const begin=app.indexOf("{view==='radar'&&!selectedDetail&&"),end=app.indexOf("{view==='history'&&",begin);
assert(begin>=0&&end>begin,'Radar is available');
const radar=app.slice(begin,end);
const start=radar.indexOf('{candidates.map(a=>{');
const stop=radar.indexOf('</div>;})}',start);
assert(start>=0&&stop>start,'favorite loop is present');
const card=radar.slice(start,stop+11);
for(const x of ['h-[136px]','w-full min-w-0 overflow-hidden','grid h-[65px]','grid-cols-[24px_minmax(0,1fr)_112px]',
 'w-[112px]','tabular-nums','truncate whitespace-nowrap','grid h-[35px]','grid-cols-[minmax(0,1fr)_92px]',
 'h-[34px] w-[92px]','h-4 min-w-0','quality&&quality.level!==\'ok\'',":'\\u00a0'",'key={a.symbol}',
 'onClick={()=>openDetail(a.symbol)}','toggle(a.symbol)','<TrendLine data={points.length>1?points:[0,1]} up={up}/>',
 'aria-label={"Открыть подробности "+a.symbol}'])
 assert(card.includes(x),'Missing stabilized geometry/interaction: '+x);
assert(!card.includes('mt-2 text-[10px] text-teal-300'),'quality status cannot alter overall layout');
assert(!card.includes('FRAMES.some'),'no conditional content creating height jumps');
const parsed=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
for(const key of ['apex_v2_favorites','apex_v28_demo_journal','apex_v53_core_memory','apex_v54_replication'])
 assert(app.includes(key),'no existing stored records lost '+key);
assert(app.includes('РЫНОЧНЫЙ РАДАР • 6.2.1'));
console.log('APEX 6.2.1 radar fixed-card test PASS: constant 136px height, fixed chart and price slots, reserved status row, stable keys and original interactions');
