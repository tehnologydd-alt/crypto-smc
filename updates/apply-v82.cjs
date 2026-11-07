/** APEX 8.2: per-venue isolated DEMO cash accounts and collapsible mode controls.
 * ALL money is virtual; previous DEMO setups and research data remain intact.
 */
const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
function rep(s,a,b,label){
 const n=s.split(a).length-1;if(n!==1)throw Error('APEX 8.2 '+label+' matches='+n);
 return s.replace(a,b);
}
function foldMode(app,title,summary){
 const marker='<h2 className="'+(title==='Режим работы'?'text-base':'text-sm')+' font-semibold text-white">'+title+'</h2>';
 const at=app.indexOf(marker);
 if(at<0||app.indexOf(marker,at+1)>=0)throw Error('APEX 8.2 missing mode section '+title);
 const begin='<section className="rounded-2xl border border-white/10 bg-[#141e30] p-3.5 space-y-3">';
 const start=app.lastIndexOf(begin,at);
 if(start<0||at-start>130)throw Error('APEX 8.2 mode section anchor missing '+title);
 const stop=app.indexOf('\n </section>',at);
 if(stop<0||stop-start>15000)throw Error('APEX 8.2 mode section end missing '+title);
 const old=app.slice(start,stop+'\n </section>'.length);
 let body=old.slice(begin.length,-'\n </section>'.length);
 body=rep(body,marker,'','remove old heading '+title);
 const newer='<details className="rounded-2xl border border-white/10 bg-[#141e30] p-3.5">'+
  '\n <summary className="cursor-pointer list-none rounded-lg px-1 py-1.5 text-sm font-semibold text-white">'+
   '<span className="flex items-center justify-between gap-2"><span>'+title+'</span>'+
   '<span className="text-[10px] font-normal text-teal-200">'+summary+' · Настроить ▾</span></span>'+
  '</summary>\n <div className="space-y-3 pt-3">'+body+'\n </div>\n</details>';
 return rep(app,old,newer,'fold '+title);
}
fs.copyFileSync('updates/v82-demo-accounts.ts','src/radar/v82-demo-accounts.ts');
fs.copyFileSync('updates/test-v82-accounts.cjs','scripts/test-v82-accounts.cjs');
let app=read('src/App.tsx');
app=rep(app,
 "import {canRetireLegacySnapshots,canInitializeRolling} from './radar/v80-migration-guard';",
 "import {canRetireLegacySnapshots,canInitializeRolling} from './radar/v80-migration-guard';\nimport {DEMO_ACCOUNT_KEY,openDemoWallets,restoreDemoWallets,reportDemoWallet,transferDemoCash,type DemoWalletBook,type DemoAccountKey,type DemoCashKind} from './radar/v82-demo-accounts';",
 'new DEMO accounting import');
app=rep(app,
 " const [futuresMessage,setFuturesMessage]=useState('');",
 [
 " const [futuresMessage,setFuturesMessage]=useState('');",
 " const [demoWalletBook,setDemoWalletBook]=useState<DemoWalletBook|null>(()=>{",
 "  const raw=localStorage.getItem(DEMO_ACCOUNT_KEY);",
 "  return raw===null?openDemoWallets(futuresLedger,Date.now()):restoreDemoWallets(raw,Date.now());",
 " });",
 " const [demoCashDrafts,setDemoCashDrafts]=useState<Record<DemoAccountKey,string>>({",
 "  'futures:binance':'100','futures:bybit':'100','spot:binance':'100','spot:bybit':'100'",
 " });",
 " const [demoCashMessage,setDemoCashMessage]=useState('');",
 " const [demoCashBusy,setDemoCashBusy]=useState(false);",
 " const demoCashLock=useRef(false);"
 ].join('\n'),
 'state initialized from existing futures ledger without retroactive profits');
