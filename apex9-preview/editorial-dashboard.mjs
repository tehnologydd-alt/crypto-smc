/** Dedicated crypto news and macro pages with source and freshness labels. */
import {loadEditorialFeed} from './editorial-core.mjs';
const get=id=>document.getElementById(id);
const create=(tag,cls='',value)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
const time=t=>new Date(t).toLocaleString('ru-RU',{
 day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function initEditorialDashboard(){
 const modes=['news','macro'];
 const last={news:0,macro:0},data={news:null,macro:null};
 let active=0,controller=null;
 const show=(mode,r)=>{
  const list=get('editorial-'+mode+'-list'),status=get('editorial-'+mode+'-status');
  list.replaceChildren();
  if(r.state!=='OK'){
   status.textContent=r.state==='EMPTY'?'Свежих тематических статей за 48 часов не найдено.':
    'Новостной источник недоступен: '+r.state+(r.reason?' · '+r.reason:'');
   list.append(create('p','muted','Список пуст. Мы не подставляем старые публикации за свежие.'));
   return;
  }
  status.textContent='GDELT · '+r.articles.length+
   ' свежих публикаций за последние 48 часов · не оценка их влияния на цену';
  for(const article of r.articles){
   const item=create('article','editorial-story');
   const link=create('a','editorial-story-title',article.title);
   link.href=article.href;link.target='_blank';link.rel='noopener noreferrer';
   const meta=create('div','editorial-story-meta');
   meta.append(create('span','',article.domain),
    create('time','',time(article.observedAt)));
   item.append(link,meta);list.append(item);
  }
 };
 async function open(mode){
  if(!modes.includes(mode))return;
  if(data[mode]&&Date.now()-last[mode]<5*60000){
   show(mode,data[mode]);return;
  }
  controller?.abort();
  const seq=++active;
  controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10500);
  get('editorial-'+mode+'-status').textContent='Проверяем свежие публичные публикации…';
  try{
   const result=await loadEditorialFeed(mode,{signal:controller.signal});
   if(active!==seq)return;
   data[mode]=result;last[mode]=Date.now();show(mode,result);
  }catch(e){
   if(active===seq)show(mode,{state:'OFFLINE',articles:[],reason:String(e?.message||e)});
  }finally{
   clearTimeout(timeout);
   if(active===seq)controller=null;
  }
 }
 return {open};
}
