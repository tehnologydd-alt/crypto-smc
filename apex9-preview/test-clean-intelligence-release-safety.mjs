import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAndroidBadging,parseSignerCertificate,classifyUpgrade,
 validateBuiltApk,formatUpgradeReport,createInstallReadinessMarkdown}
 from '../apex9-android/scripts/audit-apk.mjs';
import {validateLocalBuildInfo,assessPortableUpdate}
 from './clean-intelligence-upgrade-prep.mjs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const digest='a'.repeat(64);
const b64='b'.repeat(64);
const build={appId:'com.apexintelligence.research',
 versionName:'9.0.120',versionCode:900120,buildRun:120,
 signedRelease:false};
const current={packageId:build.appId,versionCode:build.versionCode,
 versionName:build.versionName,signerSha256:digest,
 signedRelease:false,sha256:b64,sizeBytes:5_000_000};
const prior={packageId:build.appId,versionCode:900119,
 versionName:'9.0.119',signedRelease:false,signerSha256:digest};

test('APK badging and signer SHA256 parse only verified exact identity',()=>{
 assert.deepEqual(parseAndroidBadging(
  "package: name='com.apexintelligence.research' versionCode='900120' versionName='9.0.120'\n"+
  "sdkVersion:'24'\n"),{
   packageId:build.appId,versionCode:900120,versionName:'9.0.120'
  });
 assert.throws(()=>parseAndroidBadging("package: name='unknown'"),/Cannot verify/);
 assert.throws(()=>parseAndroidBadging(
  "package: name='x' versionCode='0' versionName='1'"),/Invalid Android/);
 assert.equal(parseSignerCertificate(
  "Verifies\nSigner #1 certificate SHA-256 digest: "+digest+"\n"),digest);
 assert.throws(()=>parseSignerCertificate('No signer info'),/exactly one/);
 assert.throws(()=>parseSignerCertificate(
  "Signer #1 certificate SHA-256 digest: "+digest+
  "\nSigner #2 certificate SHA-256 digest: "+digest),/exactly one/);
});
test('buildInfo must match app package, monotonic run and full APK certificate',()=>{
 assert.equal(validateBuiltApk(build,current),true);
 assert.ok(validateLocalBuildInfo(build));
 assert.equal(validateLocalBuildInfo({...build,versionCode:1}),null);
 assert.equal(validateLocalBuildInfo({...build,signedRelease:'true'}),null);
 assert.throws(()=>validateBuiltApk(build,{...current,versionCode:900121}),
  /APK differs/);
 assert.throws(()=>validateBuiltApk({...build,appId:'evil'},current),
  /Invalid versioned/);
});
test('upgrade classifier rejects downgrades and different certificates',()=>{
 assert.equal(classifyUpgrade(current,null).state,'DEBUG_PREVIEW');
 assert.equal(classifyUpgrade({...current,signedRelease:true},null).state,'UNVERIFIED_PREVIOUS');
 assert.equal(classifyUpgrade({...current,packageId:'other'},prior).state,'BLOCKED');
 assert.equal(classifyUpgrade({...current,versionCode:900119},prior).state,
  'BLOCKED_DOWNGRADE');
 assert.equal(classifyUpgrade({...current,signerSha256:b64},prior).state,
  'REINSTALL_AFTER_BACKUP');
 assert.equal(classifyUpgrade(current,prior).state,'DEBUG_ONLY_MATCHES');
 assert.equal(classifyUpgrade({...current,signedRelease:true},
  {...prior,signedRelease:true}).state,'UPDATE_COMPATIBLE');
});
test('report never claims actual Room continuity on the user phone',()=>{
 const report=formatUpgradeReport({current,previous:{...prior,signerSha256:b64}});
 const md=createInstallReadinessMarkdown(report);
 assert.equal(report.comparison.state,'REINSTALL_AFTER_BACKUP');
 assert.equal(report.packageId,build.appId);
 assert.equal(report.signingMode,'DEBUG');
 assert.ok(report.warning.includes('не доказывает сохранность Room'));
 assert.ok(md.includes('зашифрованную резервную копию'));
 assert.ok(md.includes('SHА-256')===false);
});
test('local preparation exposes true Room counters but not export success certainty',()=>{
 const native={native:true,storage:'Room',observationCount:45,
  candleCount:540,forecastCount:12};
 const noBackup={available:true,lastWrittenAt:0};
 const backup={available:true,lastWrittenAt:1794500000000};
 assert.equal(assessPortableUpdate({}).state,'NO_ROOM');
 assert.equal(assessPortableUpdate({native:{...native,forecastCount:null}}).state,
  'ROOM_UNVERIFIED');
 const missing=assessPortableUpdate({native,backup:noBackup,build});
 assert.equal(missing.state,'BACKUP_REQUIRED');
 assert.deepEqual(missing.counts,{observations:45,candles:540,forecasts:12});
 assert.equal(assessPortableUpdate({native,backup}).state,'BUILD_UNVERIFIED');
 const debug=assessPortableUpdate({native,backup,build});
 assert.equal(debug.state,'DEBUG_BACKUP_REQUIRED');
 assert.match(debug.note,/тестовой подписью/);
 assert.equal(assessPortableUpdate({native,backup,
  build:{...build,signedRelease:true}}).state,'SIGNATURE_CHECK_REQUIRED');
 assert.ok(!debug.steps.some(x=>/безопасно установить|облако синхронизировано/i.test(x)));
});
test('stage 11 installed in native Settings but never adds network or auto-trading',()=>{
 const ui=read('./clean-intelligence-upgrade-prep.mjs');
 const app=read('./app.mjs');
 const index=read('./index.html');
 const android=read('../apex9-android/scripts/prepare-web.mjs');
 const gradle=read('../apex9-android/scripts/set-android-version.mjs');
 const backup=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexPortableBackup.kt');
 const database=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt');
 assert.ok(ui.includes("getMobileCloudBackupStatus"));
 assert.ok(ui.includes("getMobileStatus"));
 assert.ok(ui.includes("fetchImpl('./apex-build-info.json'"));
 assert.ok(ui.includes("document.getElementById('ci8-settings-backup')"));
 assert.ok(!ui.includes('window.location.reload()'));
 assert.ok(!ui.includes('localStorage'));
 assert.ok(!ui.includes('installAPK('));
 assert.ok(!ui.includes('deleteDatabase'));
 assert.ok(app.includes('initCleanIntelligenceUpdatePreparation()'));
 assert.ok(index.includes('./clean-intelligence-upgrade-prep.css'));
 for(const name of ['clean-intelligence-upgrade-prep.css',
  'clean-intelligence-upgrade-prep.mjs']){
  assert.ok(android.includes("'"+name+"'"),name);
 }
 assert.ok(gradle.includes('versionCode=900000+run'));
 assert.ok(gradle.includes('APEX_KEYSTORE_B64'));
 assert.ok(database.includes('migration4To5'));
 assert.ok(!database.includes('fallbackToDestructiveMigration'));
 assert.ok(backup.includes('INSERT OR IGNORE INTO'));
});
