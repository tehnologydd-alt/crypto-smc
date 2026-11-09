/**
 * Stage a separate hosted WEB build; never modify Android sources/assets.
 * Requires explicit opt-in via environment configuration.
 */
import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {renderHostedIndex,validateHostedConfig} from './hosted-tools.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(root,'apex9-news-gateway/public');
validateHostedConfig(process.env);
execFileSync(process.execPath,[join(root,'apex9-android/scripts/prepare-web.mjs')],{
 cwd:root,stdio:'inherit'});
rmSync(target,{force:true,recursive:true});
mkdirSync(target,{recursive:true});
cpSync(join(root,'apex9-android/dist'),target,{recursive:true});
const path=join(target,'index.html');
const next=renderHostedIndex(readFileSync(path,'utf8'),process.env);
writeFileSync(path,next);
console.log('APEX HTTPS web preview staged at '+target+
 ' (vendor credentials not included; Android unchanged).');
