/**
 * Deterministic zero-bundler web asset staging for the APEX 9 Android preview.
 * Run from the repository or project directory. No external requests.
 */
import {mkdirSync,rmSync,copyFileSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const preview=join(root,'apex9-preview');
const dist=join(root,'apex9-android/dist');
const mandatory=['index.html','styles.css','app.mjs','research.mjs','context-sources.mjs','update-check.mjs','mobile-bridge.mjs','candles.mjs','candle-chart.mjs','market-core.mjs','forecast-core.mjs','apex-logo.svg','favorite-dashboard.mjs','favorite-logic.mjs','liquidity-core.mjs','liquidity-dashboard.mjs','level-observer.mjs','level-dashboard.mjs','onchain-core.mjs','onchain-dashboard.mjs','onchain-market-compare.mjs','onchain-market-dashboard.mjs','evidence-lab.mjs','evidence-dashboard.mjs','validation-core.mjs','validation-dashboard.mjs','sparkline.mjs','journal-stats.mjs','research-timeline.mjs','scenario-map.mjs','scenario-replay.mjs','research-patterns.mjs','research-patterns-dashboard.mjs','research-stability.mjs','historical-repair.mjs','research-regimes.mjs','research-regimes-dashboard.mjs','regime-stability.mjs','regime-transitions.mjs','regime-holdout.mjs','cross-asset-research.mjs','cross-asset-dashboard.mjs','research-synthesis.mjs','research-synthesis-dashboard.mjs','research-explanation-brief.mjs','research-quality-route.mjs','editorial-core.mjs','editorial-dashboard.mjs'];
const shared=['v90-evidence.mjs','v90-market-depth.mjs'];
for(const name of mandatory)
 if(!existsSync(join(preview,name)))throw Error('Missing APEX 9 preview file: '+name);
for(const name of shared)
 if(!existsSync(join(root,'updates',name)))throw Error('Missing shared research core: '+name);

const checkOnly=process.argv.includes('--check');
if(!checkOnly){
 rmSync(dist,{recursive:true,force:true});
 mkdirSync(join(dist,'updates'),{recursive:true});
 for(const name of mandatory)copyFileSync(join(preview,name),join(dist,name));
 for(const name of shared)copyFileSync(join(root,'updates',name),join(dist,'updates',name));
 // Preserve original sources; rewrite only copied module paths for APK root.
 const researchFile=join(dist,'research.mjs');
 let source=readFileSync(researchFile,'utf8');
 const expected=[
  "from '../updates/v90-market-depth.mjs'",
  "from '../updates/v90-evidence.mjs'"
 ];
 for(const marker of expected){
  if(source.split(marker).length!==2)throw Error('Expected exactly one import: '+marker);
  source=source.replace(marker,marker.replace('../updates/','./updates/'));
 }
 writeFileSync(researchFile,source);
}
if(!checkOnly){
 const index=readFileSync(join(dist,'index.html'),'utf8');
 if(!index.includes('./app.mjs')||!index.includes('./styles.css'))
  throw Error('Missing local entrypoints in index.html');
 for(const filename of ['app.mjs','research.mjs','context-sources.mjs']){
  const src=readFileSync(join(dist,filename),'utf8');
  const matches=src.matchAll(/from\s+['"]((?:\.\.?\/)[^'"]+)['"]/g);
  for(const match of matches){
   const location=resolve(dirname(join(dist,filename)),match[1]);
   if(!existsSync(location))throw Error('Unresolved '+filename+' import: '+match[1]);
  }
 }
}
console.log('APEX 9 Android research assets '+(checkOnly?'source-verified':'staged')+
 ' (preview only, no assistant, no demo, no trade execution).');
