/**
 * Inject persistent Kotlin research core into Capacitor-generated Android app.
 * Idempotent, deterministic and deliberately separate from checked-in web UI.
 * All source files are committed under apex9-android/native.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project=fileURLToPath(new URL('../',import.meta.url));
const appRoot=join(project,'android/app');
const appGradle=join(appRoot,'build.gradle');
const rootGradle=join(project,'android/build.gradle');
const javaRoot=join(appRoot,'src/main/java');
const nativeRoot=join(project,'native/src/main/java/com/apexintelligence/research');
if(!existsSync(appGradle)||!existsSync(rootGradle)||!existsSync(javaRoot))
 throw Error('Run npx cap add android first');
const nativeFiles=['ApexApiLedger.kt','ApexDatabase.kt','ApexPreferences.kt','ApexPortableBackup.kt','ApexSyncWorker.kt','ApexNativePlugin.kt','ApexAutoForecast.kt','ApexPublicationGate.kt','ApexPreOutcomeStrength.kt','ApexEvidenceContext.kt','ApexWhalePrepublication.kt','ApexMultiFrameForecast.kt','ApexDirectionalForecast.kt','ApexM5Evaluation.kt','ApexM1Evaluation.kt','ApexResearchLevels.kt','ApexHistoricalBackfill.kt','ApexForecastNotifier.kt','ApexRadarMonitor.kt','ApexPrivateNews.kt','ApexPublicNews.kt'];
for(const file of nativeFiles)if(!existsSync(join(nativeRoot,file)))throw Error('Native Kotlin file missing: '+file);

let root=readFileSync(rootGradle,'utf8');
// Keep the same vetted Maven Central Kotlin coordinates. Route Kotlin artifacts
// to Google's GCS Maven Central mirror first to avoid GitHub CDN 504 redirects.
// This affects Kotlin only; all other modules keep their original repositories.
if(!root.includes('GoogleCentralKotlinMirror')){
 const projectRepos=/allprojects\s*\{\s*repositories\s*\{/;
 if(!projectRepos.test(root))
  throw Error('Android allprojects repositories anchor missing');
 root=root.replace(projectRepos,match=>match+`
        maven {
            name = 'GoogleCentralKotlinMirror'
            url 'https://maven-central.storage-download.googleapis.com/maven2/'
            content { includeGroup 'org.jetbrains.kotlin' }
        }`);
 writeFileSync(rootGradle,root);
}
if(!root.includes('org.jetbrains.kotlin:kotlin-gradle-plugin')){
 const anchor=/classpath\s+(['"])com\.android\.tools\.build:gradle:[^'"]+\1/;
 if(!anchor.test(root))throw Error('Android Gradle Plugin classpath anchor missing');
 root=root.replace(anchor,match=>match+"\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20'");
 writeFileSync(rootGradle,root);
}
let gradle=readFileSync(appGradle,'utf8');
if(!gradle.includes("apply plugin: 'org.jetbrains.kotlin.android'")){
 const anchor="apply plugin: 'com.android.application'";
 if(!gradle.includes(anchor))throw Error('app Gradle plugin anchor missing');
 gradle=gradle.replace(anchor,anchor+"\napply plugin: 'org.jetbrains.kotlin.android'\napply plugin: 'kotlin-kapt'");
}
if(!gradle.includes('androidx.room:room-runtime')){
 const marker=/dependencies\s*\{/;
 if(!marker.test(gradle))throw Error('app dependencies block missing');
 gradle=gradle.replace(marker,`dependencies {
    // Research-only local storage, settings and opt-in deferrable refresh.
    implementation 'androidx.room:room-runtime:2.8.5'
    implementation 'androidx.room:room-ktx:2.8.5'
    kapt 'androidx.room:room-compiler:2.8.5'
    implementation 'androidx.datastore:datastore-preferences:1.2.1'
    implementation 'androidx.work:work-runtime-ktx:2.10.5'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2'`);
}
if(!gradle.includes('kotlinOptions {')){
 const found=gradle.match(/targetCompatibility\s+JavaVersion\.VERSION_(\d+)/);
 const target=found?found[1]:'21';
 gradle=gradle.replace(/android\s*\{/,`android {
    kotlinOptions { jvmTarget = '${target}' }`);
}
writeFileSync(appGradle,gradle);

const out=join(javaRoot,'com/apexintelligence/research');
mkdirSync(out,{recursive:true});
for(const name of nativeFiles)copyFileSync(join(nativeRoot,name),join(out,name));

function findMain(root){
 const found=[];
 function walk(dir,depth=0){
  if(depth>7)return;
  for(const x of readdirSync(dir,{withFileTypes:true})){
   const location=join(dir,x.name);
   if(x.isDirectory())walk(location,depth+1);
   else if(x.name==='MainActivity.java'||x.name==='MainActivity.kt')found.push(location);
  }
 }
 walk(root);
 if(found.length!==1)throw Error('Expected one MainActivity; got '+found.length);
 return found[0];
}
const main=findMain(javaRoot);
let contents=readFileSync(main,'utf8');
if(!contents.includes('registerPlugin(ApexNativePlugin')){
 const pkg=contents.match(/^package\s+([^;]+);/m)?.[1];
 if(pkg!=='com.apexintelligence.research')throw Error('Unexpected Android package '+pkg);
 if(main.endsWith('.java')){
  if(!contents.includes('import android.os.Bundle;'))
   contents=contents.replace(/(package\s+[^;]+;)/,'$1\n\nimport android.os.Bundle;');
  const superCall=/super\.onCreate\(savedInstanceState\)\s*;/;
  if(superCall.test(contents)){
   contents=contents.replace(superCall,
    'registerPlugin(ApexNativePlugin.class);\n        super.onCreate(savedInstanceState);');
  }else{
   const classStart=/public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{/;
   if(!classStart.test(contents))throw Error('Unrecognized generated MainActivity.java');
   contents=contents.replace(classStart,match=>match+`
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApexNativePlugin.class);
        super.onCreate(savedInstanceState);
    }`);
  }
 }else{
  const classStart=/class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{/;
  if(!classStart.test(contents))throw Error('Unrecognized generated MainActivity.kt');
  contents=contents.replace(classStart,match=>match+`
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(ApexNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }`);
 }
 writeFileSync(main,contents);
}
// Replace the empty generated activity with our maintained Android 15+ inset-safe
// activity, preserving native plugin registration and preventing system bar overlap.
if(main.endsWith('.java')){
 const nativeMain=join(project,'native/MainActivity.java');
 if(!existsSync(nativeMain))throw Error('APEX native MainActivity is missing');
 const replacement=readFileSync(nativeMain,'utf8');
 if(!replacement.includes('registerPlugin(ApexNativePlugin.class)')||
    !replacement.includes('setOnApplyWindowInsetsListener'))
  throw Error('APEX native MainActivity missing plugin or safe-area handling');
 writeFileSync(main,replacement);
}
if(!readFileSync(main,'utf8').includes('registerPlugin(ApexNativePlugin'))
 throw Error('Native plugin registration missing');
// Explicit runtime notification permission; actual request is user-initiated
// through Capacitor LocalNotifications in the settings dialog.
const manifest=join(appRoot,'src/main/AndroidManifest.xml');
let manifestXml=readFileSync(manifest,'utf8');
if(!manifestXml.includes('android.permission.POST_NOTIFICATIONS')){
 if(!manifestXml.includes('</manifest>'))throw Error('Android manifest invalid');
 manifestXml=manifestXml.replace('</manifest>',
  '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>');
 writeFileSync(manifest,manifestXml);
}
console.log('APEX Android Kotlin foundation injected: Room, DataStore, WorkManager, Capacitor bridge');
