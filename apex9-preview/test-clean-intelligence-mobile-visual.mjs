/**
 * APEX 9 Concept 1 — mobile browser smoke & visual capture.
 *
 * Playwright only runs in dedicated CI, NEVER ships to Android.
 * External network requests are blocked; screenshots show actual offline/
 * unavailable states and do not contain fabricated prices or scenarios.
 *
 * Usage: npm install --no-save --no-package-lock playwright@1.56.1
 *        npx playwright install chromium
 *        node apex9-preview/test-clean-intelligence-mobile-visual.mjs
 */
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const artifact=resolve(root,'apex9-visual-artifacts');
mkdirSync(artifact,{recursive:true});
const types={
 '.html':'text/html; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8',
 '.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8',
 '.svg':'image/svg+xml',
 '.json':'application/json',
 '.png':'image/png',
 '.webp':'image/webp',
 '.ico':'image/x-icon',
 '.woff2':'font/woff2'
};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 const full=resolve(root,'.'+decodeURIComponent(path));
 if(!(full===root||full.startsWith(root+sep))||!existsSync(full)){
  res.writeHead(404);res.end('Not found');return;
 }
 try{
  const body=readFileSync(full);
  res.writeHead(200,{'Content-Type':types[extname(full)]||'application/octet-stream',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(body);
 }catch{
  res.writeHead(404);res.end('Not found');
 }
});
const fail=[];
const shots=[];
const requireCondition=(condition,message)=>{
 if(!condition)fail.push(message);
};
const wait=ms=>new Promise(done=>setTimeout(done,ms));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [360,412]){
  const context=await browser.newContext({
   viewport:{width,height:820},deviceScaleFactor:1,
   isMobile:true,hasTouch:true,reducedMotion:'reduce'
  });
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort('blockedbyclient');
   return route.continue();
  });
  const page=await context.newPage();
  const exceptions=[];
  page.on('pageerror',error=>exceptions.push(error.message));
  await page.goto(origin+'/apex9-preview/index.html',{
   waitUntil:'domcontentloaded',timeout:30000
  });
  await page.locator('#ci6-command-center').waitFor({
   state:'attached',timeout:18000
  });
  const preview=async(name,selector)=>{
   const loc=page.locator(selector);
   await loc.waitFor({state:'visible',timeout:10000});
   // Short delay for the source-backed DOM projections. The app is offline,
   // which is exactly the state these views must communicate clearly.
   await wait(140);
   const geometry=await page.evaluate(()=>({
    vw:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth
   }));
   requireCondition(geometry.scrollWidth<=geometry.vw+3,
    width+'px '+name+': document overflow '+JSON.stringify(geometry));
   const target=artifact+'/'+width+'-'+name+'.png';
   await page.screenshot({path:target,fullPage:true,
    animations:'disabled'});
   shots.push(width+'-'+name+'.png');
  };
  await preview('overview','#ci6-command-center');
  await page.locator('[data-tab="forecasts"]').click();
  await preview('scenarios','#ci6-stage-board');
  requireCondition(await page.locator('#ci6-stage-board button[data-journal-stage]').count()===4,
   width+'px: missing actual Room stage buttons');
  requireCondition(await page.evaluate(()=>{
   const board=document.getElementById('ci6-stage-board');
   const view=document.getElementById('view-forecasts');
   const workspace=view?.querySelector('.forecast-workspace');
   return board?.parentElement===view && board?.nextElementSibling===workspace;
  }),width+'px: stageboard may be hidden by the archive');
  await page.locator('[data-journal-stage="ACTIVE"]').click();
  requireCondition(await page.locator('[data-journal-stage="ACTIVE"]').getAttribute('aria-pressed')==='true',
   width+'px: ACTIVE stage selection not working');
  await page.locator('[data-tab="radar"]').click();
  await preview('radar','#ci6-radar-workspace');
  await page.locator('.ci6-radar-advanced summary').click();
  requireCondition(await page.locator('[data-radar-frame="1h"]').isVisible(),
   width+'px: radar timeframe drawer did not open');
  await page.locator('[data-tab="quality"]').click();
  await preview('research','#ci-research-landing');
  await page.locator('#view-quality .quality-sources-link').click();
  await preview('sources','#ci7-sources-desk');
  await page.locator('[data-tab="overview"]').click();
  await page.locator('#view-overview [data-go="news"]').first().click();
  await preview('news','#ci8-news-hero');
  await page.locator('.ci8-filter-button').filter({hasText:'Архив'}).click();
  requireCondition(await page.locator('.ci8-filter-button').filter({hasText:'Архив'}).getAttribute('aria-pressed')==='true',
   width+'px: news archive filter did not change state');
  await page.locator('[data-tab="overview"]').click();
  await page.locator('#view-overview [data-go="macro"]').first().click();
  await preview('macro','#ci8-macro-hero');
  await page.locator('[data-go="catalog"]').first().click();
  await page.locator('#asset-input').fill('BTCUSDT');
  await page.locator('#search-form #search-button').click();
  await preview('asset-chart','#ci7-asset-desk');
  await page.locator('[data-asset-area-button="data"]').click();
  await preview('asset-data','#ci7-data-overview');
  await page.locator('#apex-settings-open').click();
  await preview('settings','#ci8-settings-nav');
  requireCondition(await page.locator('#apex-settings-dialog .ci8-settings-section').count()===4,
   width+'px: native settings controls not regrouped into four categories');
  await page.locator('#ci9-interface-audit summary').click();
  requireCondition(await page.locator('#ci9-interface-audit .ci9-audit-status').innerText()!=='Диагностика не запущена',
   width+'px: UI audit did not refresh on demand');
  requireCondition(!exceptions.length,
   width+'px: unexpected JavaScript exceptions: '+exceptions.slice(0,5).join(' | '));
  await context.close();
 }
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
const report={
 status:fail.length?'FAILED':'PASSED',
 viewports:[360,412],
 captured:shots,
 errors:fail,
 note:'No market simulation. External providers blocked in browser smoke; APK integration and live data require device validation.'
};
writeFileSync(artifact+'/report.json',JSON.stringify(report,null,2));
writeFileSync(artifact+'/README.txt',
 'APEX Concept 1 mobile viewport smoke.\nOffline screenshots only: no synthetic asset prices, news or forecasts.\n'+
 'Real Android/Room/WebSocket behavior requires verification on a device.\n'+
 'See report.json for layout/navigation checks.\n');
console.log(JSON.stringify(report,null,2));
if(fail.length)process.exitCode=1;
