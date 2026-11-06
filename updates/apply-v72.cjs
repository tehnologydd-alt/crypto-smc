/** APEX 7.2 overlay — frozen read-only shadow lab; no trade engine modifications. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.2 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v72-shadow-lab.ts','src/radar/v72-shadow-lab.ts');
fs.copyFileSync('updates/test-v72-shadow-lab.cjs','scripts/test-v72-shadow-lab.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {evaluateFrozenHypotheses} from './radar/v71-forward-validation';",
 "import {evaluateFrozenHypotheses} from './radar/v71-forward-validation';\nimport {createShadowVersion,restoreShadowArchive,shadowsForProtocol,compareShadowVersions,type ShadowArchive} from './radar/v72-shadow-lab';",
 'shadow research imports');
app=rep(app,
 " const [hypothesisArchive,setHypothesisArchive]=useState<HypothesisArchive>(()=>restoreHypothesisArchive(localStorage.getItem('apex_v70_hypothesis_archive'),Date.now()));",
 " const [hypothesisArchive,setHypothesisArchive]=useState<HypothesisArchive>(()=>restoreHypothesisArchive(localStorage.getItem('apex_v70_hypothesis_archive'),Date.now()));\n const [shadowArchive,setShadowArchive]=useState<ShadowArchive>(()=>restoreShadowArchive(localStorage.getItem('apex_v72_shadow_archive'),Date.now()));",
 'isolated persisted shadow archive');
app=rep(app,
 " const forwardValidation=useMemo(()=>evaluateFrozenHypotheses(studyProtocol,hypothesisArchive,futuresLedger,now),[studyProtocol,hypothesisArchive,futuresLedger,now]);",
 " const forwardValidation=useMemo(()=>evaluateFrozenHypotheses(studyProtocol,hypothesisArchive,futuresLedger,now),[studyProtocol,hypothesisArchive,futuresLedger,now]);\n const shadowVersions=useMemo(()=>shadowsForProtocol(shadowArchive,studyProtocol),[shadowArchive,studyProtocol]);\n const shadowReport=useMemo(()=>compareShadowVersions(studyProtocol,shadowArchive,futuresLedger,now),[studyProtocol,shadowArchive,futuresLedger,now]);",
 'read-only baseline and shadow comparisons');
app=rep(app,read('updates/v71-forward-validation-ui.txt'),
 read('updates/v71-forward-validation-ui.txt')+'\n'+read('updates/v72-shadow-lab-ui.txt'),
 'add collapsed shadow model lab below independent verification');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.1','РЫНОЧНЫЙ РАДАР • 7.2','visible version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+f;write(path,read(path).replaceAll('РЫНОЧНЫЙ РАДАР • 7.1','РЫНОЧНЫЙ РАДАР • 7.2'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v72-shadow-lab.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.2 — isolated read-only shadow model research lab\n- Users may explicitly create a frozen, local shadow study version based on an existing saved 7.0 hypothesis. The rule is deterministic and pre-registered: separately observe the group with historically lower DEMO stop frequency. This labels a subset of events; it does NOT execute, cancel, filter or alter market signals or demo orders.\n- Each version captures its own start instant and deep-copy hypothesis. Results are calculated only from later CLOSED same-venue and same-model futures DEMO observations, with valid contemporaneous context and closed candles; baseline and highlighted group use identical future cohorts. Missing, gap, manually closed, duplicate, expired or pre-start records are never counted as successful evidence.\n- Side-by-side diagnostic reports show coverage, counts and hypothetical stop frequencies with at least 10 records and 3 UTC days per comparison group for DESCRIPTIVE status. No effectiveness claim or causal/statistical validation is made: counterfactual trading returns cannot be inferred from simple observed subsets.\n- Existing Spot/Futures ledgers, future-only protocol, 7.0 frozen hypothesis archive and 7.1 checks stay untouched. No connected private exchange APIs, passwords, real execution endpoints or automatic strategy changes.\n');
console.log('APEX 7.2 shadow-only DEMO research lab installed');
