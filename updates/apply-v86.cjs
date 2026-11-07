/** APEX 8.6 — local and read-only exchange account view, no account API.
 * This preserves all existing DEMO exchange logic and portfolio records.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;if(n!==1)throw Error('APEX 8.6 '+label+' matches='+n);return s.replace(a,b);}
fs.copyFileSync('updates/v86-local-account-view.ts','src/radar/v86-local-account-view.ts');
fs.copyFileSync('updates/test-v86-snapshot.cjs','scripts/test-v86-snapshot.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {venueSocketKeys,publicSocketEndpoint,bybitSubscriptionArgs,decodePublicClosedSocketMessage,addSocketObservation,socketAgeState,streamKeyValid,type PublicVenueStatus,type PublicStreamObservation} from './radar/v85-public-stream';",
 "import {venueSocketKeys,publicSocketEndpoint,bybitSubscriptionArgs,decodePublicClosedSocketMessage,addSocketObservation,socketAgeState,streamKeyValid,type PublicVenueStatus,type PublicStreamObservation} from './radar/v85-public-stream';\nimport {inspectAccountSnapshot,sampleAccountSnapshot,sampleStatus,type ViewSnapshot} from './radar/v86-local-account-view';",
 'read-only snapshot imports');
app=rep(app,
 " const [publicSocketObservations,setPublicSocketObservations]=useState<Record<string,PublicStreamObservation>>({});",
 [
 " const [publicSocketObservations,setPublicSocketObservations]=useState<Record<string,PublicStreamObservation>>({});",
 " // Session-only, explicit anonymized snapshot. Never saved, authenticated or",
 " // passed to paper position sizing, execution, balances, or research stats.",
 " const [accountSnapshotDraft,setAccountSnapshotDraft]=useState('');",
 " const [accountSnapshotMessage,setAccountSnapshotMessage]=useState('');",
 " const [accountReadOnlySnapshots,setAccountReadOnlySnapshots]=useState<Record<'binance'|'bybit',ViewSnapshot|null>>({binance:null,bybit:null});"
 ].join('\n'),
 'volatile separate read-only local account-inspection state');
app=rep(app,
 read('updates/v85-public-stream-ui.txt'),
 read('updates/v85-public-stream-ui.txt')+'\n'+read('updates/v86-local-account-ui.txt'),
 'render strictly read-only local snapshot panel inside research');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.5','РЫНОЧНЫЙ РАДАР • 8.6','release label');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.5','РЫНОЧНЫЙ РАДАР • 8.6'));
}
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-v86-snapshot.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.6 — isolated anonymized account-view research prototype\n- **NOT a real account connector**: we deliberately do not connect to private Binance/Bybit endpoints, handle trading-account keys, wallet transfers, leverage orders or authenticate a user. The user can locally inspect a prepared anonymous balance JSON fixture of up to 12 assets per venue with strict fields venue/asOf/balances, no account identifiers or credentials. The sample button creates mock data. Never suggest these snapshots are live exchange balances.\n- Snapshot state is volatile React memory only, with explicit clear. No backend, network request, clipboard, account login or localStorage persistence of balances and no impact on paper balances, Futures positions, equity, margin, PnL or research scores. Validation rejects extra fields including API keys/account ids; display includes time and stale status, separate per venue.\n- APEX 8.5 public REST/WebSocket market observations, Android background research and all DEMO controls are unchanged. This creates a safe account UI/testing seam without implementing live financial execution or adult-only exchange account access.\n');
console.log('APEX 8.6 isolated local account snapshot inspection added; no private APIs or real execution');
