/**
 * APEX server-side language agents. Runs on Workers Free + Workers AI,
 * with independent daily request reservation in D1.
 *
 * Important: this cap is requests, NOT exact Neuron consumption. Cloudflare's
 * own Free quota remains the final authority and stops excess use.
 * Bearer secret is for the server pilot; NEVER embed it in an Android APK.
 */
export const MODELS=Object.freeze({
 analyst:'@cf/zai-org/glm-4.7-flash',
 critic:'@cf/qwen/qwen3-30b-a3b-fp8',
});
const CAP=12; // conservative attempt ceiling shared by both language agents
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
    models:{analyst:MODELS.analyst,critic:MODELS.critic},
    note:'Availability and remaining free quota are not guaranteed by this health endpoint'});
  if(!await authorized(request,env))return json({error:'UNAUTHORIZED'},401);
  if(path==='/v1/boosters/status'&&request.method==='GET'){
   if(!env?.COMPUTE_ORIGIN||!env?.APEX_COMPUTE_TOKEN)
    return json({state:'NOT_CONFIGURED'});
   const origin=String(env.COMPUTE_ORIGIN);
   if(!origin.startsWith('https://'))return json({state:'INVALID_ORIGIN'},503);
   try{
    const r=await fetch(new URL('/v1/models/status',origin),{
     headers:{Authorization:'Bearer '+env.APEX_COMPUTE_TOKEN},
     signal:AbortSignal.timeout(4500),
    });
    if(!r.ok)return json({state:'UNAVAILABLE'},503);
    return json(await r.json());
   }catch{return json({state:'OFFLINE'},503);}
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
  let allowed=false;
  try{allowed=await reserveRequest(env.DB);}
  catch{return json({error:'QUOTA_STORE_UNAVAILABLE'},503);}
  if(!allowed)return json({error:'APEX_DAILY_ATTEMPT_CAP'},429);
  try{
   const answer=await env.AI.run(MODELS[verified.role],{
    messages:[
     {role:'system',content:instructions[verified.role]},
     {role:'user',content:JSON.stringify({evidence:verified.evidence})}
    ],
    max_tokens:650,temperature:0.2,
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
