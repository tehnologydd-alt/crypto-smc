import {statSync,readFileSync} from 'node:fs';
import {scoreSubmittedResponses} from './score-submitted-benchmark.mjs';
try{
 const path=process.argv[2];
 if(process.argv.length!==3||!path)throw Error('Provide a JSON response file');
 const info=statSync(path);
 if(!info.isFile()||info.size>100000)throw Error('Invalid input file');
 const report=scoreSubmittedResponses(JSON.parse(readFileSync(path,'utf8')));
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
