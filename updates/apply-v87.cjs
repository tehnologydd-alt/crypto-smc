/** APEX 8.7 — credential-free PUBLIC TESTNET checks + LOCAL mock order
 * lifecycle validation. No live/authorized exchange trading operations.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 8.7 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v87-testnet-lab.ts','src/radar/v87-testnet-lab.ts');
fs.copyFileSync('updates/test-v87-testnet.cjs','scripts/test-v87-testnet.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {inspectAccountSnapshot,sampleAccountSnapshot,sampleStatus,type ViewSnapshot} from './radar/v86-local-account-view';",
 "import {inspectAccountSnapshot,sampleAccountSnapshot,sampleStatus,type ViewSnapshot} from './radar/v86-local-account-view';\nimport {checkSandboxPublicClock,makeLocalSandboxOrderSequence,checkLocalSandboxLifecycle,type SandboxProbe,type SandboxEvent} from './radar/v87-testnet-lab';",
 'testnet public lab imports');
app=rep(app,
 " const [accountReadOnlySnapshots,setAccountReadOnlySnapshots]=useState<Record<'binance'|'bybit',ViewSnapshot|null>>({binance:null,bybit:null});",
 [
 " const [accountReadOnlySnapshots,setAccountReadOnlySnapshots]=useState<Record<'binance'|'bybit',ViewSnapshot|null>>({binance:null,bybit:null});",
 " // TESTNET: session-only public connection probes. No account credentials,",
 " // order POST or mutation of either DEMO ledger.",
 " const [sandboxTestnetProbes,setSandboxTestnetProbes]=useState<Record<'binance'|'bybit',SandboxProbe|null>>({binance:null,bybit:null});",
 " const [sandboxTestnetBusy,setSandboxTestnetBusy]=useState(false);",
 " const [sandboxLocalEvents,setSandboxLocalEvents]=useState<SandboxEvent[]>([]);",
 " const sandboxCheckLock=useRef(false);"
 ].join('\n'),
 'ephemeral public testnet probe state');
app=rep(app,
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);",
 [
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);",
 " const checkTestnetPublicApis=async()=>{",
 "  if(sandboxCheckLock.current)return;",
 "  sandboxCheckLock.current=true;setSandboxTestnetBusy(true);",
 "  try{",
 "   const [binance,bybit]=await Promise.all([",
 "    checkSandboxPublicClock('binance'),checkSandboxPublicClock('bybit')",
 "   ]);",
 "   setSandboxTestnetProbes({binance,bybit});",
 "  }finally{sandboxCheckLock.current=false;setSandboxTestnetBusy(false);}",
 " };"
 ].join('\n'),
 'actual public testnet server clock checks (no authorized account connection)');
app=rep(app,read('updates/v86-local-account-ui.txt'),
 read('updates/v86-local-account-ui.txt')+'\n'+read('updates/v87-testnet-ui.txt'),
 'Testnet public clock and mock order screen in research');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.6','РЫНОЧНЫЙ РАДАР • 8.7','version label');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;
 write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.6','РЫНОЧНЫЙ РАДАР • 8.7'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v87-testnet.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.7 — public Testnet status checks and isolated local order lifecycle\n- Inside Assistant > Research: explicitly trigger read-only GET checks for public TESTNET server time on **fixed, separately whitelisted** Binance demo USD-M and Bybit testnet hosts. The UI distinguishes an actual public server response from HTTP/CORS/network errors, shows measured latency and time skew. This **DOES NOT** authenticate or connect an exchange user account, submit Testnet orders or retrieve private order status, and does not require API keys.\n- A separate **local simulation** demonstrates order-event transitions NEW -> PARTIALLY_FILLED -> FILLED/CANCELLED, including validated monotonic filled percent and terminal state, explicitly marked as LOCAL_FIXTURE and NEVER treated as exchange order responses.\n- Both probes and simulation live only in React memory; no wallet, deposit, private request, real order, trade status, DEMO position or research protocol is modified or backfilled. Public servers may be blocked by CORS/region/network constraints; status is reported honestly.\n');
console.log('APEX 8.7 read-only public Testnet clock probes and local mocked order lifecycle integrated.');
