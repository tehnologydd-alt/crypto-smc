/**
 * Isolated, deterministic benchmark of numeric transcription and independent
 * review. Fictional laboratory readings, never market data. No provider calls,
 * credentials, scheduling, trading, or writes to research archives.
 * A caller supplies previously obtained text; no synthetic response is
 * counted as a real model response in this module.
 */
export const BENCHMARK_VERSION=1;
const rows=[
 ['lab-temp-a','TEMPERATURE_C','18.25','development'],
 ['lab-temp-b','TEMPERATURE_C','-3.5','development'],
 ['lab-length-a','LENGTH_CM','0','development'],
 ['lab-mass-a','MASS_G','125.004','development'],
 ['lab-temp-c','TEMPERATURE_C','21.125','holdout'],
 ['lab-length-b','LENGTH_CM','0.0001','holdout'],
 ['lab-mass-b','MASS_G','1000.5','holdout'],
 ['lab-temp-d','TEMPERATURE_C','-0.75','holdout']
];
const cases=Object.freeze(rows.map(([id,field,literal,partition])=>Object.freeze({id,field,literal,partition})));
export function benchmarkCases(partition){
 if(!['development','holdout'].includes(partition))throw Error('UNKNOWN_PARTITION');
 return cases.filter(c=>c.partition===partition).map(c=>({...c}));
}
export function benchmarkInput(id){
 const c=cases.find(c=>c.id===id);
 if(!c)throw Error('UNKNOWN_CASE');
 return Object.freeze({id:c.id,evidence:Object.freeze({source_id:c.id,field:c.field,text:'Fictional measurement: '+c.field+' = '+c.literal+'.'}),
  instruction:'Copy the stated measurement exactly, using one APEX_FACT|source_id|field|number line. Do not infer other facts.'});
}
export function evaluateBenchmarkText(id,text){
 const c=cases.find(c=>c.id===id);
 if(!c)throw Error('UNKNOWN_CASE');
 if(typeof text!=='string'||text.length>2400)return 'INVALID_RESPONSE';
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.startsWith('APEX_FACT|'));
 if(lines.length===0)return 'MISSING';
 if(lines.length!==1)return 'AMBIGUOUS';
 const match=/^APEX_FACT\|([a-zA-Z0-9_.:-]{4,100})\|([A-Z0-9_]{1,40})\|([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(lines[0]);
 if(!match||match[3].length>40||!Number.isFinite(Number(match[3])))return 'INVALID_FORMAT';
 if(match[1]!==c.id||match[2]!==c.field)return 'WRONG_SOURCE_OR_FIELD';
 return Number(match[3])===Number(c.literal)?'EXACT':'DIFFERENT';
}
/** One record per fixed case/model. Missing responses remain missing.
 * Input is deliberately not a file writer or cloud client.
 */
export function summarizeBenchmark(partition,responses){
 const pool=benchmarkCases(partition),ids=new Set(pool.map(c=>c.id));
 if(!Array.isArray(responses)||responses.length>pool.length*2)throw Error('INVALID_RESPONSES');
 const map=new Map();
 for(const r of responses){
  if(!r||!ids.has(r.id)||!['GLM','Qwen'].includes(r.role))throw Error('INVALID_RESPONSE_ID');
  const key=r.id+'|'+r.role;
  if(map.has(key))throw Error('DUPLICATE_RESPONSE');
  map.set(key,evaluateBenchmarkText(r.id,r.text));
 }
 const labels=['EXACT','DIFFERENT','MISSING','AMBIGUOUS','INVALID_RESPONSE','INVALID_FORMAT','WRONG_SOURCE_OR_FIELD','NOT_RUN'];
 const models=['GLM','Qwen'].map(role=>{
  const counts=Object.fromEntries(labels.map(k=>[k,0]));
  for(const c of pool)counts[map.get(c.id+'|'+role)||'NOT_RUN']++;
  return {role,cases:pool.length,submitted:pool.length-counts.NOT_RUN,counts};
 });
 return {version:BENCHMARK_VERSION,partition,cases:pool.length,models,
  actualModelCalls:0,archiveWrites:0,scope:'fictional laboratory transcription only'};
}
