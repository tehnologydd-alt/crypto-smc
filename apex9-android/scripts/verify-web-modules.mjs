/**
 * Validate the full transitive static ES module graph that Android WebView
 * loads from the file://-served Capacitor assets. Tests only direct, literal
 * relative imports/exports/dynamic imports: missing files are fatal, never
 * left to fail invisibly after Gradle successfully assembles an APK.
 */
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,extname} from 'node:path';

const fromExpression=/\bfrom\s*['"]([.]{1,2}\/[^'"\n]+)['"]/g;
const bareImport=/\bimport\s*['"]([.]{1,2}\/[^'"\n]+)['"]/g;
const dynamicImport=/\bimport\s*\(\s*['"]([.]{1,2}\/[^'"\n]+)['"]\s*\)/g;
export function moduleImports(source){
 const found=new Set();
 for(const expression of [fromExpression,bareImport,dynamicImport]){
  expression.lastIndex=0;
  for(const match of source.matchAll(expression))found.add(match[1]);
 }
 return [...found];
}
export function verifyWebModuleGraph(root,{entry='app.mjs'}={}){
 const base=realpathSync(root);
 const visited=new Set(),active=[resolve(base,entry)];
 while(active.length){
  const file=active.pop();
  const rel=relative(base,file);
  if(rel.startsWith('..')||rel.startsWith('/')||file===base)
   throw Error('Unsafe WebView module path: '+file);
  if(!existsSync(file)||!file.endsWith('.mjs'))
   throw Error('Missing WebView module: '+rel);
  if(visited.has(file))continue;
  visited.add(file);
  const source=readFileSync(file,'utf8');
  for(const name of moduleImports(source)){
   const dependency=resolve(dirname(file),name);
   const relativeName=relative(base,dependency);
   if(relativeName.startsWith('..')||relativeName.startsWith('/'))
    throw Error('Module import escapes Android assets: '+rel+' → '+name);
   if(!existsSync(dependency))
    throw Error('Missing WebView module: '+rel+' → '+name);
   if(extname(dependency)!=='.mjs')
    throw Error('Unsupported WebView module extension: '+rel+' → '+name);
   active.push(dependency);
  }
 }
 return {state:'VERIFIED',modules:visited.size};
}
