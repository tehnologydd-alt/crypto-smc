/** APEX 2.9: integrate Guardian into the 2.8 group card without changing trading state. */
const fs=require('node:fs');
const file='src/App.tsx';
let app=fs.readFileSync(file,'utf8');
function replaceOnce(before,after,label){
 if(!app.includes(before))throw Error('APEX 2.9 patch missing '+label);
 app=app.replace(before,after);
}
app="import {evaluatePassport} from './radar/guardian';\n"+app;
const declaration=/function (ScenarioGroupCard|GroupCard)\(\{group,now,onDemo,savedIds\}:\{([^}]+)\}\)\{/;
const actual=app.match(declaration);
if(!actual)throw Error('APEX 2.9 group component declaration not found');
const componentName=actual[1];
app=app.replace(declaration,(_,name,props)=>'function '+name+'({group,now,onDemo,savedIds,asset}:{'+props+';asset?:AssetState}){');
console.log('APEX 2.9 group:',componentName,'lead:',app.match(/const lead=[^\n]+/)?.[0]||'none');
const leadLine="const lead=group.scenarios[0];";
replaceOnce(leadLine,leadLine+"\n const passport=evaluatePassport(lead,asset?{price:asset.price,lastTick:asset.lastTick,signals:asset.signals,volumeRatio:asset.volumeRatio}:null,now);",'Guardian evaluation');
const start="<ScenarioCard scenario={lead} now={now} onDemo={onDemo}";
const ui=fs.readFileSync('updates/v29-passport.txt','utf8');
replaceOnce(start,ui+start,'Passport UI');
if(!app.includes('<'+componentName+' group={g} now={now}'))throw Error('APEX 2.9 group use not found');
app=app.replaceAll('<'+componentName+' group={g} now={now}/>', '<'+componentName+' group={g} now={now} asset={assets[g.symbol]}/>');
app=app.replaceAll('savedIds={savedDemoIds}/>', 'savedIds={savedDemoIds} asset={assets[g.symbol]}/>');
replaceOnce('РЫНОЧНЫЙ РАДАР • 2.8','РЫНОЧНЫЙ РАДАР • 2.9','version');
fs.writeFileSync(file,app);
fs.copyFileSync('updates/guardian.ts','src/radar/guardian.ts');
fs.copyFileSync('updates/test-guardian.cjs','scripts/test-guardian.cjs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts.test += ' && node scripts/test-guardian.cjs';
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('APEX 2.9 Guardian passport applied');