const hooks=[
 " const demoWalletRows=useMemo(()=>{",
 "  if(!demoWalletBook)return [];",
 "  const keys=showLegacySpotArchive?(['spot:binance','spot:bybit'] as DemoAccountKey[]):",
 "    (['futures:binance','futures:bybit'] as DemoAccountKey[]);",
 "  return keys.map(key=>({key,report:reportDemoWallet(demoWalletBook,key,futuresLedger)}));",
 " },[demoWalletBook,showLegacySpotArchive,futuresLedger]);",
 " // First creation is persisted once. Corrupt saved wallet never overwritten.",
 " useEffect(()=>{",
 "  if(!demoWalletBook)return;",
 "  try{",
 "   const saved=localStorage.getItem(DEMO_ACCOUNT_KEY);",
 "   if(saved===null)localStorage.setItem(DEMO_ACCOUNT_KEY,JSON.stringify(demoWalletBook));",
 "  }catch{setDemoCashMessage('Не удалось создать отдельные DEMO-счета. Сохранение недоступно.');}",
 " },[demoWalletBook]);",
 " const applyDemoCashTransfer=(key:DemoAccountKey,kind:DemoCashKind)=>{",
 "  if(demoCashLock.current||!demoWalletBook)return;",
 "  demoCashLock.current=true;setDemoCashBusy(true);setDemoCashMessage('');",
 "  try{",
 "   const saved=localStorage.getItem(DEMO_ACCOUNT_KEY);",
 "   if(saved!==null){",
 "    const persisted=restoreDemoWallets(saved,Date.now());",
 "    if(!persisted||JSON.stringify(persisted)!==JSON.stringify(demoWalletBook))",
 "     throw Error('Состояние DEMO-счёта изменилось. Перезапись отменена; проверь данные устройства.');",
 "   }",
 "   const next=transferDemoCash(demoWalletBook,key,kind,demoCashDrafts[key],futuresLedger,Date.now());",
 "   const encoded=JSON.stringify(next);",
 "   localStorage.setItem(DEMO_ACCOUNT_KEY,encoded);",
 "   if(localStorage.getItem(DEMO_ACCOUNT_KEY)!==encoded)throw Error('Сохранение виртуальной операции не подтверждено.');",
 "   setDemoWalletBook(next);",
 "   setDemoCashMessage((kind==='DEPOSIT'?'Пополнение':'Списание')+' DEMO-счёта сохранено. Это не прибыль от стратегии.');",
 "   setDemoCashDrafts(prev=>({...prev,[key]:''}));",
 "  }catch(e){setDemoCashMessage('Операция не выполнена: '+String(e));}",
 "  finally{demoCashLock.current=false;setDemoCashBusy(false);}",
 " };"
].join('\n');
app=rep(app,
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);",
 " const futuresStats=useMemo(()=>futureSummary(futuresLedger),[futuresLedger]);\n"+hooks,
 'account summary and atomic local-only deposits');
const nav=read('updates/v81-assistant-nav.txt');
app=rep(app,nav,nav+'\n'+read('updates/v82-demo-wallet-ui.txt'),'insert independent accounts before panels');
app=foldMode(app,'Режимы виртуального ассистента',
 "{futuresMode==='auto'?'Авто DEMO':'Ручной'} · {futuresScope==='multi'?'Мульти':'Один актив'}");
app=foldMode(app,'Режим работы',
 "{assistantMode==='auto'?'Авто DEMO':'Ручной'} · {assistantExchange==='binance'?'Binance':'Bybit'}");
app=rep(app,'РЫНОЧНЫЙ РАДАР • 8.1','РЫНОЧНЫЙ РАДАР • 8.2','version');
write('src/App.tsx',app);
for(const f of fs.readdirSync('scripts').filter(x=>x.startsWith('test-')&&x.endsWith('.cjs'))){
 const p='scripts/'+f;write(p,read(p).replaceAll('РЫНОЧНЫЙ РАДАР • 8.1','РЫНОЧНЫЙ РАДАР • 8.2'));
}
const pkg=JSON.parse(read('package.json'));
pkg.scripts.test+=' && node scripts/test-v82-accounts.cjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
fs.appendFileSync('README.md','\n\n## APEX 8.2 — isolated DEMO cash accounts, transparent strategy gross, collapsed mode settings\n- Assistant Positions adds two fully independent virtual USDT cash books for each chosen market (Futures or Spot), one Binance and one Bybit. Each account has explicit +deposit and -withdraw buttons, strict up-to-2-decimal inputs, an immutable transaction history, and reported deposits/withdrawals/net contributions separately from any strategy result. Transfers are never presented as profit.\n- For Futures only: gross confirmed TP fractions and fully ended STOP/COMPLETED DEMO ticket results contribute to an illustrative simulated balance; uncertain manual residuals and invalid candle gaps are not falsely priced. Existing tickets at book creation freeze their already-earned gross as a baseline, and old closed tickets are excluded: NO retroactive gains. This is price-change paper accounting only: excludes fees, funding, slippage, liquidation, maintenance margin, actual fills and margin reservations. A balance can be negative after adverse hypothetical results; it is NOT an exchange account or realistic liquidation simulator.\n- Spot has no per-order USDT nominal sizing, so cash deposits/withdrawals are tracked but no imaginary Spot PnL is calculated; keep all existing Spot scenarios and outcomes unchanged. Separate Spot books avoid mixing different source/market returns.\n- Invalid/corrupt cash-book storage is displayed as an error, NEVER auto-reset. Each change is validated, saved and read back before updating UI; independent deposit/withdrawal history is durable and no legacy research, signal, favorite selection, wallet or real order API is used. Futures/Spot existing mode settings are now folded under accessible details; fresh scenarios and open paper positions remain prominent.\n');
console.log('APEX 8.2 installed: four market+venue demo cash subaccounts and folded mode settings, no live finance interfaces');
