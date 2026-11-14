import {buildOfflineReport} from './offline-research-report.mjs';
const report=buildOfflineReport();
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(report.passed!==report.total)process.exitCode=1;
