/** Offline regression report. Fixtures are intentionally labelled synthetic.
 * No provider calls, no reading or writing user research history. */
import {createHash} from 'node:crypto';
import {benchmarkCases,evaluateBenchmarkText,summarizeBenchmark,BENCHMARK_VERSION} from './offline-research-benchmark.mjs';
export function buildOfflineReport(){
 const partitions=['development','holdout'].map(partition=>{
  const cases=benchmarkCases(partition),checks=[];
  for(const c of cases){
   const line=v=>'APEX_FACT|'+c.id+'|'+c.field+'|'+v;
   const fixtures=[
    ['exact',line(c.literal),'EXACT'],
    ['different',line(String(Number(c.literal)+1)),'DIFFERENT'],
    ['missing','Ordinary description.','MISSING'],
    ['ambiguous',line(c.literal)+'\n'+line(c.literal),'AMBIGUOUS'],
    ['invalid',line('NaN'),'INVALID_FORMAT'],
    ['wrong_source',line(c.literal).replace(c.id,'unrelated-source'),'WRONG_SOURCE_OR_FIELD'],
    ['wrong_field',line(c.literal).replace(c.field,'OTHER_FIELD'),'WRONG_SOURCE_OR_FIELD'],
    ['invalid_response',null,'INVALID_RESPONSE']
   ];
   for(const [scenario,text,expected] of fixtures){
    const actual=evaluateBenchmarkText(c.id,text);
    checks.push({id:c.id,scenario,expected,actual,passed:actual===expected});
   }
  }
  return {partition,caseCount:cases.length,passed:checks.filter(c=>c.passed).length,total:checks.length,checks,
   modelResults:summarizeBenchmark(partition,[])};
 });
 const report={schema:1,benchmarkVersion:BENCHMARK_VERSION,kind:'SYNTHETIC_PARSER_REGRESSION',
  partitions,passed:partitions.reduce((n,p)=>n+p.passed,0),total:partitions.reduce((n,p)=>n+p.total,0),
  cloudCalls:0,archiveWrites:0,modelAccuracy:null};
 return {...report,sha256:createHash('sha256').update(JSON.stringify(report)).digest('hex')};
}
