/**
 * UI-only expired-unverified research archive. Never writes COMPLETED,
 * STOP, TP, or an invented outcome to immutable Android Room.
 * Native source/level verification can still happen independently.
 */
const HOUR=3600000;
const horizons={'15m':4*HOUR,'1h':24*HOUR,'4h':4*24*HOUR};
export function forecastExpiredUnverified(row,{now=Date.now()}={}){
 if(!row||typeof row.id!=='string'||
  !/^(direction2|direction3):[A-Z0-9]{5,20}:(15m|1h|4h):\d{10,16}$/.test(row.id)||
  !Number.isSafeInteger(now)||now<=0||row.evaluation)return null;
 const horizon=horizons[row.interval];
 if(!horizon||!Number.isSafeInteger(row.publishedAt)||
  row.publishedAt<=0||row.publishedAt>now)return null;
 let h=row.hypothesis;
 if(typeof h==='string'){try{h=JSON.parse(h)}catch{return null}}
 const end=h?.targetCloseAt;
 const anchor=h?.anchorCloseAt;
 if(!Number.isSafeInteger(end)||!Number.isSafeInteger(anchor)||
  anchor<=0||row.publishedAt<anchor||row.publishedAt>end||
  end-anchor!==horizon)return null;
 // 15 minutes for late native WorkManager/Room finalization; never claim
 // a forecast failed simply because a background job has not executed.
 const allowance=15*60_000;
 if(now<=end+allowance)return null;
 return {state:'EXPIRED_UNVERIFIED',until:end,
  note:'Истёк срок исследования, но подтверждённый исход Room отсутствует. '+
   'Перенесено в архив без результата; это не TP и не SL.'};
}
export function filterForecastJournal(rows,{hiddenIds=[],now=Date.now()}={}){
 const hidden=new Set(hiddenIds);
 const active=[],expired=[],suppressed=[];
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row?.id)continue;
  if(hidden.has(row.id)){suppressed.push(row);continue;}
  const stale=forecastExpiredUnverified(row,{now});
  if(stale)expired.push({...row,archiveReason:stale.note});
  else active.push(row);
 }
 return {active,expired,suppressed};
}
