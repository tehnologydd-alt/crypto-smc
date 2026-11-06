const fs=require('node:fs'),s=fs.readFileSync('src/App.tsx','utf8');
function log(name,part,max=12000){console.log('\nV63_'+name+'_BEGIN\n'+part.slice(0,max)+'\nV63_'+name+'_END');}
for(const [title,needle,range] of [
 ['TYPES','type View=',1700],['SCENARIO','type Scenario=',2600],
 ['SCENARIO_STORAGE','const [scenarios,setScenarios]',6000],
 ['ASSET_STATE','const [assets,setAssets]',2900],
 ['FLOW','const candidates=',2000],
 ['FLOW2','const presentedScenarios=',2500],
 ['SCENARIO_ENGINE','updateScenarios(',2100],
 ['DEMO','const [demoTickets,setDemoTickets]',2300],
 ['NAV_HEAD','<nav',7000],
 ['MAIN','<main id="apex-content"',2100],
 ['STATUS','function groupedOpen(',4000],
 ['SCENARIO_TYPE','type ScenarioStatus=',1000]
]){const i=s.indexOf(needle);log(title,i<0?'not found':s.slice(i,i+range),range);}
const last=s.lastIndexOf('</nav>');
if(last>=0)log('NAV_FULL',s.slice(Math.max(0,last-6000),last+30),7000);
const t=s.match(/useMemo\(\(\)=>[^;]*scenarios[^;]*;/g)||[];log('SCENARIOS_MEMOS',t.slice(0,12).join('\n'),4800);
