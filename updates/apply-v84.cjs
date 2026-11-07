/** APEX 8.4 — presentation-only redesign of 8.3 account panel.
 * Horizontal native swipe, quick +/− action drawer and collapsed diagnostics.
 * No wallet, margin, margin gate, order, research or localStorage migration.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){const n=s.split(a).length-1;
 if(n!==1)throw Error('APEX 8.4 '+label+' matches='+n);
 return s.replace(a,b);
}
let app=read('src/App.tsx');
app=rep(app,
 " const demoCashLock=useRef(false);",
 [
 " const demoCashLock=useRef(false);",
 " const demoWalletCarouselRef=useRef<HTMLDivElement|null>(null);",
 " const [demoWalletActiveIndex,setDemoWalletActiveIndex]=useState(0);",
 " const [demoWalletAction,setDemoWalletAction]=useState<{key:DemoAccountKey;kind:DemoCashKind}|null>(null);",
 " useEffect(()=>{",
 "  setDemoWalletActiveIndex(0);",
 "  setDemoWalletAction(null);",
 "  if(demoWalletCarouselRef.current)demoWalletCarouselRef.current.scrollLeft=0;",
 " },[showLegacySpotArchive]);"
 ].join('\n'),
 'scroll state and on-demand cash action form');
app=rep(app,
 "   setDemoCashDrafts(prev=>({...prev,[key]:''}));",
 "   setDemoCashDrafts(prev=>({...prev,[key]:''}));\n   setDemoWalletAction(null);",
 'dismiss successful action panel after confirmed persisted receipt');
const previous=read('updates/v82-demo-wallet-ui.txt');
let current=rep(previous,
 "  {demoWalletRows.map(({key,report})=>{",
 "  {demoWalletRows.map(({key,report,margin})=>{",
 'reconstruct current v83 account map');
current=rep(current,
 '    <div className="grid grid-cols-3 gap-1 text-center">',
 '    {margin&&'+read('updates/v83-capital-wallet-ui.txt')+'}\n    <div className="grid grid-cols-3 gap-1 text-center">',
 'reconstruct current v83 margin detail panel');
let next=read('updates/v84-wallet-carousel-ui.txt');
next=rep(next,'__APEX83_MARGIN_DETAILS__',
 read('updates/v83-capital-wallet-ui.txt'),'preserve prior full Futures margin diagnostics');
app=rep(app,current,next,'replace dense vertical account list with swipe carousel');
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.3','РЫНОЧНЫЙ РАДАР • 8.4','visible version');
write('src/App.tsx',app);
fs.copyFileSync('updates/test-v84-carousel.cjs','scripts/test-v84-carousel.cjs');
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.3','РЫНОЧНЫЙ РАДАР • 8.4'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v84-carousel.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.4 — compact swipeable DEMO account cards\n- Replaces the long 8.3 vertical Binance/Bybit account panels with an accessible native horizontal-scroll, CSS scroll-snapped carousel. Users can swipe or select Binance/Bybit navigation tabs/dots; adjacent card peeks on mobile to make sideways scrolling discoverable. Market-specific account selection resets to the first card on Spot/Futures change, not the data.\n- Each card prominently displays total virtual balance, conservative free Futures margin and source-specific gross paper result. Existing plus/minus buttons open a small inline account-specific cash form; clicking confirm still invokes the EXACT existing validated deposit/withdrawal persistence routine. Form closes only after a successfully persisted operation. Each account has individually collapsed details preserving ALL of APEX 8.3 equity, reserved/pending/open, floating mark, capacity, receipt flow and event counts. Background notes folded.\n- This release does not change wallets, sums, orders, model, automatic admission, strategy PnL, screenshots, native WorkManager, exchange sources or checkpoint history. No private trading or financial transaction APIs.\n');
console.log('APEX 8.4 compact independent swipe accounts applied without changes to ledger or virtual margin engine');
