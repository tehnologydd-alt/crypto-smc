const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const app=fs.readFileSync('src/App.tsx','utf8');
const version='РЫНОЧНЫЙ РАДАР • 8.4';
assert(app.includes(version));
for(const name of [
 'DEMO-счета ·','Горизонтальные виртуальные ','Переключение виртуальных счетов',
 'Binance','Bybit','Листай','листай влево и вправо','DEMO',
 'demoWalletCarouselRef','demoWalletActiveIndex','setDemoWalletActiveIndex',
 'demoWalletAction','setDemoWalletAction','scrollIntoView','onScroll={e=>',
 'snap-x','snap-mandatory','overflow-x-auto','min-w-[88%]','snap-center',
 'Подробности счёта','+ Пополнить','− Списать','Сумма операции, USDT',
 'Подтвердить','Отмена','История операций','Как считается баланс и результат DEMO',
 'Результат DEMO до издержек','Свободная маржа','Зарезервировано',
 'Средства (баланс + плавающий результат)','Плавающий результат',
 'В ожидании / открыто','Свободно для новых DEMO-планов','Можно создать ещё:',
 'Пополнено','Списано','Внесено − списано',
 'applyDemoCashTransfer(key,action)','demoCashDrafts[key]',
 'report.realizedGrossUSDT','report.netAddedUSDT','margin.admissionFreeUSDT',
 'margin.unknownMarks','futuresCapitalRow','checkDemoMargin','checkDemoWithdrawal',
 'apex_v76_rolling_checkpoints','apex_v64_futures_demo',
 'toggleNativeFuturesBackground','Позиции Futures · DEMO','Позиции Spot · DEMO',
 'Исследования','Режимы виртуального ассистента'
])assert(app.includes(name),'APEX 8.4 missing '+name);
assert.equal((app.match(/className="min-w-\[88%\] max-w-\[88%\]/g)||[]).length,1,
 'exactly one repeated swipe card template is expected');
const cardStart=app.indexOf('return <article key={key} className="min-w-[88%]');
const panelStart=app.lastIndexOf("DEMO-счета ·",cardStart);
const panelEnd=app.indexOf('</section>}',cardStart);
assert(panelStart>0&&panelEnd>cardStart);
const section=app.slice(panelStart,panelEnd+11);
assert(section.indexOf('Подробности счёта')<section.indexOf('Средства (баланс + плавающий результат)'),
 'large advanced margin table must stay behind collapsed <details>');
assert(section.indexOf('+ Пополнить')<section.indexOf('Подробности счёта'),
 'quick account operations stay above optional details');
assert(section.includes("aria-pressed={demoWalletActiveIndex===index}"),
 'named venue navigation reflects current swipe');
assert(section.includes('transfers.slice(-20).reverse()'),
 'existing per-source transfer history remains intact');
assert(section.includes("onClick={()=>applyDemoCashTransfer(key,action)}"),
 'quick confirmation calls unchanged account balance updater');
const fullOpen=(app.match(/<details className="rounded-xl border border-slate-600\/40 bg-\[#091626\] p-2\.5">/g)||[]).length;
assert.equal(fullOpen,1,'account advanced details are off by default');
assert(!section.includes('<details open'),'all account details initially collapsed');
assert(app.includes("setDemoWalletAction(null);"),
 'confirmed account operations reset temporary input drawer');
const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0,
 ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
const source=fs.readFileSync('updates/v84-wallet-carousel-ui.txt','utf8');
assert(!/\/fapi\/v1\/order|\/v5\/order\/create|apiSecret|apiKey|openLiveOrder/.test(source));
assert(!/localStorage|setFuturesLedger|setDemoWalletBook|restoreDemoWallets|transferDemoCash\(/.test(source),
 'carousel markup must not itself modify saved simulation state');
console.log('APEX 8.4 PASS: swipe & accessible venue buttons, collapsed advanced details, preserved margin/PnL and safe account-specific +/− action form');
