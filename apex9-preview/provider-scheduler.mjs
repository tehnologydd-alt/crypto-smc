/**
 * APEX 9.1 paid-provider scheduling guard (no vendor API calls).
 * Reservations are local, conservative estimates rather than actual billing.
 * Paid sources default to DISABLED until a user explicitly enables them.
 * A shared backend is required for account-wide / multiple-device enforcement.
 */
const PREFIX='apex9:metered-api-budget:v1:';
const utcDay=ms=>new Date(ms).toISOString().slice(0,10);
const utcMonth=ms=>new Date(ms).toISOString().slice(0,7);
const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9_-]{1,48}$/.test(id);
function policyValid(p){
 return Boolean(p&&Number.isSafeInteger(p.dailyLimit)&&p.dailyLimit>0&&
  Number.isSafeInteger(p.monthlyLimit)&&p.monthlyLimit>=p.dailyLimit&&
  Number.isSafeInteger(p.minGapMs)&&p.minGapMs>=0&&
  Number.isSafeInteger(p.estimatedCostCents)&&p.estimatedCostCents>0&&
  Number.isSafeInteger(p.monthlyBudgetCents)&&p.monthlyBudgetCents>0&&
  Number.isSafeInteger(p.reservedDaily)&&p.reservedDaily>=0&&
  p.reservedDaily<p.dailyLimit&&Array.isArray(p.allowedHoursUtc)&&
  p.allowedHoursUtc.length>0&&p.allowedHoursUtc.every(x=>Number.isInteger(x)&&x>=0&&x<=23));
}
export function createMeteredScheduler({storage,now=()=>Date.now()}={}){
 function record(id,at){
  if(!storage?.getItem||!storage?.setItem)throw Error('NO_PERSISTENCE');
  const prev=storage.getItem(PREFIX+id);
  const data=prev===null?null:JSON.parse(prev);
  if(data!==null&&(!Number.isSafeInteger(data.lastAt)||data.lastAt<0||
   !Number.isSafeInteger(data.monthlyUsed)||data.monthlyUsed<0||
   !Number.isSafeInteger(data.estimatedSpentCents)||data.estimatedSpentCents<0||
   !Number.isSafeInteger(data.dailyUsed)||data.dailyUsed<0||
   !Number.isSafeInteger(data.normalUsed)||data.normalUsed<0||
   typeof data.day!=='string'||typeof data.month!=='string'))
   throw Error('INVALID_LEDGER');
  if(data&&data.lastAt>at+60000)throw Error('CLOCK_ROLLBACK');
  const day=utcDay(at),month=utcMonth(at);
  const monthSame=data?.month===month,daySame=data?.day===day;
  return {day,month,lastAt:data?.lastAt||0,
   dailyUsed:daySame?data.dailyUsed:0,
   normalUsed:daySame?data.normalUsed:0,
   monthlyUsed:monthSame?data.monthlyUsed:0,
   estimatedSpentCents:monthSame?data.estimatedSpentCents:0};
 }
 function evaluate(id,policy,{enabled=false,priority='normal'}={}){
  if(!enabled)return {state:'DISABLED',allowed:false,
   reason:'Paid source disabled by default'};
  if(!validId(id)||!policyValid(policy)||!['normal','event'].includes(priority))
   return {state:'INVALID',allowed:false,reason:'Missing provider price or limits'};
  const at=now();
  if(!Number.isSafeInteger(at)||at<=0)return {state:'INVALID',allowed:false};
  let c;
  try{c=record(id,at);}catch(e){return {state:'STORAGE_UNAVAILABLE',allowed:false,
   reason:String(e.message||e)};}
  const remainingDaily=Math.max(0,policy.dailyLimit-c.dailyUsed);
  const remainingMonthly=Math.max(0,policy.monthlyLimit-c.monthlyUsed);
  const remainingBudget=Math.max(0,policy.monthlyBudgetCents-c.estimatedSpentCents);
  const base={id,at,day:c.day,month:c.month,remainingDaily,remainingMonthly,
   remainingBudgetCents:remainingBudget,estimatedSpentCents:c.estimatedSpentCents,
   nextAt:Math.max(at,c.lastAt+policy.minGapMs)};
  if(!remainingDaily||!remainingMonthly)return {...base,allowed:false,state:'QUOTA_REACHED'};
  if(remainingBudget<policy.estimatedCostCents)
   return {...base,allowed:false,state:'MONEY_BUDGET_REACHED'};
  if(priority==='normal'&&c.normalUsed>=policy.dailyLimit-policy.reservedDaily)
   return {...base,allowed:false,state:'EVENT_SLOTS_RESERVED'};
  if(at<c.lastAt+policy.minGapMs)
   return {...base,allowed:false,state:'WAIT_INTERVAL'};
  if(!policy.allowedHoursUtc.includes(new Date(at).getUTCHours())){
   const floored=Math.floor(at/3600000)*3600000;
   let nextAt=0;
   for(let hour=1;hour<=48;hour++){
    const candidate=floored+hour*3600000;
    if(policy.allowedHoursUtc.includes(new Date(candidate).getUTCHours())){
     nextAt=candidate;break;
    }
   }
   return {...base,allowed:false,state:'WAIT_SCHEDULE',nextAt};
  }
  return {...base,allowed:true,state:'READY'};
 }
 function reserve(id,policy,options={}){
  const current=evaluate(id,policy,options);
  if(!current.allowed)return current;
  try{
   const at=current.at,c=record(id,at);
   c.lastAt=at;c.dailyUsed++;c.monthlyUsed++;
   if(options.priority!=='event')c.normalUsed++;
   c.estimatedSpentCents+=policy.estimatedCostCents;
   storage.setItem(PREFIX+id,JSON.stringify(c));
   return {...current,allowed:true,state:'RESERVED',
    estimatedSpentCents:c.estimatedSpentCents,
    remainingDaily:policy.dailyLimit-c.dailyUsed,
    remainingBudgetCents:policy.monthlyBudgetCents-c.estimatedSpentCents};
  }catch(e){
   return {state:'STORAGE_UNAVAILABLE',allowed:false,
    reason:String(e.message||e)};
  }
 }
 return {evaluate,reserve};
}
