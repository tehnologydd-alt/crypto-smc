/** User-initiated Android Keystore management; no localStorage or analytics. */
import {personalNewsCapable,personalNewsStatus,
 changePersonalNewsKey,removePersonalNewsKey} from './personal-news-client.mjs';
export function initPersonalNewsControls({
 doc=globalThis.document,onChange=()=>{}
}={}){
 const root=doc?.getElementById?.('personal-news-keys');
 if(!root)return {refresh:async()=>{}};
 const label=doc.getElementById('personal-news-keys-status');
 const providers=['newsdata','cryptopanic'];
 const fields=providers.map(p=>({
  id:p,form:doc.getElementById('personal-'+p+'-form'),
  input:doc.getElementById('personal-'+p+'-key'),
  clear:doc.getElementById('personal-'+p+'-clear'),
  state:doc.getElementById('personal-'+p+'-state')
 }));
 const supported=personalNewsCapable();
 if(!supported){
  label.textContent='Личные ключи доступны только в Android APK с защищённым хранилищем.';
  for(const f of fields){
   if(f.input)f.input.disabled=true;
   f.form?.querySelector('[type="submit"]')?.setAttribute('disabled','');
   if(f.clear)f.clear.disabled=true;
   if(f.state)f.state.textContent='WEB_ONLY';
  }
  return {refresh:async()=>{}};
 }
 let busy=false;
 async function refresh(){
  const r=await personalNewsStatus();
  for(const f of fields)
   if(f.state)f.state.textContent=r.providers?.[f.id]?.configured?
    'Ключ сохранён на устройстве · реальное API-соединение проверяется в новостях':
    'Ключ не настроен';
  label.textContent=r.state==='STORAGE_UNAVAILABLE'?
   'Защищённое хранилище недоступно':
   'Android Keystore · ключи хранятся только на этом устройстве.';
 }
 for(const f of fields){
  f.form?.addEventListener('submit',async event=>{
   event.preventDefault();
   if(busy||!f.input)return;
   const key=f.input.value.trim();
   f.input.value='';
   busy=true;
   try{
    const r=await changePersonalNewsKey(f.id,key);
    label.textContent=r.state==='SAVED'?'Ключ защищённо сохранён':
     'Не удалось сохранить ключ · '+r.state;
    await refresh();
    onChange();
   }finally{busy=false;}
  });
  f.clear?.addEventListener('click',async()=>{
   if(busy)return;
   if(f.input)f.input.value='';
   busy=true;
   try{const r=await removePersonalNewsKey(f.id);
    label.textContent=r.state==='REMOVED'?'Ключ удалён с устройства':
     'Не удалось удалить ключ · '+r.state;
    await refresh();
    onChange();
   }finally{busy=false;}
  });
 }
 void refresh();
 return {refresh};
}
