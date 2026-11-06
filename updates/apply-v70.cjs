/** APEX 7.0: research ideas only. The preceding frozen model and Spot/Futures demo ledgers remain untouched. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.0 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v70-hypothesis-discovery.ts','src/radar/v70-hypothesis-discovery.ts');
fs.copyFileSync('updates/test-v70-hypotheses.cjs','scripts/test-v70-hypotheses.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {auditStudyOutcomes,type AuditFactor,type AuditPeriod} from './radar/v69-outcome-audit';",
 "import {auditStudyOutcomes,type AuditFactor,type AuditPeriod} from './radar/v69-outcome-audit';\nimport {discoverHypotheses,freezeHypothesis,restoreHypothesisArchive,hypothesesForProtocol,type HypothesisArchive} from './radar/v70-hypothesis-discovery';",
 'pure hypothesis import');
app=rep(app,
 " const [auditFactor,setAuditFactor]=useState<AuditFactor>('volume');",
 " const [hypothesisArchive,setHypothesisArchive]=useState<HypothesisArchive>(()=>restoreHypothesisArchive(localStorage.getItem('apex_v70_hypothesis_archive'),Date.now()));\n const [auditFactor,setAuditFactor]=useState<AuditFactor>('volume');",
 'freeze-only local hypothesis state');
app=rep(app,
 " const auditReport=useMemo(()=>auditStudyOutcomes(studyProtocol,futuresLedger,auditFactor,now),[studyProtocol,futuresLedger,auditFactor,now]);",
 " const auditReport=useMemo(()=>auditStudyOutcomes(studyProtocol,futuresLedger,auditFactor,now),[studyProtocol,futuresLedger,auditFactor,now]);\n const discoveryReport=useMemo(()=>discoverHypotheses(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);\n const frozenStudyHypotheses=useMemo(()=>hypothesesForProtocol(hypothesisArchive,studyProtocol),[hypothesisArchive,studyProtocol]);",
 'forward-only deterministic hypotheses');
app=rep(app,read('updates/v69-outcome-audit-ui.txt'),
 read('updates/v70-hypothesis-ui.txt')+'\n'+read('updates/v69-outcome-audit-ui.txt'),
 'hypothesis panel before outcome audit');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.9','РЫНОЧНЫЙ РАДАР • 7.0','visible version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 6.9','РЫНОЧНЫЙ РАДАР • 7.0'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v70-hypotheses.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.0 — research-only DEMO hypothesis discovery\n- Fixed upfront eight source-separated comparisons (four predecision factors per venue: high relative volume, strong normalized impulse, LONG, M5). Candidate threshold: five completed forward-demo outcomes in both factor and comparator across two days each, ten percentage-point difference in virtual stop frequency. No tuning, backfill or label leakage: only already-CLOSED records with closedAt <= capture time.\n- Explicit user action freezes a single candidate with its discovery timestamp, original sample and contrast. Future findings cannot revise it, duplicate identity is refused, local immutable archive capped at 16. All previous protocols, Spot/Futures ledgers and study checkpoints remain unaltered.\n- Candidate generation is exploratory and descriptive, not statistically sufficient, causal or actionable. Independent future-only validation is planned separately for 7.1 and is NOT claimed here. No order placement, trading permissions or auto model learning.\n');
console.log('APEX 7.0 forward-only hypothesis generator installed');
