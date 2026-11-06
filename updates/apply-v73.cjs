/** APEX 7.3: explanatory offline mentor, grounded only in current research snapshots.
 * No external LLM requests, trades, strategy changes or background promises.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,where){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 7.3 '+where+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v73-research-mentor.ts','src/radar/v73-research-mentor.ts');
fs.copyFileSync('updates/test-v73-mentor.cjs','scripts/test-v73-mentor.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {createShadowVersion,restoreShadowArchive,shadowsForProtocol,compareShadowVersions,type ShadowArchive} from './radar/v72-shadow-lab';",
 "import {createShadowVersion,restoreShadowArchive,shadowsForProtocol,compareShadowVersions,type ShadowArchive} from './radar/v72-shadow-lab';\nimport {explainResearchQuestion,MENTOR_SUGGESTIONS,type MentorReply,type MentorContext} from './radar/v73-research-mentor';",
 'import evidence-only mentor');
app=rep(app,
 " const [shadowArchive,setShadowArchive]=useState<ShadowArchive>(()=>restoreShadowArchive(localStorage.getItem('apex_v72_shadow_archive'),Date.now()));",
 " const [shadowArchive,setShadowArchive]=useState<ShadowArchive>(()=>restoreShadowArchive(localStorage.getItem('apex_v72_shadow_archive'),Date.now()));\n const [mentorQuestion,setMentorQuestion]=useState('');\n const [mentorHistory,setMentorHistory]=useState<Array<{askedAt:number;question:string;reply:MentorReply}>>([]);",
 'ephemeral on-device Q&A state');
app=rep(app,
 " const shadowReport=useMemo(()=>compareShadowVersions(studyProtocol,shadowArchive,futuresLedger,now),[studyProtocol,shadowArchive,futuresLedger,now]);",
 " const shadowReport=useMemo(()=>compareShadowVersions(studyProtocol,shadowArchive,futuresLedger,now),[studyProtocol,shadowArchive,futuresLedger,now]);\n const mentorContext:MentorContext=useMemo(()=>({protocol:studyProtocol,study:forwardStudy,diagnostics:studyDiagnostics,discovery:discoveryReport,verification:forwardValidation,shadows:shadowReport}),[studyProtocol,forwardStudy,studyDiagnostics,discoveryReport,forwardValidation,shadowReport]);\n const askMentor=(question:string)=>{\n  const q=question.trim().slice(0,320);if(!q)return;\n  const askedAt=Date.now();const reply=explainResearchQuestion(q,mentorContext,askedAt);\n  setMentorHistory(old=>[...old,{askedAt,question:q,reply}].slice(-8));setMentorQuestion('');\n };",
 'mentor evidence context and local controls');
app=rep(app,read('updates/v72-shadow-lab-ui.txt'),
 read('updates/v72-shadow-lab-ui.txt')+'\n'+read('updates/v73-mentor-ui.txt'),
 'add compact mentor panel directly after shadow lab');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 7.2','РЫНОЧНЫЙ РАДАР • 7.3','display version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+f;write(path,read(path).replaceAll('РЫНОЧНЫЙ РАДАР • 7.2','РЫНОЧНЫЙ РАДАР • 7.3'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v73-mentor.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 7.3 — evidence-grounded on-device research mentor\n- A collapsible dialog lets users ask in Russian about forward DEMO observations, exclusions, hypothesis follow-ups, contradiction counts, and experimental version coverage. Six one-tap questions are included, with visible source labels for every numeric response and suggested next research questions.\n- The first iteration is explicitly **deterministic on-device explanatory logic**, not a connected cloud LLM or neural agent. It only reads coherent, same-protocol structured reports from APEX 6.6–7.2. If the protocol is missing/mismatched or the question is unsupported, the mentor declines to invent a result. Answers are time-of-question snapshots, with ephemeral dialog history (max 8, clearable) that does not touch the study archives.\n- The mentor refuses order-placement, asset-choice, leverage or execution advice. No API keys, network endpoints, model weights, market signal or DEMO ticket manipulation, automatic proof or uninterrupted background operation.\n');
console.log('APEX 7.3 local evidence-bound research mentor installed');
