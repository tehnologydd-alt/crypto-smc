/** APEX 6.2.1: fixed-size favorite Radar rows. No data/logic changes. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
let app=read('src/App.tsx');
const r=app.indexOf("{view==='radar'&&!selectedDetail&&");
const h=app.indexOf("{view==='history'&&",r);
if(r<0||h<r)throw Error('APEX 6.2.1 Radar boundaries missing');
let radar=app.slice(r,h);
const start=radar.indexOf('{candidates.map(a=>{const known=a.price>0;');
const close='</div>;})}';
const finish=radar.indexOf(close,start);
if(start<0||finish<start||radar.indexOf(close,finish+close.length)>=0)
 throw Error('APEX 6.2.1 favorite card boundaries ambiguous');
const old=radar.slice(start,finish+close.length);
for(const required of ['<TrendLine','qualityReports[a.symbol]','toggle(a.symbol)','openDetail(a.symbol)','key={a.symbol}'])
 if(!old.includes(required))throw Error('APEX 6.2.1 original functionality missing '+required);
const replacement=read('updates/v621-fixed-favorites.txt');
if(!replacement.startsWith('{candidates.map(a=>{')||!replacement.endsWith(close))
 throw Error('APEX 6.2.1 replacement JSX malformed');
radar=radar.slice(0,start)+replacement+radar.slice(finish+close.length);
app=app.slice(0,r)+radar+app.slice(h);
if(!app.includes('РЫНОЧНЫЙ РАДАР • 6.2'))throw Error('APEX 6.2.1 version missing');
app=app.replace('РЫНОЧНЫЙ РАДАР • 6.2','РЫНОЧНЫЙ РАДАР • 6.2.1');
write('src/App.tsx',app);
fs.copyFileSync('updates/test-layout-v621.cjs','scripts/test-layout-v621.cjs');
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-layout-v621.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.2.1 fixed favorite-card geometry\n- Every Radar favorite is the same 136px high, with a fixed two-row grid and constant 112px right price column. Mini-chart occupies an explicit 92×34px slot in the lower right; no intrinsic SVG size can change the row dimensions.\n- A 16px status line is reserved even for healthy data. Dynamic quality warnings, long names and last-tick timestamps remain on a single truncated line; price changes use tabular figures without shifting neighboring elements. These protections work on narrow Android screens.\n- Original favorite-star control, chart history, quality indicator, detailed asset navigation and data refresh behavior are unchanged. Only JSX layout/presentation changed; no scenario logic, subscriptions, storage or Android permissions touched.\n');
console.log('APEX 6.2.1 stable Radar favorite card geometry installed');
