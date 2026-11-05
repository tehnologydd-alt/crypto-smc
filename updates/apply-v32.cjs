/** APEX 3.2 Research Vault: Android file backup/restore, diagnostics, no signal changes. */
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
let app=read('src/App.tsx');
function rep(oldValue,newValue,label){if(!app.includes(oldValue))throw Error('APEX 3.2 patch missing '+label);app=app.replace(oldValue,newValue);}
const researchImport="import {studyFromStorage,freezeResearch,researchReport as summarizeResearch,researchPercent,type ResearchStudy} from './radar/research';";
rep(researchImport,researchImport+"\nimport {exportResearch,importResearch,mergeResearch,auditLearning} from './radar/vault';\nimport {writeResearchBackup,readResearchBackup} from './radar/vault-file';",'research import');
const state=" const [researchStudy,setResearchStudy]=useState<ResearchStudy|null>(()=>studyFromStorage(localStorage.getItem('apex_v31_research')));";
rep(state,state+"\n const [vaultStatus,setVaultStatus]=useState('');\n const [vaultBusy,setVaultBusy]=useState(false);",'Vault state');
const memo=" const researchReport=useMemo(()=>summarizeResearch(learning,researchStudy,Date.now()),[learning,researchStudy]);";
const handlers=[
" const vaultAudit=useMemo(()=>auditLearning(learning),[learning]);",
" const saveVault=async()=>{",
"  if(vaultBusy)return;setVaultBusy(true);setVaultStatus('');",
"  try{const content=exportResearch(learning,researchStudy);",
"   const saved=await writeResearchBackup(content);",
"   setVaultStatus(saved?'Копия исследований сохранена в выбранный файл.':'Сохранение отменено.');",
"  }catch(e){setVaultStatus('Ошибка экспорта: '+String(e));}finally{setVaultBusy(false);}",
" };",
" const restoreVault=async()=>{",
"  if(vaultBusy)return;setVaultBusy(true);setVaultStatus('');",
"  try{const file=await readResearchBackup();",
"   if(file===null){setVaultStatus('Выбор файла отменён.');return;}",
"   const archive=importResearch(file);",
"   const merged=mergeResearch(learning,researchStudy,archive);",
"   const hasNewStudy=!researchStudy&&!!merged.study;",
"   if(!merged.added&&!merged.updated&&!hasNewStudy){setVaultStatus('Все записи уже есть. Изменений нет.');return;}",
"   if(!window.confirm('Объединить резервную копию с текущими исследованиями? Добавить: '+merged.added+', обновить: '+merged.updated+'. Прежние завершённые результаты останутся защищены.')){setVaultStatus('Восстановление отменено.');return;}",
"   setLearning(merged.learning);setResearchStudy(merged.study);",
"   setVaultStatus('Восстановлено. Добавлено: '+merged.added+', обновлено: '+merged.updated+'.');",
"  }catch(e){setVaultStatus('Импорт заблокирован: '+String(e));}finally{setVaultBusy(false);}",
" };"
].join('\n');
rep(memo,memo+'\n'+handlers,'Vault handlers');
const settingMarker='   <div className="p-4 space-y-3"><h3 className="text-sm font-semibold">Уведомлять только об этапах сигналов</h3>';
rep(settingMarker,read('updates/v32-vault-ui.txt')+'\n'+settingMarker,'Vault settings panel');
rep('РЫНОЧНЫЙ РАДАР • 3.1','РЫНОЧНЫЙ РАДАР • 3.2','version label');
write('src/App.tsx',app);
for(const [from,to] of [
 ['updates/vault.ts','src/radar/vault.ts'],['updates/vault-file.ts','src/radar/vault-file.ts'],
 ['updates/test-vault.cjs','scripts/test-vault.cjs']
])fs.copyFileSync(from,to);
const pkg=JSON.parse(read('package.json'));pkg.scripts.test+=' && node scripts/test-vault.cjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
const javaPath='native/android/app/src/main/java/com/apexintelligence/monitor/BackgroundMonitorPlugin.java';
let java=read(javaPath);
const anchor='import android.content.Context;';
if(!java.includes(anchor))throw Error('APEX 3.2 Native import marker missing');
java=java.replace(anchor,anchor+'\n'+[
 'import android.app.Activity;','import android.content.Intent;','import android.net.Uri;',
 'import androidx.activity.result.ActivityResult;','import com.getcapacitor.annotation.ActivityCallback;',
 'import java.io.InputStream;','import java.io.InputStreamReader;','import java.io.OutputStream;',
 'import java.nio.charset.StandardCharsets;'
].join('\n'));
const method='    @PluginMethod public void heartbeat(PluginCall call){';
if(!java.includes(method))throw Error('APEX 3.2 Native method marker missing');
java=java.replace(method,read('updates/v32-native-vault.txt')+'\n'+method);
write(javaPath,java);
fs.appendFileSync('README.md','\n\n## APEX 3.2 Research Vault\n- Exports Learning Engine and frozen Research study with Android Storage Access Framework (user-chosen files only).\n- Imports with schema and integrity validation, conservative merging; conflicting results and incompatible frozen studies are refused.\n- Does not export API keys, credentials or user device settings. Does not execute trades or change signal logic.\n');
console.log('APEX 3.2 Research Vault integrated');
