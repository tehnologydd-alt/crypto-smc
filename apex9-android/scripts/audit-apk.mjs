/**
 * APEX 9: post-build, read-only APK identity & upgrade readiness audit.
 *
 * Uses Android SDK aapt + apksigner; never modifies, resigns or installs APKs.
 * A matching package/version is not enough: a verifiable signing certificate
 * must also match before an in-place update can be called compatible.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const APP_ID='com.apexintelligence.research';
const hex64=/^[a-f0-9]{64}$/;
const fail=(message)=>{throw new Error(message);};

export function parseAndroidBadging(raw){
 const text=String(raw||'');
 const match=text.match(/(?:^|\n)package:\s+name='([^']+)'\s+versionCode='([0-9]+)'\s+versionName='([^']+)'/);
 if(!match)return fail('Cannot verify APK package/version via aapt');
 const versionCode=Number(match[2]);
 if(!Number.isSafeInteger(versionCode)||versionCode<1)
  return fail('Invalid Android versionCode');
 return {packageId:match[1],versionCode,versionName:match[3]};
}
export function parseSignerCertificate(raw){
 const text=String(raw||'');
 const certificates=[...text.matchAll(/Signer #(\d+) certificate SHA-256 digest:\s*([0-9a-f:]+)/gi)];
 if(certificates.length!==1||certificates[0][1]!=='1')
  return fail('Expected exactly one verifiable Android signing certificate');
 const digest=certificates[0][2].toLowerCase().replaceAll(':','');
 if(!hex64.test(digest))return fail('Invalid certificate SHA256 digest');
 return digest;
}
export function classifyUpgrade(current,previous=null){
 if(current.packageId!==APP_ID)
  return {state:'BLOCKED',reason:'Пакет APK не принадлежит APEX'};
 if(!previous)return {state:current.signedRelease?'UNVERIFIED_PREVIOUS':'DEBUG_PREVIEW',
  reason:current.signedRelease?
   'Сертификат предыдущей установленной версии не проверен':
   'Тестовая debug-подпись не гарантирует обновление поверх старого APK'};
 if(previous.packageId!==APP_ID||!hex64.test(previous.signerSha256||''))
  return {state:'BLOCKED',reason:'Неизвестный пакет или сертификат предыдущей версии'};
 if(!Number.isSafeInteger(previous.versionCode)||previous.versionCode<1)
  return {state:'BLOCKED',reason:'Некорректный номер предыдущей сборки'};
 if(current.versionCode<=previous.versionCode)
  return {state:'BLOCKED_DOWNGRADE',reason:'Номер нового APK не выше установленного'};
 if(current.signerSha256!==previous.signerSha256)
  return {state:'REINSTALL_AFTER_BACKUP',
   reason:'Подписи APK различаются; установка поверх существующего приложения несовместима'};
 if(!current.signedRelease||!previous.signedRelease)
  return {state:'DEBUG_ONLY_MATCHES',
   reason:'Сертификат совпадает для двух проверенных APK, но нет постоянного release-подписания'};
 return {state:'UPDATE_COMPATIBLE',
  reason:'Совпадают пакет и сертификат, версия увеличена'};
}
export function validateBuiltApk(info,identity){
 if(!info||info.appId!==APP_ID||
  !Number.isSafeInteger(info.versionCode)||info.versionCode<900001||
  !Number.isSafeInteger(info.buildRun)||info.buildRun<1||
  info.buildRun>999999||info.versionCode!==900000+info.buildRun||
  info.versionName!=='9.0.'+info.buildRun||
  typeof info.signedRelease!=='boolean')
  return fail('Invalid versioned build manifest');
 if(identity.packageId!==APP_ID||identity.versionCode!==info.versionCode||
  identity.versionName!==info.versionName||!hex64.test(identity.signerSha256||''))
  return fail('Built APK differs from expected package/version/signing data');
 return true;
}
export function inspectApk(apkPath,info,{aapt='aapt',apksigner='apksigner'}={}){
 const path=resolve(apkPath);
 const badging=execFileSync(aapt,['dump','badging',path],{
  encoding:'utf8',timeout:30000,maxBuffer:2_000_000});
 const verified=execFileSync(apksigner,['verify','--verbose','--print-certs',path],{
  encoding:'utf8',timeout:60000,maxBuffer:2_000_000});
 const signerSha256=parseSignerCertificate(verified);
 const bytes=readFileSync(path);
 if(bytes.byteLength<50_000)fail('APK is unexpectedly small');
 const identity={...parseAndroidBadging(badging),signerSha256,
  sizeBytes:bytes.byteLength,
  sha256:createHash('sha256').update(bytes).digest('hex'),
  signedRelease:info.signedRelease===true};
 validateBuiltApk(info,identity);
 return identity;
}
export function formatUpgradeReport({current,previous=null}){
 const compatibility=classifyUpgrade(current,previous);
 return {
  format:'APEX_APK_RELEASE_AUDIT_V1',
  packageId:current.packageId,
  versionName:current.versionName,
  versionCode:current.versionCode,
  signingMode:current.signedRelease?'RELEASE':'DEBUG',
  signerSha256:current.signerSha256,
  apkSha256:current.sha256,
  apkSizeBytes:current.sizeBytes,
  comparison:compatibility,
  previousVersionName:previous?.versionName||null,
  warning:'Проверка APK и сертификата не доказывает сохранность Room на устройстве. '+
   'Перед заменой приложения проверьте зашифрованный архив в выбранном хранилище. '+
   'Тестовая debug-подпись может отличаться в следующих сборках.'
 };
}
export function createInstallReadinessMarkdown(report){
 const line=[
  '# APEX 9 · Проверка APK перед установкой',
  '',
  'Версия: **'+report.versionName+'** · код '+report.versionCode,
  'Идентификатор: \`'+report.packageId+'\`',
  'Подпись: **'+report.signingMode+'**',
  'SHA-256 APK: \`'+report.apkSha256+'\`',
  'SHA-256 сертификата: \`'+report.signerSha256+'\`',
  '',
  '**Совместимость обновления:** '+report.comparison.state,
  report.comparison.reason,
  '',
  '**Важно:** '+report.warning,
  '',
  'Если приложение требует удаления предыдущей версии, сначала создайте '+
   'шифрованную резервную копию и проверьте, что файл появился в выбранном '+
   'хранилище. Удаление Android-приложения обычно удаляет его локальные данные.',
  'Тест в браузере/CI не является проверкой переноса реальной базы Room.',
  ''
 ];
 return line.join('\n');
}

const invoked=process.argv[1]&&
 import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
 const [apkPath,manifestPath,outputDir,previousApkPath,previousManifestPath]=
  process.argv.slice(2);
 if(!apkPath||!manifestPath||!outputDir)
  fail('Usage: node audit-apk.mjs <apk> <build-info> <output-dir> [previous.apk previous-info.json]');
 const info=JSON.parse(readFileSync(resolve(manifestPath),'utf8'));
 const current=inspectApk(apkPath,info);
 let previous=null;
 if(previousApkPath||previousManifestPath){
  if(!previousApkPath||!previousManifestPath)
   fail('Previous APK and previous build info must both be supplied');
  const priorInfo=JSON.parse(readFileSync(resolve(previousManifestPath),'utf8'));
  previous=inspectApk(previousApkPath,priorInfo);
 }
 const report=formatUpgradeReport({current,previous});
 const dir=resolve(outputDir);
 mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'APEX-install-readiness.json'),
  JSON.stringify(report,null,2)+'\n');
 writeFileSync(resolve(dir,'APEX-install-readiness.md'),
  createInstallReadinessMarkdown(report));
 console.log(report.versionName,report.signingMode,report.comparison.state);
 console.log(report.comparison.reason);
}
