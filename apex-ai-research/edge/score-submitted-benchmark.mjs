/** Evaluate user-supplied nonfinancial benchmark responses, without contacting
 * any provider. The source/model attribution is supplied, not authenticated.
 * Never combine these reports with the APEX research archive. */
import {createHash} from 'node:crypto';
import {summarizeBenchmark,benchmarkCases,BENCHMARK_VERSION} from './offline-research-benchmark.mjs';
export function scoreSubmittedResponses(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).sort().join(',')!=='partition,responses,version'||
  input.version!==BENCHMARK_VERSION||!Array.isArray(input.responses))throw Error('INVALID_SUBMISSION');
 const pool=benchmarkCases(input.partition);
 if(input.responses.length>pool.length*2)throw Error('INVALID_SUBMISSION');
 const responses=input.responses.map(r=>{
  if(!r||Object.keys(r).sort().join(',')!=='id,role,text'||typeof r.text!=='string'||r.text.length>2400)throw Error('INVALID_SUBMISSION');
  return {id:r.id,role:r.role,text:r.text};
 }).sort((a,b)=>String(a.id).localeCompare(String(b.id))||String(a.role).localeCompare(String(b.role)));
 const result=summarizeBenchmark(input.partition,responses);
 const report={...result,kind:'USER_SUBMITTED_NONFINANCIAL_BENCHMARK',provenance:'UNVERIFIED_USER_ATTRIBUTION',
  inputSha256:createHash('sha256').update(JSON.stringify([input.version,input.partition,responses])).digest('hex'),
  actualModelCalls:0,archiveWrites:0,modelAccuracy:null};
 return report;
}
