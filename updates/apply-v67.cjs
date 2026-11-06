/** APEX 6.7: visible continuing study status, exclusion diagnostics and immutable user checkpoints. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,name){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('APEX 6.7 '+name+' matches='+n);
 return s.replace(a,b);
}
for(const file of ['v67-study-diagnostics.ts','v67-checkpoints.ts'])fs.copyFileSync('updates/'+file,'src/radar/'+file);
fs.copyFileSync('updates/test-v67-study.cjs','scripts/test-v67-study.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {startStudyProtocol,restoreStudyProtocol,summarizeStudyProtocol,type StudyProtocol} from './radar/v66-forward-study';",
 "import {startStudyProtocol,restoreStudyProtocol,summarizeStudyProtocol,type StudyProtocol} from './radar/v66-forward-study';\nimport {explainFutureStudy} from './radar/v67-study-diagnostics';\nimport {restoreStudyCheckpoints,saveStudyCheckpoint,checkpointsForProtocol,type CheckpointArchive} from './radar/v67-checkpoints';",
 'imports');
app=rep(app,
 " const [studyProtocol,setStudyProtocol]=useState<StudyProtocol|null>(()=>restoreStudyProtocol(localStorage.getItem('apex_v66_forward_protocol'),Date.now()));",
 " const [studyProtocol,setStudyProtocol]=useState<StudyProtocol|null>(()=>restoreStudyProtocol(localStorage.getItem('apex_v66_forward_protocol'),Date.now()));\n const [studyCheckpointArchive,setStudyCheckpointArchive]=useState<CheckpointArchive>(()=>restoreStudyCheckpoints(localStorage.getItem('apex_v67_study_checkpoints'),Date.now()));",
 'persisted checkpoint state');
app=rep(app,
 " const forwardStudy=useMemo(()=>summarizeStudyProtocol(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);",
 " const forwardStudy=useMemo(()=>summarizeStudyProtocol(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);\n const studyDiagnostics=useMemo(()=>explainFutureStudy(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);\n const studySnapshots=useMemo(()=>checkpointsForProtocol(studyCheckpointArchive,studyProtocol),[studyCheckpointArchive,studyProtocol]);",
 'study observability');
app=rep(app,read('updates/v66-forward-study-ui.txt'),read('updates/v67-study-center-ui.txt'),'replace old study panel');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.6','РЫНОЧНЫЙ РАДАР • 6.7','version');
write('src/App.tsx',app);
for(const file of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const path='scripts/'+file;
 let s=read(path);
 s=s.replaceAll('РЫНОЧНЫЙ РАДАР • 6.6','РЫНОЧНЫЙ РАДАР • 6.7');
 write(path,s);
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v67-study.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.7: visible forward-study center and optional manual checkpoints\n- Once started, the immutable APEX 6.6 Futures DEMO forward-only protocol remains active; the original start button is replaced by a persistent ACTIVE label and started timestamp. The user does not need to restart it.\n- The panel breaks down Binance and Bybit separately and explains exactly why records are excluded, ongoing, ambiguous, or reviewable. This is one protocol across two exchange data sources, not simultaneous always-on scanning, and no cross-venue order copying.\n- A manual Save checkpoint stores a timestamped immutable local snapshot (up to 64, no reset) of both exchanges under the existing protocol ID. Snapshots are not model retraining, cannot create old trade history, and are never counted as trades. Spot remains isolated.\n- Read-only public markets and simulated futures only; no private exchange APIs, account changes, real orders, claims of demonstrated profitability or promised uninterrupted background operation.\n');
console.log('APEX 6.7 independent study dashboard and immutable checkpoint snapshots installed');
