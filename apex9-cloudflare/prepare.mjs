/**
 * Generate a separate Cloudflare web deployment from the APEX source.
 * Fails closed unless all settings are explicit; never changes APK assets.
 */
import {readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {renderHostedIndex} from '../apex9-news-gateway/hosted-tools.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
export function prepareCloud(env=process.env,{
 read=readFileSync,write=writeFileSync,stage=true
}={}){
 const origin=String(env.APEX_WORKER_ORIGIN||'');
 let url;
 try{url=new URL(origin);}catch{throw Error('APEX_WORKER_ORIGIN required');}
 if(url.protocol!=='https:'||url.origin!==origin||url.pathname!=='/'||
   url.username||url.password||url.search||url.hash)
  throw Error('APEX_WORKER_ORIGIN must be an exact HTTPS origin');
 const id=String(env.APEX_D1_DATABASE_ID||'');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id))
  throw Error('APEX_D1_DATABASE_ID must be configured');
 const conf={APEX_PROXY_ORIGIN:origin,APEX_PUBLIC_DOMAIN:url.host,
  APEX_HOSTED_NEWS_ENABLED:env.APEX_HOSTED_NEWS_ENABLED};
 const wrangler=read(join(here,'wrangler.template.json'),'utf8')
  .replace('__D1_DATABASE_ID__',id);
 const config=JSON.parse(wrangler);
 if(config.d1_databases?.[0]?.database_id!==id)
  throw Error('Malformed generated D1 configuration');
 const result={origin,workerName:config.name,dbId:id};
 if(!stage)return result;
 execFileSync(process.execPath,[join(root,'apex9-android/scripts/prepare-web.mjs')],{
  cwd:root,stdio:'inherit'});
 rmSync(join(here,'public'),{recursive:true,force:true});
 cpSync(join(root,'apex9-android/dist'),join(here,'public'),{recursive:true});
 const index=join(here,'public/index.html');
 write(index,renderHostedIndex(read(index,'utf8'),conf));
 write(join(here,'wrangler.json'),wrangler);
 console.log('Prepared APEX Cloudflare web-only deployment for '+origin+
  ', Android news gateway remains off.');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 prepareCloud();
