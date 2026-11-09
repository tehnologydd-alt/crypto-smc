/**
 * BLS's official no-key iCalendar of US statistical RELEASES (not actuals).
 * Strict UTC/US-Eastern timestamp handling and no fabricated event dates.
 * Browser restrictions or BLS 403 are reported as source unavailable.
 */
export const BLS_ICAL_URL='https://www.bls.gov/schedule/news_release/bls.ics';
const TYPES=[
 ['CPI',/Consumer Price Index/i],
 ['PPI',/Producer Price Index/i],
 ['EMPLOYMENT',/Employment Situation/i],
 ['JOLTS',/Job Openings and Labor Turnover/i],
 ['ECI',/Employment Cost Index/i],
 ['EARNINGS',/Real Earnings/i],
 ['PRODUCTIVITY',/Productivity and Costs/i],
 ['IMPORT_EXPORT',/Import and Export Price/i]
];
function easternTime(utcComponents){
 const [y,m,d,h,min,s]=utcComponents;
 const target=Date.UTC(y,m-1,d,h,min,s);
 let guess=target;
 const formatter=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',hourCycle:'h23',year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'
 });
 for(let n=0;n<3;n++){
  const entries=Object.fromEntries(formatter.formatToParts(new Date(guess))
   .filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  const seen=Date.UTC(entries.year,entries.month-1,entries.day,
   entries.hour,entries.minute,entries.second);
  guess+=target-seen;
 }
 const final=Object.fromEntries(formatter.formatToParts(new Date(guess))
  .filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
 if(Date.UTC(final.year,final.month-1,final.day,final.hour,
  final.minute,final.second)!==target)return null;
 return guess;
}
export function parseBlsDate(value,attribute=''){
 const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value||'');
 if(!m)return null;
 const parts=m.slice(1,7).map(Number);
 const [y,mo,d,h,minute,s]=parts;
 const utc=Date.UTC(y,mo-1,d,h,minute,s);
 if(!Number.isFinite(utc)||new Date(utc).getUTCFullYear()!==y||
  new Date(utc).getUTCMonth()+1!==mo||new Date(utc).getUTCDate()!==d||
  h>23||minute>59||s>59)return null;
 if(m[7]==='Z')return utc;
 if(/TZID=(?:America\/New_York|US\/Eastern)/i.test(attribute))
  return easternTime(parts);
 return null;
}
export function parseBlsCalendar(raw,{now=Date.now()}={}){
 if(typeof raw!=='string'||raw.length>1200000||
  !raw.includes('BEGIN:VCALENDAR')||!raw.includes('END:VCALENDAR')||
  !Number.isSafeInteger(now))return {state:'INVALID',events:[],
   reason:'Invalid BLS calendar data'};
 const lines=raw.replace(/\r\n/g,'\n').split('\n'),unfolded=[];
 for(const line of lines){
  if(/^[ \t]/.test(line)&&unfolded.length)
   unfolded[unfolded.length-1]+=line.slice(1);
  else unfolded.push(line);
 }
 let fields=null,seen=new Set(),events=[];
 function finish(){
  if(!fields)return;
  const title=String(fields.summary||'').replace(/\\[nN]/g,' ')
   .replace(/\\([,;\\])/g,'$1').replace(/[\x00-\x1F]/g,' ')
   .trim().slice(0,180);
  const type=TYPES.find(x=>x[1].test(title))?.[0];
  const at=parseBlsDate(fields.start,fields.startAttr);
  if(!type||!Number.isSafeInteger(at)||
   at<now-48*3600000||at>now+70*86400000)return;
  const id=fields.uid||title+':'+at;
  if(seen.has(id))return;
  seen.add(id);
  events.push({id:String(id).slice(0,150),title,kind:type,at,
   source:'BLS_OFFICIAL_CALENDAR',provider:'U.S. Bureau of Labor Statistics',
   sourceUrl:'https://www.bls.gov/schedule/news_release/',
   status:'SCHEDULED_NOT_RELEASED',impact:'UNVERIFIED'});
 }
 for(const line of unfolded){
  if(line==='BEGIN:VEVENT'){fields={};continue;}
  if(line==='END:VEVENT'){finish();fields=null;continue;}
  if(!fields)continue;
  const ix=line.indexOf(':');
  if(ix<0)continue;
  const header=line.slice(0,ix),value=line.slice(ix+1);
  const name=header.split(';')[0].toUpperCase();
  if(name==='UID')fields.uid=value;
  if(name==='SUMMARY')fields.summary=value;
  if(name==='DTSTART'){fields.start=value;fields.startAttr=header;}
 }
 events.sort((a,b)=>a.at-b.at||a.title.localeCompare(b.title));
 return {state:events.length?'OK':'EMPTY',events:events.slice(0,50),
  reason:events.length?'Publication schedule; no actual values or price impact':
   'No supported upcoming events in the fetched BLS calendar'};
}
export async function loadBlsCalendar({fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 try{
  const response=await fetchImpl(BLS_ICAL_URL,{
   method:'GET',credentials:'omit',cache:'no-store',signal
  });
  if(response?.status===429||response?.status===418)
   return {state:'RATE_LIMITED',events:[],reason:'BLS rate-limited the calendar'};
  if(!response?.ok)
   return {state:'OFFLINE',events:[],reason:'BLS HTTP '+(response?.status||'?')};
  const source=await response.text();
  return parseBlsCalendar(source,{now:now()});
 }catch(e){
  return {state:'OFFLINE',events:[],reason:String(e?.message||e).slice(0,130)};
 }
}
