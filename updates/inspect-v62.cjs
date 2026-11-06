const fs=require('fs'),s=fs.readFileSync('src/App.tsx','utf8');
function emit(tag,content,max=33000){console.log('\nV62INSPECT_'+tag+'_BEGIN\n'+content.slice(0,max)+'\nV62INSPECT_'+tag+'_END');}
const setting=s.indexOf("{view==='settings'&&"),next=s.indexOf('<nav className=',setting);
emit('SETTINGS',s.slice(setting,next>setting?next:undefined),38000);
for(const name of ['function AssetDetail(','function GroupCard(','function SignalCard(','function ScenarioCard(','const [alerts,setAlerts]','const [background,setBackground]','const [earlyAlerts,setEarlyAlerts]','const [keepScreenOn,setKeepScreenOn]','const [coreNative,setCoreNative]']){
 const i=s.indexOf(name);if(i>=0)emit(name.replace(/\W/g,'_'),s.slice(i,i+(name.includes('AssetDetail')?13000:4200)),name.includes('AssetDetail')?13000:4200);
}
const path='src/index.css';if(fs.existsSync(path))emit('CSS',fs.readFileSync(path,'utf8'),12000);
