/** Official no-key BLS Public Data API v1.
 * Monthly values are NOT release-time observations and can be revised.
 * One batched POST returns up to four preselected, fixed series.
 */
export const BLS_ENDPOINT='https://api.bls.gov/publicAPI/v1/timeseries/data/';
export const BLS_SERIES=Object.freeze([
 {id:'CUSR0000SA0',name:'CPI · все товары',unit:'индекс',kind:'CPI'},
 {id:'LNS14000000',name:'Безработица',unit:'%',kind:'RATE'},
 {id:'CES0000000001',name:'Занятость вне сельского хозяйства',unit:'тыс.',kind:'JOBS'},
 {id:'CES0500000003',name:'Средняя почасовая оплата',unit:'USD/час',kind:'WAGE'}
]);
const point=r=>{
 if(!/^\d{4}$/.test(r?.year||'')||!/^M(0[1-9]|1[0-2])$/.test(r?.period||'')||
  typeof r.value!=='string'||!/^\d+(\.\d+)?$/.test(r.value))return null;
 const year=Number(r.year),month=Number(r.period.slice(1)),value=Number(r.value);
 if(year<1990||year>2200||!Number.isFinite(value)||value>1e9)return null;
 return {year,month,value,period:r.year+'-'+String(month).padStart(2,'0'),
  preliminary:Array.isArray(r.footnotes)&&r.footnotes.some(f=>f?.code==='P')};
};
export function parseBlsIndicators(raw,{receivedAt=Date.now()}={}){
 if(!Number.isSafeInteger(receivedAt)||receivedAt<=0||
  raw?.status!=='REQUEST_SUCCEEDED'||!Array.isArray(raw?.Results)||
  !Array.isArray(raw.Results[0]?.series)||raw.Results[0].series.length>25)
  return {state:'INVALID',indicators:[],reason:'Invalid BLS response'};
 const indicators=[];
 for(const spec of BLS_SERIES){
  const series=raw.Results[0].series.filter(x=>x?.seriesID===spec.id);
  if(series.length!==1||!Array.isArray(series[0].data)||series[0].data.length>150)
   continue;
  const rows=series[0].data.map(point).filter(Boolean).sort(
   (a,b)=>b.year-a.year||b.month-a.month);
  const unique=[...new Map(rows.map(x=>[x.period,x])).values()];
  if(!unique.length)continue;
  const newest=unique[0],lastYear=unique.find(
   x=>x.month===newest.month&&x.year===newest.year-1);
  const yoy=lastYear?.value>0?
   Number((100*(newest.value/lastYear.value-1)).toFixed(3)):null;
  indicators.push({seriesId:spec.id,name:spec.name,unit:spec.unit,
   period:newest.period,value:newest.value,preliminary:newest.preliminary,
   yoyPercent:spec.kind==='CPI'?yoy:null,
   publishedAt:null,notEventTimestamp:true,notDirectionalEvidence:true});
 }
 return {state:indicators.length?'OK':'EMPTY',indicators,
  receivedAt,provider:'BLS Public Data API v1',
  coverage:indicators.length+'/'+BLS_SERIES.length,
  note:'Survey month is not the release timestamp; vintage is not verified'};
}
export async function fetchBlsIndicators({fetchImpl=fetch,now=()=>Date.now(),signal}={}){
 try{
  const response=await fetchImpl(BLS_ENDPOINT,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({seriesid:BLS_SERIES.map(x=>x.id)}),
   credentials:'omit',cache:'no-store',signal});
  if(response?.status===429||response?.status===418)
   return {state:'RATE_LIMITED',indicators:[],reason:'BLS request limit'};
  if(!response?.ok)return {state:'OFFLINE',indicators:[],
   reason:'BLS HTTP '+String(response?.status||'?')};
  return parseBlsIndicators(await response.json(),{receivedAt:now()});
 }catch(e){return {state:'OFFLINE',indicators:[],
  reason:String(e?.message||e).slice(0,140)};}
}
