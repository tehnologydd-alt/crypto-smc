const fs=require('node:fs');
const paths=[
'native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java',
'native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundScanWorker.java',
'native/android/app/src/main/java/com/apexintelligence/monitor/MainActivity.java',
'scripts/apply-android.js',
'native/android/app/build.gradle',
'native/android/app/src/main/AndroidManifest.xml'
];
for(const p of paths){
 console.log('====== NATIVE SOURCE',p,'======');
 if(!fs.existsSync(p)){console.log('NOT FOUND');continue;}
 const l=fs.readFileSync(p,'utf8').split('\n');
 for(let i=0;i<l.length;i++)console.log(String(i+1).padStart(4,'0')+' '+l[i]);
}
