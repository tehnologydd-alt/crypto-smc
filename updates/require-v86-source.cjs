/** APEX 9.0: require an authentic prebuilt 8.6 source snapshot.
 * Do not replay old 2.x–8.x patches or silently substitute another version.
 * Source tree should be extracted from the user-approved 8.6 archive first.
 */
const fs=require('node:fs');
const required=['src/App.tsx','src/radar/v86-local-account-view.ts',
 'scripts/test-v86-snapshot.cjs','package.json'];
for(const file of required){
 if(!fs.existsSync(file))throw Error('APEX 8.6 baseline missing required file: '+file);
}
const app=fs.readFileSync('src/App.tsx','utf8');
if(!app.includes('РЫНОЧНЫЙ РАДАР • 8.6'))
 throw Error('Not a verified APEX 8.6 source: version label mismatch');
if(app.includes('РЫНОЧНЫЙ РАДАР • 8.7'))
 throw Error('APEX 8.7 source is intentionally not used for APEX 9');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(typeof pkg.scripts?.test!=='string'||typeof pkg.scripts?.build!=='string')
 throw Error('Incomplete source archive: missing build/test scripts');
console.log('APEX 8.6 source snapshot structurally verified. Further regression and Android tests required.');
