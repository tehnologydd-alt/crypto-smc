/** Android Storage Access Framework; user chooses file destination. */
import {Capacitor,registerPlugin} from '@capacitor/core';
interface AndroidVault{
 saveResearchBackup(args:{filename:string;content:string}):Promise<{saved:boolean}>;
 openResearchBackup():Promise<{content:string}>;
}
const plugin=registerPlugin<AndroidVault>('BackgroundMonitor');
const cancelled=(e:unknown)=>String(e).toLowerCase().includes('cancelled');
export async function writeResearchBackup(contents:string):Promise<boolean>{
 const date=new Date();
 const filename='APEX-Research-'+date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')+'.json';
 if(Capacitor.isNativePlatform()){
  try{return (await plugin.saveResearchBackup({filename,content:contents})).saved;}catch(e){if(cancelled(e))return false;throw e;}
 }
 const blob=new Blob([contents],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);return true;
}
export async function readResearchBackup():Promise<string|null>{
 if(Capacitor.isNativePlatform()){
  try{return (await plugin.openResearchBackup()).content;}catch(e){if(cancelled(e))return null;throw e;}
 }
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.style.display='none';document.body.appendChild(input);
  input.onchange=async()=>{const file=input.files?.[0];input.remove();if(!file){resolve(null);return;}
   if(file.size>4000000){reject(Error('Файл слишком большой'));return;}
   try{resolve(await file.text())}catch(e){reject(e)}
  };
  input.click();
 });
}
