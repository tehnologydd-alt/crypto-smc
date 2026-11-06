/** APEX 6.6: distinguish virtual nominal/margin and freeze an optional future-only evidence cohort. */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const count=s.split(a).length-1;if(count!==1)throw Error('APEX 6.6 '+label+' matches='+count);return s.replace(a,b);}
fs.copyFileSync('updates/v66-forward-study.ts','src/radar/v66-forward-study.ts');
fs.copyFileSync('updates/test-v66-forward-study.cjs','scripts/test-v66-forward-study.cjs');
let app=read('src/App.tsx');
app=rep(app,"import {summarizeDemoEvidence} from './radar/v65-evidence';",
 "import {summarizeDemoEvidence} from './radar/v65-evidence';\nimport {startStudyProtocol,restoreStudyProtocol,summarizeStudyProtocol,type StudyProtocol} from './radar/v66-forward-study';",
 'import');
app=rep(app,
 " const [futuresMessage,setFuturesMessage]=useState('');",
 " const [futuresMessage,setFuturesMessage]=useState('');\n const [studyProtocol,setStudyProtocol]=useState<StudyProtocol|null>(()=>restoreStudyProtocol(localStorage.getItem('apex_v66_forward_protocol'),Date.now()));",
 'state');
app=rep(app,
 " const assistantEvidence=useMemo(()=>summarizeDemoEvidence(assistantLedger,futuresLedger),[assistantLedger,futuresLedger]);",
 " const assistantEvidence=useMemo(()=>summarizeDemoEvidence(assistantLedger,futuresLedger),[assistantLedger,futuresLedger]);\n const forwardStudy=useMemo(()=>summarizeStudyProtocol(studyProtocol,futuresLedger,now),[studyProtocol,futuresLedger,now]);\n useEffect(()=>{if(!studyProtocol)return;try{localStorage.setItem('apex_v66_forward_protocol',JSON.stringify(studyProtocol));}catch{setFuturesMessage('Не удалось закрепить протокол проверки.');}},[studyProtocol]);",
 'holdout report');
app=rep(app,
 "Учебная начальная маржа: <strong className=\"text-white\">{virtualMarginUSDT(futuresSetup).toFixed(2)} USDT</strong> · виртуальный номинал {futuresNotional} USDT.",
 "Виртуальный номинал позиции: <strong className=\"text-white\">{futuresNotional} USDT</strong> · расчётная начальная маржа: <strong className=\"text-white\">{virtualMarginUSDT(futuresSetup).toFixed(2)} USDT</strong>. При изменении цены на 1% условный результат полной позиции — ±{(futuresNotional/100).toFixed(2)} USDT до издержек.",
 'clear nominal and margin');
const targetJournal='Futures DEMO · журнал';
const atJournal=app.indexOf(targetJournal);
const sectionStart=atJournal>=0?app.lastIndexOf('<section className="space-y-2">',atJournal):-1;
if(sectionStart<0||atJournal-sectionStart>300)throw Error('APEX 6.6 cannot locate futures journal section');
app=app.slice(0,sectionStart)+read('updates/v66-forward-study-ui.txt')+'\n '+app.slice(sectionStart);
app=rep(app,
 " · Номинал {o.setup.notionalUSDT} USDT</p>",
 " · Номинал позиции {o.setup.notionalUSDT} USDT · Расчётная маржа {(o.setup.notionalUSDT/o.setup.leverage).toFixed(2)} USDT</p>",
 'ticket nominal vs margin');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 6.4','РЫНОЧНЫЙ РАДАР • 6.6','header version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;let s=read(p);s=s.replaceAll('РЫНОЧНЫЙ РАДАР • 6.4','РЫНОЧНЫЙ РАДАР • 6.6');
 write(p,s);
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v66-forward-study.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 6.6: virtual nominal explanation and prospective frozen DEMO study\n- Futures shows virtual position notional separately from illustrative starting margin. A 1% price change reflects 1% of full notional before costs, with no double leverage multiplication.\n- Users can opt in to a single immutable forward-only observation cutoff; previous plans are excluded, and only future plans with unmodified creation-time context qualify. Exchanges remain separate, and ambiguous or manually terminated cases are excluded from scores.\n- No model retraining, private API access, market order placement or real-funds functionality. Not an investment outcome prediction; no fees, funding, mark-price liquidation or slippage model.\n');
console.log('APEX 6.6 virtual nominal + frozen forward-only evidence installed');
