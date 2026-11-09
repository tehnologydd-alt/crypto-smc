import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {moduleImports,verifyWebModuleGraph} from './verify-web-modules.mjs';

function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'apex9-esm-'));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
}
test('extracts nested static imports, re-exports and dynamic literals',()=>{
 assert.deepEqual(moduleImports([
  "import {x} from './favorites.mjs';",
  "export {y} from '../updates/shared.mjs';",
  "import './side-effect.mjs';",
  "import('./lazy.mjs');",
  "import {z} from 'node:fs';"
 ].join('\n')),[
  './favorites.mjs','../updates/shared.mjs',
  './side-effect.mjs','./lazy.mjs'
 ]);
});
test('missing nested favorite card prevents Android packaging',()=>{
 fixture(dir=>{
  writeFileSync(join(dir,'app.mjs'),"import './favorite-dashboard.mjs';");
  writeFileSync(join(dir,'favorite-dashboard.mjs'),
   "import {directionalForecastCard} from './forecast-directional-card.mjs';");
  assert.throws(()=>verifyWebModuleGraph(dir),
   /Missing WebView module: favorite-dashboard\.mjs → \.\/forecast-directional-card\.mjs/);
  writeFileSync(join(dir,'forecast-directional-card.mjs'),
   "export const directionalForecastCard = ()=>{};");
  assert.deepEqual(verifyWebModuleGraph(dir),{state:'VERIFIED',modules:3});
 });
});
test('module imports cannot escape the signed WebView distribution',()=>{
 fixture(dir=>{
  mkdirSync(join(dir,'inside'));
  writeFileSync(join(dir,'app.mjs'),"import './inside/bad.mjs';");
  writeFileSync(join(dir,'inside/bad.mjs'),"export {x} from '../../private.mjs';");
  assert.throws(()=>verifyWebModuleGraph(dir),/escapes Android assets/);
 });
});
test('Android asset manifest includes the formerly missing directional module',()=>{
 const script=readFileSync(new URL('./prepare-web.mjs',import.meta.url),'utf8');
 assert.ok(script.includes("'forecast-directional-card.mjs'"));
 assert.ok(script.includes('verifyWebModuleGraph(dist,'));
 assert.ok(script.includes('graph.modules'));
});
