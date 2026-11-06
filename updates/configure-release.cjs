/** Prepare monotonic Android versionCode and optional signed release build.
 * Never store APK signing credentials in the public repository.
 */
const fs=require('node:fs');
const path=require('node:path');
const p=path.join(process.cwd(),'android/app/build.gradle');
if(!fs.existsSync(p))throw Error('Run npx cap add android first');
let g=fs.readFileSync(p,'utf8');
const run=Number(process.env.GITHUB_RUN_NUMBER||'1');
if(!Number.isInteger(run)||run<1||run>1_000_000)throw Error('Invalid GitHub run number');
const code=100000+run;
if(!/\bversionCode\s+\d+\b/.test(g)||!/\bversionName\s+["'][^"']+["']/.test(g))throw Error('Gradle version fields not found');
g=g.replace(/\bversionCode\s+\d+\b/,`versionCode ${code}`)
.replace(/\bversionName\s+["'][^"']+["']/,`versionName "4.3.${run}"`);
const keys=['APEX_KEYSTORE_B64','APEX_KEYSTORE_PASSWORD','APEX_KEY_ALIAS','APEX_KEY_PASSWORD'];
const present=keys.filter(k=>Boolean(process.env[k]));
if(present.length&&present.length!==4)throw Error('Set all four signing secrets, not a partial set');
if(present.length===4){
 const bytes=Buffer.from(process.env.APEX_KEYSTORE_B64,'base64');
 if(bytes.length<500||bytes.length>1024*1024)throw Error('Invalid signing keystore bytes');
 fs.writeFileSync('android/app/apex-release-signing.jks',bytes,{mode:0o600});
 if(!g.includes('buildTypes {')||!/release\s*\{/.test(g))throw Error('Gradle release block missing');
 g=g.replace('buildTypes {',`signingConfigs {
        apexRelease {
            storeFile file('apex-release-signing.jks')
            storePassword System.getenv('APEX_KEYSTORE_PASSWORD')
            keyAlias System.getenv('APEX_KEY_ALIAS')
            keyPassword System.getenv('APEX_KEY_PASSWORD')
        }
    }
    buildTypes {`).replace(/(release\s*\{)/,'$1\n            signingConfig signingConfigs.apexRelease');
 fs.writeFileSync('.apex-signed-release','yes');
 console.log('APEX signed release enabled for versionCode '+code);
}else console.log('APEX debug build only. Configure four private signing secrets for install-over-app updates. versionCode='+code);
fs.writeFileSync(p,g);
