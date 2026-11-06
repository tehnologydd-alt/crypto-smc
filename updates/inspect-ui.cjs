const fs=require('node:fs'),s=fs.readFileSync('src/App.tsx','utf8');
function dump(title,x,max=17000){console.log('\nAPEX_UI_INSPECT '+title+' LENGTH '+x.length+'\n'+x.slice(0,max)+'\n[SNIP_END]');}
const radar=s.indexOf("{view==='radar'&&"),signals=s.indexOf("{view==='history'&&"),center=s.indexOf("{view==='statistics'&&");
dump('RADAR',s.slice(radar,signals),25000);
dump('SIGNALS',s.slice(signals,center),25000);
const names=['function ScenarioCard','function ScenarioGroupCard','function GroupCard','function SignalCard','function AssetCard','function App('];
for(const name of names){let i=s.indexOf(name);if(i>=0)dump(name,s.slice(i,i+6000),6000);}
const anchors=['const [selectedDetail','const [favorites','const visibleSignals','const stats=','const marketPulse=','const [view','const openDetail','const [history','const [scenarios'];
for(const name of anchors){let i=s.indexOf(name);if(i>=0)dump('STATE '+name,s.slice(i,i+1100),1100);}
