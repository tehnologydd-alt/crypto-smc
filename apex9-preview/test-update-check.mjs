import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRelease,latestSignedRelease,updateStatus} from './update-check.mjs';
const make=(n,other={})=>({
 draft:false,tag_name:'v9.0.'+n,
 html_url:'https://github.com/tehnologydd-alt/crypto-smc/releases/tag/v9.0.'+n,
 assets:[{name:'APEX9-Research-Preview-signed.apk',
 browser_download_url:'https://github.com/tehnologydd-alt/crypto-smc/releases/download/v9.0.'+n+'/APEX9-Research-Preview-signed.apk'}],
 ...other
});
test('only signed assets from canonical project and tag are eligible',()=>{
 assert.equal(inspectRelease(make(12)).buildRun,12);
 assert.equal(inspectRelease(make(12,{draft:true})),null);
 assert.equal(inspectRelease(make(12,{html_url:'https://fake.example.com'})),null);
 assert.equal(inspectRelease(make(12,{assets:[]})),null);
 assert.equal(inspectRelease(make(12,{tag_name:'v9.0.bogus'})),null);
});
test('newest eligible release chosen independent of API order',()=>{
 const x=latestSignedRelease([make(10),make(7),make(20)]);
 assert.equal(x.versionName,'9.0.20');
});
test('new signed APK supports user-approved update over installed signed version',()=>{
 const state=updateStatus({buildRun:11,signedRelease:true},inspectRelease(make(12)));
 assert.equal(state.state,'UPDATE');
});
test('old debug signature requires one-time replacement',()=>{
 const state=updateStatus({buildRun:11,signedRelease:false},inspectRelease(make(12)));
 assert.equal(state.state,'REINSTALL_ONCE');
});
test('same or older release is not advertised as an update',()=>{
 const state=updateStatus({buildRun:15,signedRelease:true},inspectRelease(make(14)));
 assert.equal(state.state,'CURRENT');
});
test('web previews and absent release are disclosed',()=>{
 assert.equal(updateStatus(null,inspectRelease(make(15))).state,'WEB');
 assert.equal(updateStatus({buildRun:15,signedRelease:true},null).state,'NO_RELEASE');
});
