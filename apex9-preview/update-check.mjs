/**
 * APEX 9: read-only GitHub release manifest interpretation.
 * Download/install is always initiated by the user, never silently.
 * Only the project's official repository and signed APK are eligible.
 */
export const RELEASE_API='https://api.github.com/repos/tehnologydd-alt/crypto-smc/releases?per_page=20';
export const RELEASES_URL='https://github.com/tehnologydd-alt/crypto-smc/releases';
const RELEASE_PAGE='https://github.com/tehnologydd-alt/crypto-smc/releases/tag/';
const APK_NAME='APEX9-Research-Preview-signed.apk';
export function inspectRelease(item){
 if(!item||item.draft===true||typeof item.tag_name!=='string')return null;
 const match=/^v9\.0\.([1-9][0-9]*)$/.exec(item.tag_name);
 if(!match)return null;
 const run=Number(match[1]);
 if(!Number.isSafeInteger(run)||run>999999)return null;
 if(typeof item.html_url!=='string'||item.html_url!==RELEASE_PAGE+item.tag_name)return null;
 const asset=(Array.isArray(item.assets)?item.assets:[])
  .find(x=>x&&x.name===APK_NAME&&typeof x.browser_download_url==='string'&&
    x.browser_download_url.startsWith('https://github.com/tehnologydd-alt/crypto-smc/releases/download/'+item.tag_name+'/'));
 if(!asset)return null;
 return {buildRun:run,versionName:'9.0.'+run,page:item.html_url,asset:asset.browser_download_url};
}
export function latestSignedRelease(releases){
 if(!Array.isArray(releases))return null;
 const valid=releases.map(inspectRelease).filter(Boolean);
 valid.sort((a,b)=>b.buildRun-a.buildRun);
 return valid[0]||null;
}
export function updateStatus(installed,latest){
 if(!installed||!Number.isSafeInteger(installed.buildRun)||installed.buildRun<1)
  return {state:'WEB',message:'В браузерной версии номер установленного APK недоступен.'};
 if(!latest)return {state:'NO_RELEASE',message:'Пока нет опубликованных подписанных обновлений.'};
 if(latest.buildRun<=installed.buildRun)
  return {state:'CURRENT',message:'Установлена актуальная опубликованная версия.'};
 if(!installed.signedRelease)
  return {state:'REINSTALL_ONCE',message:'Доступна подписанная версия '+latest.versionName+
    '. Для перехода со старого debug-APK потребуется один раз заменить тестовую установку. После перехода обновления смогут устанавливаться поверх.'};
 return {state:'UPDATE',message:'Доступна версия '+latest.versionName+'. Откройте официальный релиз и подтвердите установку APK.'};
}
