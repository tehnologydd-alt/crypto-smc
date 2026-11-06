/** APEX 6.9: frozen predecision postmortem groups (research only, no signal modification). */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 6.9 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v69-outcome-audit.ts','src/radar/v69-outcome-audit.ts');
fs.copyFileSync('updates/test-v69-audit.cjs','scripts/test-v69-audit.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {studyCostSensitivity} from './radar/v68-cost-sensitivity';",
 "import {studyCostSensitivity} from './radar/v68-cost-sensitivity';\nimport {auditStudyOutcomes,type AuditFactor,type AuditPeriod} from './radar/v69-outcome-audit';",
 'read-only audit import');
app=rep(app,
 " const [studyProtocol,setStudyProtocol]=useState<StudyProtocol|null>(()=>restoreStudyProtocol(localStorage.getItem('apex_v66_forward_protocol'),Date.now()));",
 " const [studyProtocol,setStudyProtocol]=useState<StudyProtocol|null>(()=>restoreStudyProtocol(localStorage.getItem('apex_v66_forward_protocol'),Date.now()));\n const [auditFactor,setAuditFactor]=useState<AuditFactor>('volume');\n const [auditPeriod,setAuditPeriod]=useState<AuditPeriod>('all');",
 'local diagnostic selection');
app=rep(app,
 " const studySensitivity=useMemo(()=>studyCostSensitivity(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);",
 " const studySensitivity=useMemo(()=>studyCostSensitivity(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);\n const auditReport=useMemo(()=>auditStudyOutcomes(studyProtocol,futuresLedger,auditFactor,now),[studyProtocol,futuresLedger,auditFactor,now]);",
 'prospective outcome-only audit');
const idx=app.indexOf('Как условные комиссии меняют результат');
const start=idx>=0?app.lastIndexOf('<section className="rounded-2xl',idx):-1;
if(start<0||idx-start>300)throw Error('APEX 6.9 cannot locate fee sensitivity block');
app=app.slice(0,start)+read('updates/v69-outcome-audit-ui.txt')+'\n '+app.slice(start);
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.8','РЫНОЧНЫЙ РАДАР • 6.9','display version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+f;write(path,read(path).replaceAll('РЫНОЧНЫЙ РАДАР • 6.8','РЫНОЧНЫЙ РАДАР • 6.9'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v69-audit.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.9: predecision conditions x prospective demo outcomes\n- Collapsed read-only futures study audit explores FIXED buckets for relative predecision volume, normalized eight-bar move, direction and timeframe. Both exchanges are displayed separately, with early (first 7 days) vs later cohorts anchored to the original immutable protocol start.\n- Uses the same reviewable forward-only frozen-model cohort as the study, with no historical recreation, no missing data inference, no changes to existing demo positions, study checkpoints, signal selection or model weights. Displays every group, including no-sample and small-sample groups, without winner rankings.\n- Outputs count of positive/negative gross demo outcomes, TP1, stop/TP3 and average gross return as % of ORIGINAL position notional. This is exploratory description, not causal explanation, net profit, independence proof or a trade recommendation. No exchange orders or credentials.\n');
console.log('APEX 6.9 read-only frozen-predecision outcome audit installed');
