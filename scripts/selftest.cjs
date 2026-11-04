const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8');
const fore=fs.readFileSync(path.join(__dirname,'../src/lib/forecast.ts'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8'));
for(const feature of ['AISignalPanel','ExchangeComparison','WhaleRadar','SentimentAnalytics','OrderBlockVisualizer','AssetSelector']) assert(app.includes(feature));
for(const feature of ['takeProfit1','takeProfit2','takeProfit3','entryPrice','stopLoss','smcAgent','whaleAgent','sentimentAgent','chiefArbiter']) assert(fore.includes(feature));
assert(!pkg.dependencies?.['@google/genai']);
assert(!fs.readFileSync(path.join(__dirname,'../capacitor.config.ts'),'utf8').includes('server.url'));
console.log('Static checks: original panels + forecasting schema + standalone configuration: OK');
