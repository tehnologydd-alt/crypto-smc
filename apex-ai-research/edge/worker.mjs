/**
 * APEX server-side language agents. Runs on Workers Free + Workers AI,
 * with independent daily request reservation in D1.
 *
 * Important: this cap is requests, NOT exact Neuron consumption. Cloudflare's
 * own Free quota remains the final authority and stops excess use.
 * Bearer secret is for the server pilot; NEVER embed it in an Android APK.
 */
import {budgetStatus,reserveBudget,schedule} from './budget-governor.mjs';
export const MODELS=Object.freeze({
 analyst:'@cf/zai-org/glm-4.7-flash',
 critic:'@cf/qwen/qwen3.8-27b',
});
const CAP=12; // conservative attempt ceiling shared by both language agents
const BOOSTER_FEATURES=Object.freeze([
 'return_1m','return_5m','volatility_15m','volume_z_15m',
 'spread_bps','book_imbalance','large_trade_pressure',
 'whale_flow_score','relative_volume','cross_venue_disagreement'
]);
export function validateBoosterPayload(value){
 const obs=value?.observation;
 if(!obs||!(/^[A-Z0-9]{2,24}$/.test(obs.asset||''))||
  !Array.isArray(obs.source_ids)||!obs.source_ids.length||
  obs.source_ids.length>20||obs.source_ids.some(x=>
   typeof x!=='string'||!x.trim()||x.length>100))
   return null;
 const features=obs.features;
 if(!features||typeof features!=='object'||Array.isArray(features)||
  Object.keys(features).length!==BOOSTER_FEATURES.length||
  BOOSTER_FEATURES.some(x=>
   typeof features[x]!=='number'||!Number.isFinite(features[x])))
   return null;
 return {observation:{asset:obs.asset,
  source_ids:obs.source_ids,features:Object.fromEntries(
   BOOSTER_FEATURES.map(x=>[x,features[x]]))}};
}

const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{
  'Content-Type':'application/json;charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
 }});
