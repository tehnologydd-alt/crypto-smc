/**
 * APEX budget governor. Requests are gated on the server before paid-capable
 * work. Runtime spend/Neurons is NOT observable here; provider limits still
 * apply independently. No background timers run in this Worker.
 */
export const ZONE='Europe/Kyiv';
export const LIMITS=Object.freeze({
 language:Object.freeze({daily:12,monthly:280,night:1,activeGapMs:5*60000,nightGapMs:60*60000}),
 booster:Object.freeze({daily:100,monthly:1800,night:4,activeGapMs:2*60000,nightGapMs:30*60000}),
});
export const HOURS=Object.freeze({activeFrom:8,activeUntil:23});
const time=new Intl.DateTimeFormat('en-GB',{
 timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',hourCycle:'h23',minute:'2-digit',
});
const pad=n=>String(n).padStart(2,'0');
export function schedule(at=Date.now()){
 if(!Number.isSafeInteger(at)||at<0)throw Error('Invalid clock');
 const parts=Object.fromEntries(time.formatToParts(new Date(at))
  .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const hour=Number(parts.hour);
 const day=`${parts.year}-${parts.month}-${parts.day}`;
 const mode=hour>=HOURS.activeFrom&&hour<HOURS.activeUntil?'ACTIVE':'ECO';
 // A night that crosses midnight must retain a SINGLE budget key.
 let nightKey='';
 if(mode==='ECO'){
  const nightAt=hour<HOURS.activeFrom?at-12*3600000:at;
  const local=Object.fromEntries(time.formatToParts(new Date(nightAt))
   .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  nightKey=`${local.year}-${local.month}-${local.day}`;
 }
 return {mode,zone:ZONE,localDay:day,localMonth:day.slice(0,7),
  localTime:`${pad(hour)}:${parts.minute}`,nightKey,
  activeFrom:'08:00',activeUntil:'23:00'};
}
/**
 * D1 UPSERT with one atomic conditional update for ALL counters.
 * Returns no reservation on missing storage, stale timestamp, cap or cooldown.
 * "attempts" count FAILED provider requests as well.
 */
export async function reserveBudget(db,service,at=Date.now()){
 if(!Object.hasOwn(LIMITS,service)||!db)return null;
 const clock=schedule(at),limit=LIMITS[service];
 const gap=clock.mode==='ECO'?limit.nightGapMs:limit.activeGapMs;
 const night=clock.mode==='ECO'?1:0;
 const sql=`INSERT INTO ai_budget
 (service,day_key,day_used,month_key,month_used,night_key,night_used,last_at)
 VALUES(?1,?2,1,?3,1,?4,?5,?6)
 ON CONFLICT(service) DO UPDATE SET
 day_key=excluded.day_key,
 day_used=CASE WHEN ai_budget.day_key=excluded.day_key
  THEN ai_budget.day_used+1 ELSE 1 END,
 month_key=excluded.month_key,
 month_used=CASE WHEN ai_budget.month_key=excluded.month_key
  THEN ai_budget.month_used+1 ELSE 1 END,
 night_key=excluded.night_key,
 night_used=CASE WHEN excluded.night_key=''
  THEN 0 WHEN ai_budget.night_key=excluded.night_key
  THEN ai_budget.night_used+1 ELSE 1 END,
 last_at=excluded.last_at
 WHERE excluded.last_at>=ai_budget.last_at+?7
 AND (ai_budget.day_key<>excluded.day_key OR ai_budget.day_used<?8)
 AND (ai_budget.month_key<>excluded.month_key OR ai_budget.month_used<?9)
 AND (excluded.night_key='' OR ai_budget.night_key<>excluded.night_key
  OR ai_budget.night_used<?10)
 RETURNING service,day_used,month_used,night_used,last_at`;
 const row=await db.prepare(sql).bind(service,clock.localDay,
  clock.localMonth,clock.nightKey,night,at,gap,
  limit.daily,limit.monthly,limit.night).first();
 return row?{...clock,service,attempts:row}:null;
}
export async function budgetStatus(db,at=Date.now()){
 if(!db)throw Error('D1 database not connected');
 const clock=schedule(at),usage={};
 for(const [name,limits] of Object.entries(LIMITS)){
  const row=await db.prepare(`SELECT day_key,day_used,month_key,month_used,
   night_key,night_used,last_at FROM ai_budget WHERE service=?1`)
   .bind(name).first();
  usage[name]={
   dailyUsed:row?.day_key===clock.localDay?row.day_used:0,
   dailyLimit:limits.daily,
   monthlyUsed:row?.month_key===clock.localMonth?row.month_used:0,
   monthlyLimit:limits.monthly,
   nightUsed:clock.nightKey&&row?.night_key===clock.nightKey?
    row.night_used:0,
   nightLimit:limits.night,
   nextEligibleAt:row?.last_at?
    row.last_at+(clock.mode==='ECO'?limits.nightGapMs:limits.activeGapMs):0,
  };
 }
 return {state:'POLICY_ACTIVE',clock,usage,
  billingObserved:false,neuronUsageObserved:false,
  warning:'These are internal attempt ceilings, NOT real billing or Workers AI Neuron balances. Configure provider limits and billing alerts separately.'};
}
