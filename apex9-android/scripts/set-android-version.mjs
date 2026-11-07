/**
 * Stable identity, monotonic versioning and opt-in existing-keystore signing.
 * APEX 9 is a separate Android app from APEX 8.6.
 * Reuse the same four private GitHub Actions signing secrets on every release.
 * Without them the build is a disposable debug preview, NOT update-compatible.
 */
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
const file='android/app/build.gradle';
if(!existsSync(file))throw Error('Run npx cap add android first');
let gradle=readFileSync(file,'utf8');
const run=Number(process.env.GITHUB_RUN_NUMBER||process.env.APEX_BUILD_NUMBER||'1');
if(!Number.isSafeInteger(run)||run<1||run>999999)throw Error('Invalid monotonic build number');
const versionCode=900000+run;
const versionName='9.0.'+run;
const changes=[
 ['versionCode',/\bversionCode\s+\d+\b/,'versionCode '+versionCode],
 ['versionName',/\bversionName\s+["'][^"']+["']/,'versionName "'+versionName+'"']
];
for(const [label,pattern,replacement] of changes){
 const matches=gradle.match(new RegExp(pattern.source,'g'))||[];
 if(matches.length!==1)throw Error('Expected exactly one Android '+label+' setting, found '+matches.length);
 gradle=gradle.replace(pattern,replacement);
}
const keys=['APEX_KEYSTORE_B64','APEX_KEYSTORE_PASSWORD','APEX_KEY_ALIAS','APEX_KEY_PASSWORD'];
const present=keys.filter(key=>Boolean(process.env[key]));
if(present.length>0&&present.length!==keys.length)
 throw Error('Partial signing configuration; all four secrets are required');
const signed=present.length===keys.length;
const marker='.apex-signed-release';
if(existsSync(marker))unlinkSync(marker);
if(signed){
 const bytes=Buffer.from(process.env.APEX_KEYSTORE_B64,'base64');
 if(bytes.length<500||bytes.length>1048576)throw Error('Invalid signed keystore data');
 const storeFile='android/app/apex-release-signing.jks';
 writeFileSync(storeFile,bytes,{mode:0o600});
 bytes.fill(0);
 if(!/\bbuildTypes\s*\{/.test(gradle)||!/\brelease\s*\{/.test(gradle))
  throw Error('Android release buildType not found');
 gradle=gradle.replace(/\bbuildTypes\s*\{/,`signingConfigs {
        apexRelease {
            storeFile file('apex-release-signing.jks')
            storePassword System.getenv('APEX_KEYSTORE_PASSWORD')
            keyAlias System.getenv('APEX_KEY_ALIAS')
            keyPassword System.getenv('APEX_KEY_PASSWORD')
        }
    }
    buildTypes {`);
 gradle=gradle.replace(/(\brelease\s*\{)/,'$1\n            signingConfig signingConfigs.apexRelease');
 writeFileSync(marker,'signed-release\n');
}
writeFileSync(file,gradle);
writeFileSync('dist/apex-build-info.json',JSON.stringify({
 appId:'com.apexintelligence.research',versionCode,versionName,
 buildRun:run,signedRelease:signed,channel:'research-preview'
},null,2));
console.log('APEX 9 Android version='+versionName+' versionCode='+versionCode+
 (signed?' [stable signed release]':' [debug only: stable signing secrets not configured]'));