async function equal(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!b||a.length>512||b.length>512)
  return false;
 const [x,y]=await Promise.all([a,b].map(s=>
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
 const left=new Uint8Array(x),right=new Uint8Array(y);
 let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
export async function authorized(request,env){
 const secret=env?.APEX_EDGE_TOKEN;
 const bearer=request.headers.get('Authorization')||'';
 if(!secret||!bearer.startsWith('Bearer '))return false;
 return equal(bearer.slice(7),secret);
}
function cleanEvidence(items){
 if(!Array.isArray(items)||items.length<1||items.length>16)return null;
 const safe=[];
 for(const x of items){
  if(!x||typeof x.source_id!=='string'||!x.source_id.trim()||
   x.source_id.length>100||typeof x.text!=='string'||x.text.length>1500||
   typeof x.observed_at!=='number'||!Number.isFinite(x.observed_at))
   return null;
  safe.push({source_id:x.source_id,observed_at:x.observed_at,text:x.text});
 }
 return safe;
}
export function validateAgentInput(input){
 if(!input||!Object.hasOwn(MODELS,input.role))return null;
 const evidence=cleanEvidence(input.evidence);
 if(!evidence)return null;
 return {role:input.role,evidence};
}
export async function reserveRequest(db,at=Date.now()){
 if(!db)return false;
 const key=new Date(at).toISOString().slice(0,10);
 const row=await db.prepare(`INSERT INTO ai_usage(day_key,attempts)
 VALUES(?1,1) ON CONFLICT(day_key) DO UPDATE SET
 attempts=ai_usage.attempts+1 WHERE ai_usage.attempts<${CAP}
 RETURNING attempts`).bind(key).first();
 return Boolean(row);
}
function extractText(result){
 if(typeof result?.response==='string')return result.response;
 const choice=result?.choices?.[0]?.message?.content;
 if(typeof choice==='string')return choice;
 return null;
}
const instructions={
 analyst:'You are an evidence auditor. Identify themes in verified observations. Cite only source_id values that are actually provided. State uncertainty, stale data, and disagreement. Do not create prices or trading instructions.',
 critic:'You are an independent scientific critic. Challenge causal assumptions, detect confounding and leakage, and identify missing evidence. Cite only given source_id values. Do not suggest trades or invent data.'
};
/** Read at most 25 KB of evidence to protect 128 MB Workers Free memory. */
async function readBoundedJson(request){
 if(!request.body)return null;
 const reader=request.body.getReader();
 const chunks=[];
 let total=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>25000){await reader.cancel();return null;}
   chunks.push(value);
  }
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
 }catch{return null;}
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')
   return json({service:'apex-ai-edge',state:'RUNNING',
    activity:schedule().mode,
    models:{analyst:MODELS.analyst,critic:MODELS.critic},
    note:'Availability and remaining free quota are not guaranteed by this health endpoint'});
  if(!await authorized(request,env))return json({error:'UNAUTHORIZED'},401);
  if(path==='/v1/budget/status'&&request.method==='GET'){
   try{return json(await budgetStatus(env?.DB));}
   catch{return json({state:'BUDGET_STORE_UNAVAILABLE'},503);}
  }
  if(path==='/v1/boosters/status'&&request.method==='GET'){
   if(!env?.COMPUTE_ORIGIN||!env?.APEX_COMPUTE_TOKEN)
    return json({state:'NOT_CONFIGURED'});
   const origin=String(env.COMPUTE_ORIGIN);
   if(!origin.startsWith('https://'))return json({state:'INVALID_ORIGIN'},503);
   let statusReservation;
   try{statusReservation=await reserveBudget(env?.DB,'booster');}
   catch{return json({state:'BUDGET_STORE_UNAVAILABLE'},503);}
   if(!env?.DB)return json({state:'BUDGET_STORE_UNAVAILABLE'},503);
   if(!statusReservation)return json({state:'BUDGET_GUARD_BLOCKED',mode:schedule().mode},429);
   try{
    const r=await fetch(new URL('/v1/models/status',origin),{
     headers:{Authorization:'Bearer '+env.APEX_COMPUTE_TOKEN},
     signal:AbortSignal.timeout(4500),
    });
    if(!r.ok)return json({state:'UNAVAILABLE'},503);
    return json(await r.json());
   }catch{return json({state:'OFFLINE'},503);}
  }
  if(path==='/v1/boosters/predict'&&request.method==='POST'){
   if(!env?.COMPUTE_ORIGIN||!env?.APEX_COMPUTE_TOKEN)
    return json({state:'NOT_CONFIGURED'},503);
   const origin=String(env.COMPUTE_ORIGIN);
   if(!origin.startsWith('https://'))return json({state:'INVALID_ORIGIN'},503);
   const data=await readBoundedJson(request);
   if(!data)return json({error:'INVALID_JSON_OR_TOO_LARGE'},400);
   const observation=validateBoosterPayload(data);
   if(!observation)return json({error:'INVALID_OBSERVATION'},422);
   let reservation;
   try{reservation=await reserveBudget(env?.DB,'booster');}
   catch{return json({state:'BUDGET_STORE_UNAVAILABLE'},503);}
   if(!env?.DB)return json({state:'BUDGET_STORE_UNAVAILABLE'},503);
   if(!reservation)return json({state:'BUDGET_GUARD_BLOCKED',mode:schedule().mode},429);
   try{
    const result=await fetch(new URL('/v1/predict',origin),{
     method:'POST',headers:{
      'Content-Type':'application/json',
      Authorization:'Bearer '+env.APEX_COMPUTE_TOKEN
     },
     body:JSON.stringify(observation),
     signal:AbortSignal.timeout(7000),
    });
    if(result.status===409)return json({state:'NOT_TRAINED'},409);
    if(!result.ok)return json({state:'COMPUTE_UNAVAILABLE'},503);
    const payload=await result.json();
    if(payload?.state!=='MODEL_ESTIMATE'||
       typeof payload.model_version!=='string'||
       !/^[A-Za-z0-9]{1,48}$/.test(payload.model_version)||
       !Array.isArray(payload.source_ids)||
       JSON.stringify(payload.source_ids)!==
        JSON.stringify(observation.observation.source_ids)||
       !['xgboost_p','lightgbm_p','disagreement'].every(key=>
        typeof payload[key]==='number'&&Number.isFinite(payload[key])&&
        payload[key]>=0&&payload[key]<=1))
      return json({state:'INVALID_COMPUTE_RESPONSE'},503);
    return json(payload);
   }catch{return json({state:'COMPUTE_OFFLINE'},503);}
  }
  if(path!=='/v1/agents/analyze'||request.method!=='POST')
   return json({error:'NOT_FOUND'},404);
  if(!env?.AI||!env?.DB)return json({error:'NOT_CONFIGURED'},503);
  const size=Number(request.headers.get('Content-Length')||0);
  if(size>25000)return json({error:'TOO_LARGE'},413);
  const input=await readBoundedJson(request);
  if(!input)return json({error:'INVALID_JSON_OR_TOO_LARGE'},400);
  const verified=validateAgentInput(input);
  if(!verified)return json({error:'INVALID_EVIDENCE'},422);
  let reservation=null;
  try{reservation=await reserveBudget(env.DB,'language');}
  catch{return json({error:'QUOTA_STORE_UNAVAILABLE'},503);}
  if(!reservation)return json({error:'APEX_DAILY_ATTEMPT_CAP',
   mode:schedule().mode},429);
  try{
   const answer=await env.AI.run(MODELS[verified.role],{
    messages:[
     {role:'system',content:instructions[verified.role]},
     {role:'user',content:JSON.stringify({evidence:verified.evidence})}
    ],
    max_completion_tokens:650,temperature:0.2,
   });
   const response=extractText(answer);
   if(!response)return json({error:'EMPTY_MODEL_OUTPUT'},503);
   return json({state:'OBSERVED_MODEL_OUTPUT',role:verified.role,
    model:MODELS[verified.role],text:response,
    source_ids:verified.evidence.map(e=>e.source_id),
    notice:'Independent research commentary, not a verified forecast'});
  }catch{return json({error:'MODEL_QUOTA_OR_UNAVAILABLE'},503);}
 }
};
