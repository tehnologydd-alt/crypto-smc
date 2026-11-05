const fs=require('node:fs');
const s=fs.readFileSync('src/App.tsx','utf8').split('\n');
for(let i=105;i<400;i++){
 if(i>=115&&i<160 || i>=195&&i<365 || i>=380&&i<395){
  process.stdout.write(String(i+1).padStart(4,'0')+' '+s[i]+'\n');
 }
}
