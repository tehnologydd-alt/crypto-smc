/**
 * APEX Clean Intelligence · Stage 11: device-side update preparation.
 *
 * One user-initiated local check. It does not install an APK, access cloud
 * files, store a passphrase, change background jobs, or modify Room history.
 * Archive timestamp is never treated as proof that cloud sync succeeded.
 */
import {getMobileStatus,getMobileCloudBackupStatus}
 from './mobile-bridge.mjs';

export function validateLocalBuildInfo(value){
 if(!value||value.appId!=='com.apexintelligence.research'||
  !Number.isSafeInteger(value.versionCode)||
  !Number.isSafeInteger(value.buildRun)||
  value.versionCode!==900000+value.buildRun||
  value.versionName!=='9.0.'+value.buildRun||
  typeof value.signedRelease!=='boolean')
  return null;
 return {versionName:value.versionName,versionCode:value.versionCode,
  signedRelease:value.signedRelease};
}
export function assessPortableUpdate({native,backup,build}={}){
 const status={
  state:'UNVERIFIED',
  title:'Подготовка не подтверждена',
  note:'Это не автоматическая проверка подписи предыдущего APK.',
  steps:[]
 };
 if(native?.native!==true||native.storage!=='Room'){
  return {...status,state:'NO_ROOM',
   note:'Нативная база Room не подтверждена. Веб-режим не проверяет сохранность Android-данных.',
   steps:['Откройте установленную APK на устройстве, где сохранены исследования.']};
 }
 const counters=['observationCount','candleCount','forecastCount'];
 if(counters.some(key=>!Number.isSafeInteger(native[key])||native[key]<0)){
  return {...status,state:'ROOM_UNVERIFIED',
   note:'Room ответила без проверяемых счётчиков. Не удаляйте текущую установку.',
   steps:['Проверьте локальную базу в разделе «Источники».']};
 }
 const count={observations:native.observationCount,
  candles:native.candleCount,forecasts:native.forecastCount};
 const archive=backup?.available===true&&
  Number.isFinite(backup.lastWrittenAt)&&backup.lastWrittenAt>0;
 const signing=validateLocalBuildInfo(build);
 if(!archive){
  return {...status,state:'BACKUP_REQUIRED',
   title:'Нужна резервная копия',
   note:'Нет сведений об успешно завершённом экспорте архива через Android. '+
    'Само наличие истории Room не означает, что она защищена.',
   counts:count,
   steps:[
    'Откройте в настройках «Резервный архив» и сохраните зашифрованный файл.',
    'Проверьте, что файл действительно виден в выбранном хранилище и известна парольная фраза.',
    'Только после проверки архива решайте вопрос об обновлении.'
   ]};
 }
 if(!signing){
  return {...status,state:'BUILD_UNVERIFIED',
   title:'Архив создан, сборка не подтверждена',
   counts:count,
   note:'Локальный манифест установленной APK недоступен. Сертификат не проверен.',
   steps:['Проверьте файл архива и версию установленного приложения.',
    'Не удаляйте APK до проверки подписи нового пакета.']};
 }
 const debug=!signing.signedRelease;
 return {...status,state:debug?'DEBUG_BACKUP_REQUIRED':'SIGNATURE_CHECK_REQUIRED',
  title:debug?'Тестовая подпись: нужен архив':'Проверьте подпись обновления',
  versionName:signing.versionName,
  signingMode:debug?'DEBUG':'RELEASE',
  counts:count,
  archiveAt:backup.lastWrittenAt,
  note:debug?
   'Эта APK собрана с тестовой подписью. Следующая может не установиться поверх неё, даже при увеличении версии.':
   'Эта APK использует release-подпись, но совместимость с предыдущей версией можно подтвердить только сравнением сертификатов обоих APK.',
  steps:[
   'Проверьте наличие зашифрованного архива в выбранном хранилище и парольную фразу.',
   'Сравните отчёт о подписи APK в архиве GitHub Actions перед установкой.',
   'Не удаляйте старое приложение без проверенной резервной копии.'
  ]};
}
const create=(name,cls='',txt)=>{
 const n=document.createElement(name);
 if(cls)n.className=cls;
 if(txt!==undefined)n.textContent=String(txt);
 return n;
};
async function getLocalBuildInfo(fetchImpl){
 try{
  const res=await fetchImpl('./apex-build-info.json',{cache:'no-store'});
  if(!res.ok)return null;
  return validateLocalBuildInfo(await res.json());
 }catch{return null;}
}
export function initCleanIntelligenceUpdatePreparation({
 nativeStatus=getMobileStatus,backupStatus=getMobileCloudBackupStatus,
 fetchImpl=globalThis.fetch?.bind(globalThis)
}={}){
 const root=document.getElementById('ci8-settings-backup');
 if(!root||document.getElementById('ci11-upgrade-desk'))return false;
 const section=create('details','ci11-upgrade-desk');
 section.id='ci11-upgrade-desk';
 section.append(create('summary','','Проверка перед обновлением APK'));
 const intro=create('p','ci11-upgrade-intro',
  'Проверка только по запросу: состояние Room, наличие отметки об экспорте архива и версия установленной сборки. Ничего не устанавливается автоматически.');
 const status=create('p','ci11-upgrade-status','Проверка ещё не запускалась');
 status.setAttribute('role','status');
 const values=create('div','ci11-upgrade-stats');
 const guide=create('div','ci11-upgrade-guide');
 const button=create('button','ci11-upgrade-check','Проверить подготовку');
 button.type='button';
 let busy=false;
 const verify=async()=>{
  if(busy)return;
  busy=true;button.disabled=true;
  status.textContent='Проверяем локальную базу и сведения об архиве…';
  values.replaceChildren();guide.replaceChildren();
  try{
   const [native,backup,build]=await Promise.all([
    nativeStatus().catch(()=>({native:false})),
    backupStatus().catch(()=>({available:false})),
    typeof fetchImpl==='function'?getLocalBuildInfo(fetchImpl):Promise.resolve(null)
   ]);
   const report=assessPortableUpdate({native,backup,build});
   section.dataset.readiness=report.state;
   status.textContent=report.title+' · '+report.note;
   if(report.counts){
    for(const [label,key] of [
     ['Наблюдения','observations'],['Свечи','candles'],['Прогнозы','forecasts']
    ]){
     const cell=create('div','ci11-upgrade-stat');
     cell.append(create('span','',label),create('strong','',report.counts[key]));
     values.append(cell);
    }
   }
   if(report.versionName){
    guide.append(create('p','ci11-upgrade-version',
     'Установленная сборка: '+report.versionName+
     ' · подпись: '+report.signingMode));
   }
   const list=create('ol','ci11-upgrade-steps');
   for(const step of report.steps)list.append(create('li','',step));
   guide.append(list);
  }catch{
   status.textContent='Проверка не удалась. Не удаляйте текущую установку.';
  }finally{
   busy=false;button.disabled=false;
  }
 };
 button.addEventListener('click',verify);
 section.append(intro,status,values,guide,button);
 root.append(section);
 return true;
}
