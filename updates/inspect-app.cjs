const fs=require('node:fs');
const s=fs.readFileSync('src/App.tsx','utf8').split('\n');
const pattern=/\bfavorites\b|\bcandidates\b|\bassets\b|setScenarios|refreshAsset|WebSocket|socket|loadCandles|startStream|subscribe|marketPulse|demoTickets|reconcileLearning/;
const idx=[];
for(let i=0;i<s.length;i++)if(pattern.test(s[i]))idx.push(i);
const seen=new Set();
for(const i of idx){
 for(let j=Math.max(0,i-2);j<=Math.min(s.length-1,i+2);j++){
  if(seen.has(j))continue;seen.add(j);
  process.stdout.write(String(j+1).padStart(4,'0')+' '+s[j]+'\n');
 }
}
