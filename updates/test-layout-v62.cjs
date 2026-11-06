const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const s=fs.readFileSync('src/App.tsx','utf8'),css=fs.readFileSync('src/index.css','utf8');
for(const x of ['РЫНОЧНЫЙ РАДАР • 6.2','apex-aura-radar','apex-aura-signals','Market Pulse · моё избранное','Избранные пары','Демо-журнал','APEXSwitch','aria-checked={enabled}','role="switch"','apex-stage-track','entryRecorded','finished','Скопировать','Guardian'])
 assert(s.includes(x),'Missing UI/control '+x);
assert(s.includes('onToggle={()=>void toggleNotifications()}'),'preserve global alerts handler');
assert(s.includes('onToggle={()=>void toggleBackground()}'),'preserve Android scheduler handler');
assert(s.includes('onToggle={()=>setKeepScreenOn(v=>!v)}'),'preserve screen-on handler');
assert(s.includes('onChange={e=>setStagePrefs(p=>({...p,[k]:e.target.checked}))}'),'preserve stage notification state');
assert(s.includes("scenario.status==='STOP'"),'no fabricated entry for expired scenario');
assert(s.includes("scenario.status!=='PENDING'&&scenario.status!=='ACTIVE'"),'use genuine lifecycle status');
for(const key of ['apex_v2_favorites','apex_v28_demo_journal','apex_v30_learning','apex_v44_core_research','apex_v53_core_memory'])
 assert(s.includes(key),'storage lost '+key);
assert(css.includes('.apex-switch')&&css.includes('prefers-reduced-motion'),'accessible switch visual styling');
assert(css.includes('.apex-aura-radar')&&css.includes('.apex-aura-signals'),'distinct color systems');
assert.equal((s.match(/<APEXSwitch /g)||[]).length,3,'three general settings switches');
assert.equal((s.match(/apex-stage-switch peer sr-only/g)||[]).length,1,'repeated stage switch template');
const parsed=ts.createSourceFile('App.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
for(const f of ['src/radar/learning.ts','src/radar/notify.ts','src/radar/engine.ts'])
 assert(!fs.readFileSync(f,'utf8').includes('APEXSwitch'),'logic not modified by UI');
console.log('APEX 6.2 premium multicolor and settings switches PASS: semantic status, lifecycle truth, existing preferences, TSX valid');
