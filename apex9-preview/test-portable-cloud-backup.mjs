import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exportMobileCloudBackup,importMobileCloudBackup,
 getMobileCloudBackupStatus} from './mobile-bridge.mjs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const backup=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexPortableBackup.kt');
const prefs=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexPreferences.kt');
const bridge=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');

test('backup includes all Room research history tables and device settings',()=>{
 for(const t of ['research_observations','market_candles','research_forecasts',
  'research_forecast_stages','research_forecast_results',
  'research_shadow_candidates'])assert.ok(backup.includes('"'+t+'"'));
 for(const key of ['"favorites"','"uiMarkedIds"','"alertMarkedIds"',
  '"asset"','"backgroundSyncEnabled"','"alertScope"'])
  assert.ok(backup.includes(key),key);
 assert.match(backup,/db\.runInTransaction/);
 assert.match(backup,/sqlite\.execSQL\(sql,values\.toTypedArray\(\)\)/);
});
test('archive is authenticated and encrypted before touching persistent disk',()=>{
 for(const token of ['AES/GCM/NoPadding','PBKDF2WithHmacSHA256',
  'GCMParameterSpec(128,iv)','CipherOutputStream','CipherInputStream',
  'updateAAD','securePassword(password)','MAX_ZIP'])
  assert.ok(backup.includes(token),token);
 assert.ok(backup.includes('ZipOutputStream(BufferedOutputStream('));
 assert.ok(backup.includes('CipherOutputStream(file,cipher)'));
 assert.ok(!backup.includes('private fun makeZip('),'plaintext zip temp is forbidden');
 assert.ok(backup.includes('zipFile.delete()'));
 assert.ok(backup.includes('encrypted.delete()'));
 assert.ok(!backup.includes('http://')&&!backup.includes('https://'));
});
test('import verifies full archive before non-destructive Room merge',()=>{
 const verifyIndex=backup.indexOf('val (manifest,settings)=verify(zip)');
 const mergeIndex=backup.indexOf('val scanned=merge(zip,context)');
 assert.ok(verifyIndex>0&&mergeIndex>verifyIndex);
 assert.ok(backup.includes('INSERT OR IGNORE INTO'));
 assert.ok(backup.includes('require(expected in 0..MAX_LINES)'));
 assert.ok(backup.includes('expected==found'));
 assert.ok(backup.includes('val present=zip.entries().toList()'));
 for(const forbidden of ['DELETE FROM research_forecasts','DROP TABLE',
  'DELETE FROM market_candles','FileOutputStream(databaseFile)'])
  assert.ok(!backup.includes(forbidden),forbidden);
 assert.ok(prefs.includes('fun validateRestore(json:JSONObject)'));
 assert.ok(prefs.includes('suspend fun restoreFromBackup('));
 assert.ok(prefs.includes('prefs[syncEnabled]=false'));
 assert.ok(prefs.includes('prefs[alertsEnabledKey]=false'));
});
test('cloud export/import use Android user-chosen SAF provider and never store passphrase',()=>{
 for(const token of ['Intent.ACTION_CREATE_DOCUMENT','Intent.ACTION_OPEN_DOCUMENT',
  '@ActivityCallback','onCloudBackupPicked','onCloudRestorePicked',
  'ApexPortableBackup.exportTo(','ApexPortableBackup.restoreFrom('])
  assert.ok(bridge.includes(token),token);
 assert.ok(!bridge.includes('putString("passphrase"'));
 assert.ok(bridge.includes("password.fill('\\u0000')"));
 const html=read('./index.html'),app=read('./app.mjs');
 for(const token of ['apex-backup-passphrase','apex-backup-export','apex-backup-import'])
  assert.ok(html.includes('id="'+token+'"'));
 assert.ok(app.includes('runCloudBackup('));
 assert.ok(app.includes('input.value='));
 assert.ok(app.includes('window.confirm('));
 assert.ok(app.includes('window.location.reload()'));
 assert.ok(app.includes('apex9_selected_research_ids_v1'));
 assert.ok(read('../apex9-android/scripts/install-native.mjs')
  .includes("'ApexPortableBackup.kt'"));
});
test('JS only calls native backup after valid passphrase and restore confirmation',async()=>{
 const prior=globalThis.window,calls=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  backupToCloud:async x=>{calls.push(['save',x]);return {saved:true}},
  restoreFromCloud:async x=>{calls.push(['restore',x]);return {restored:true}},
  getPortableBackupStatus:async()=>({available:true,lastWrittenAt:42})
 }}}};
 try{
  assert.match((await exportMobileCloudBackup('short')).error,/Пароль/);
  assert.match((await importMobileCloudBackup('123456789012')).error,/подтверждения/);
  assert.equal(calls.length,0);
  const out=await exportMobileCloudBackup('portable passphrase',['direction2:BTCUSDT:1h:1794480000000']);
  assert.equal(out.saved,true);
  assert.deepEqual(calls[0][1].uiMarkedIds,['direction2:BTCUSDT:1h:1794480000000']);
  const restored=await importMobileCloudBackup('portable passphrase',{confirmed:true});
  assert.equal(restored.restored,true);
  assert.equal(calls[1][1].confirmed,true);
  assert.deepEqual(await getMobileCloudBackupStatus(),
   {available:true,lastWrittenAt:42});
 }finally{globalThis.window=prior}
});
