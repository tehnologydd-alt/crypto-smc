/** APEX 7.1: forward-only temporal review, isolated from demo execution and training. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.1 '+name+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v71-forward-validation.ts','src/radar/v71-forward-validation.ts');
fs.copyFileSync('updates/test-v71-forward-validation.cjs','scripts/test-v71-forward-validation.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {discoverHypotheses,freezeHypothesis,restoreHypothesisArchive,hypothesesForProtocol,type HypothesisArchive} from './radar/v70-hypothesis-discovery';",
 "import {discoverHypotheses,freezeHypothesis,restoreHypothesisArchive,hypothesesForProtocol,type HypothesisArchive} from './radar/v70-hypothesis-discovery';\nimport {evaluateFrozenHypotheses} from './radar/v71-forward-validation';",
 'read-only forward validation import');
app=rep(app,
 " const frozenStudyHypotheses=useMemo(()=>hypothesesForProtocol(hypothesisArchive,studyProtocol),[hypothesisArchive,studyProtocol]);",
 " const frozenStudyHypotheses=useMemo(()=>hypothesesForProtocol(hypothesisArchive,studyProtocol),[hypothesisArchive,studyProtocol]);\n const forwardValidation=useMemo(()=>evaluateFrozenHypotheses(studyProtocol,hypothesisArchive,futuresLedger,now),[studyProtocol,hypothesisArchive,futuresLedger,now]);",
 'forward-only memo');
app=rep(app,read('updates/v70-hypothesis-ui.txt'),
 read('updates/v70-hypothesis-ui.txt')+'\n'+read('updates/v71-forward-validation-ui.txt'),
 'show future study directly after hypothesis archive');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.0','РЫНОЧНЫЙ РАДАР • 7.1','display version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+f;write(path,read(path).replaceAll('РЫНОЧНЫЙ РАДАР • 7.0','РЫНОЧНЫЙ РАДАР • 7.1'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v71-forward-validation.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.1 — truly prospective temporal evaluation of frozen demo hypotheses\n- A research-only panel evaluates every saved 7.0 hypothesis using positions CREATED after its own frozenAt, with predecision context captured after that freeze, and documented closures that were observed by the report time. Positions created before the cutoff remain excluded even if they close later. Same venue/fixed model only; missing and gap candles, manual exits, incomplete results, unknown factors, and duplicate decision bars never inflate outcomes.\n- It separately shows stop frequencies for the pre-fixed focus vs other known factor groups, using at least 10 reviewable outcomes and three distinct UTC days in EACH group before a merely descriptive status. Verdicts describe same-direction, opposite-direction, no clear difference or still collecting. No claim of statistical proof or independent market causality. No backfill, dynamic group optimization or learned weights.\n- Existing spot and futures virtual ledgers, opt-in protocol, checkpoints and frozen hypothesis archive are not modified; report is pure and recalculates from available forward observations. No real order endpoints or secret credentials.\n');
console.log('APEX 7.1 immutable hypothesis future-cohort review installed');
