/** Temporary 6.0 structure audit only; NO changes to rendered application. */
const fs=require('node:fs'),s=fs.readFileSync('src/App.tsx','utf8');
const needles=["{view==='statistics'&&<>","{view==='settings'&&","{view==='radar'&&","{view==='history'&&","{([{id:'radar'","Коллектив исследований · 5.5","Research Director · 5.0","CORE · фоновый сбор","Статистика и исследования","CORE ·","Переходы H1","Долговременная память · 5.3","APEX Learning Engine","<main id="];
const begin=s.indexOf("{view==='statistics'&&<>"),end=s.indexOf("{view==='settings'&&",begin);
console.log('APEX60 ROUTE INSPECT:',JSON.stringify({length:s.length,start:begin,end,statChars:end-begin}));
for(const k of needles){
 const at=s.indexOf(k,begin>=0?begin:0);
 console.log('APEX60 MARKER',JSON.stringify({key:k,at,relative:at-begin,
 before:at<0?'':s.slice(Math.max(0,at-230),at).replace(/\n/g,' '),
 after:at<0?'':s.slice(at,at+620).replace(/\n/g,' ')}));
}
console.log('APEX60 STATS OPEN:\n'+s.slice(begin,begin+3900));
console.log('APEX60 STATS CLOSE:\n'+s.slice(end-2400,end+900));
console.log('APEX60 NAV:\n'+s.slice(Math.max(0,s.indexOf("{([{id:'radar'")-220),s.indexOf("{([{id:'radar'")+750));
const jsxStart=s.indexOf('return (',s.indexOf('function App('));
console.log('APEX60 RENDER',s.slice(jsxStart,jsxStart+900));
console.log('APEX60 INSPECT COMPLETE');
