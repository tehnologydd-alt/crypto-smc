/**
 * Deterministic zero-bundler web asset staging for the APEX 9 Android preview.
 * Run from the repository or project directory. No external requests.
 */
import {mkdirSync,rmSync,copyFileSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyWebModuleGraph} from './verify-web-modules.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const preview=join(root,'apex9-preview');
const dist=join(root,'apex9-android/dist');
const mandatory=['index.html','styles.css','app.mjs','research.mjs','context-sources.mjs','news-source-fusion.mjs','public-rss-client.mjs','personal-news-client.mjs','personal-news-controls.mjs','news-evidence.mjs','news-research-analysis.mjs','asset-news-context.mjs','news-m5-reaction.mjs','news-m5-baseline.mjs','news-m5-budget.mjs','news-m5-panel.mjs','news-coverage.mjs','source-health.mjs','research-layer-core.mjs','research-layer-budget.mjs','research-layer-dashboard.mjs','live-news-collection.mjs','source-reconciliation.mjs','cmc-keyless.mjs','news-gateway-client.mjs','update-check.mjs','mobile-bridge.mjs','candles.mjs','candle-chart.mjs','market-core.mjs','forecast-core.mjs','research-level-sequence.mjs','forecast-card-ux.mjs','directional-scenario.mjs','forecast-directional-card.mjs','forecast-multiframe.mjs','forecast-evidence-context.mjs','forecast-feature-holdout.mjs','forecast-feature-stability.mjs','forecast-shadow-forward.mjs','forecast-shadow-monitor.mjs','forecast-shadow-explanation.mjs','forecast-probability-readiness.mjs','forecast-preoutcome-strength.mjs','forecast-feature-ablation.mjs','forecast-feature-rolling.mjs','forecast-shadow-challengers.mjs','forecast-shadow-regimes.mjs','forecast-data-quality-hub.mjs','forecast-quality-diagnostics.mjs','forecast-feature-pairs.mjs','forecast-probability-dashboard.mjs','forecast-feature-dashboard.mjs','scenario-journal-state.mjs','market-overview.mjs','overview-cache.mjs','overview-research-progress.mjs','overview-decision-quality.mjs','market-matrix-cache.mjs','radar-core.mjs','radar-auto-policy.mjs','radar-display-cache.mjs','radar-dashboard.mjs','radar-changes.mjs','favorite-radar.mjs','favorite-gesture.mjs','apex-logo.svg','asset-logo.mjs','asset-favorites-picker.mjs','favorite-ticker.mjs','favorite-dashboard.mjs','favorite-logic.mjs','liquidity-core.mjs','liquidity-dashboard.mjs','level-observer.mjs','level-dashboard.mjs','onchain-core.mjs','onchain-chain-head.mjs','onchain-dashboard.mjs','onchain-market-compare.mjs','onchain-market-dashboard.mjs','evidence-lab.mjs','evidence-dashboard.mjs','validation-core.mjs','validation-dashboard.mjs','sparkline.mjs','journal-stats.mjs','forecast-quality.mjs','scenario-condition-compare.mjs','forecast-event-timeline.mjs','research-timeline.mjs','scenario-map.mjs','scenario-replay.mjs','research-patterns.mjs','research-patterns-dashboard.mjs','research-stability.mjs','historical-repair.mjs','research-regimes.mjs','research-regimes-dashboard.mjs','regime-stability.mjs','regime-transitions.mjs','regime-holdout.mjs','cross-asset-research.mjs','cross-asset-dashboard.mjs','research-synthesis.mjs','research-synthesis-dashboard.mjs','research-explanation-brief.mjs','research-quality-route.mjs','research-workspace.mjs','editorial-core.mjs','editorial-budget.mjs','provider-scheduler.mjs','macro-calendar.mjs','macro-indicators.mjs','macro-event-reaction.mjs','macro-event-comparison.mjs','event-comparison-history.mjs','market-event-router.mjs','social-public.mjs','discussion-evidence.mjs','free-source-budget.mjs','free-source-adapters.mjs','free-source-dashboard.mjs','event-history.mjs','asset-quality.mjs','editorial-dashboard.mjs'];
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
 // Verify the complete transitive ESM import graph. An APK can compile while
 // WebView stays blank if even one nested JavaScript dependency is omitted.
 const graph=verifyWebModuleGraph(dist,{entry:'app.mjs'});
 console.log('APEX WebView module graph verified: '+graph.modules+' modules');
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
