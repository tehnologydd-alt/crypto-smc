/** Apply Android preview-only metadata; generated Gradle project must exist. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const file='android/app/build.gradle';
if(!existsSync(file))throw Error('Run npx cap add android first');
let gradle=readFileSync(file,'utf8');
for(const [label,pattern,replacement] of [
 ['versionCode',/\bversionCode\s+\d+\b/,'versionCode 900001'],
 ['versionName',/\bversionName\s+["'][^"']+["']/,'versionName "9.0.0-preview.1"']
]){
 const matches=gradle.match(new RegExp(pattern.source,'g'))||[];
 if(matches.length!==1)throw Error('Expected one '+label+' setting, found '+matches.length);
 gradle=gradle.replace(pattern,replacement);
}
writeFileSync(file,gradle);
console.log('APEX 9 research preview: Android versionCode=900001, versionName=9.0.0-preview.1');
