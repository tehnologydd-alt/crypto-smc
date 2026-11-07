/** Rebuild the legacy APEX 8.7 baseline in exact order; fail closed on gaps.
 * Only run after the V2 source and 2.3 archive are extracted.
 * Never silently publish an older APK as 8.7.
 */
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const dir=path.join(process.cwd(),'updates');
const run=(name)=>{
  console.log('[APEX rebuild] applying '+name);
  const result=cp.spawnSync(process.execPath,[path.join(dir,name)],{stdio:'inherit',cwd:process.cwd()});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('APEX rebuild stopped at '+name+' (exit '+result.status+')');
};
if(!fs.existsSync('src/App.tsx'))throw Error('Restore source before applying updates');
if(!fs.existsSync(path.join(dir,'apply-watch.cjs')))throw Error('Missing 2.5 overlay');
run('apply-watch.cjs');
const found=fs.readdirSync(dir)
  .filter(name=>/^apply-v\d+\.cjs$/.test(name))
  .map(name=>({name,version:Number(name.match(/^apply-v(\d+)\.cjs$/)[1])}))
  .filter(x=>x.version>=26&&x.version<=87)
  .sort((a,b)=>a.version-b.version);
const foundVersions=new Set(found.map(x=>x.version));
// The 2.7 overlay is absent in the checked-in branch. We cannot infer or
// synthesize its effects from 2.8, which explicitly requires a 2.7 source.
if(!foundVersions.has(27)){
  throw Error('APEX 2.7 source patch missing: 2.8 requires 2.7. Restore an authentic 2.7 overlay or a verified 2.7 source snapshot before building 8.7.');
}
for(const x of found)run(x.name);
const app=fs.readFileSync('src/App.tsx','utf8');
if(!app.includes('РЫНОЧНЫЙ РАДАР • 8.7'))throw Error('APEX rebuild did not reach 8.7');
if(!fs.existsSync('src/radar/v87-testnet-lab.ts'))throw Error('Missing final 8.7 source');
if(!fs.existsSync('scripts/test-v87-testnet.cjs'))throw Error('Missing final 8.7 regression test');
console.log('[APEX rebuild] baseline 8.7 verified');
