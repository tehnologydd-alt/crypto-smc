/**
 * APEX 9 Market Core: local, deterministic research statistics.
 * No classic indicator library, no order execution, no price prediction.
 * Only completed, chronological OHLCV bars can influence these summaries.
 */
import {CANDLE_INTERVALS} from './candles.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const ratio=(a,b)=>b>0?a/b:null;
const median=values=>{
 const a=[...values].sort((x,y)=>x-y);
 const m=a.length>>1;
 return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;
};
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const std=a=>{
 if(a.length<3)return null;
 const avg=mean(a);
 return Math.sqrt(a.reduce((s,n)=>s+(n-avg)**2,0)/(a.length-1));
};
const empty=(reason,interval)=>({
 status:'INSUFFICIENT',reason,interval,closedBars:0,sourceAgeMs:null,
 velocityPctPerBar:null,accelerationPctPerBar2:null,volatilityPctPerBar:null,
 volumeRatio:null,rangeLow:null,rangeHigh:null,rangePosition:null,
 efficiency:null,mode:'UNKNOWN',direction:'UNKNOWN'
});

export function inspectClosedCandles(candles,interval,{maxBars=750}={}){
 const step=CANDLE_INTERVALS[interval];
 if(!step||!Array.isArray(candles)||
  !Number.isSafeInteger(maxBars)||maxBars<1||maxBars>4800)
  return {state:'INVALID',reason:'Invalid timeframe or candle list',bars:[]};
 const closed=candles.filter(x=>x?.closed===true);
 if(closed.length>maxBars)return {state:'INVALID',reason:'Too many bars',bars:[]};
 let prior=-Infinity;
 for(const c of closed){
  if(!Number.isSafeInteger(c.t)||c.t<=prior||c.t%step!==0||
     !Number.isSafeInteger(c.closeAt)||c.closeAt!==c.t+step-1||
     !finite(c.open)||!finite(c.high)||!finite(c.low)||!finite(c.close)||
     !finite(c.volume)||c.low<=0||c.open<=0||c.close<=0||
     c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close)||
     c.volume<0)return {state:'INVALID',reason:'Malformed or unordered OHLCV',bars:[]};
  prior=c.t;
 }
 return {state:closed.length?'OK':'EMPTY',reason:null,bars:closed};
}

/**
 * Direction is observed price movement, NEVER a future forecast.
 * 'velocityPctPerBar' is log-return velocity per completed interval;
 * acceleration compares two consecutive non-overlapping 4-bar averages.
 */
export function analyzeMarketFrame(candles,interval,{now=Date.now(),source='Binance Spot'}={}){
 const inspected=inspectClosedCandles(candles,interval);
 if(inspected.state==='INVALID')return {...empty(inspected.reason,interval),status:'INVALID'};
 const step=CANDLE_INTERVALS[interval],bars=inspected.bars;
 if(bars.length<22)return {...empty('Need at least 22 closed bars',interval),closedBars:bars.length};
 const recent=bars.slice(-30);
 for(let i=1;i<recent.length;i++){
  if(recent[i].t-recent[i-1].t!==step)
   return {...empty('Non-contiguous candles in recent history',interval),status:'GAP',closedBars:bars.length};
 }
 const last=recent.at(-1);
 if(!Number.isSafeInteger(now)||now<last.closeAt-60000)
  return {...empty('Invalid observation time',interval),status:'INVALID',closedBars:bars.length};
 const age=Math.max(0,now-last.closeAt);
 const status=age>2*step+60000?'STALE':'OK';
 const returns=recent.slice(1).map((b,i)=>Math.log(b.close/recent[i].close));
 const current4=mean(returns.slice(-4)),previous4=mean(returns.slice(-8,-4));
 const velocity=100*current4;
 const acceleration=100*(current4-previous4);
 const stdev=std(returns);
 const volRatio=ratio(last.volume,median(recent.slice(-21,-1).map(b=>b.volume)));
 const window=recent.slice(-20);
 const lo=Math.min(...window.map(b=>b.low)),hi=Math.max(...window.map(b=>b.high));
 const pos=hi>lo?(last.close-lo)/(hi-lo):null;
 const path=window.slice(1).reduce((sum,b,i)=>sum+Math.abs(Math.log(b.close/window[i].close)),0);
 const distance=Math.log(last.close/window[0].close);
 const efficiency=path>1e-12?Math.min(1,Math.abs(distance)/path):0;
 const direction=Math.abs(distance)<1e-10?'FLAT':distance>0?'UP':'DOWN';
 // Research heuristic, deliberately not fitted or described as predictive probability.
 const mode=efficiency>=.57?'DIRECTIONAL':efficiency<=.28?'RANGE':'MIXED';
 return {status,interval,source,closedBars:bars.length,lastClosedAt:last.closeAt,
  sourceAgeMs:age,latestClose:last.close,velocityPctPerBar:velocity,
  accelerationPctPerBar2:acceleration,
  volatilityPctPerBar:stdev===null?null:stdev*100,
  volumeRatio:volRatio,rangeLow:lo,rangeHigh:hi,rangePosition:pos,
  efficiency,mode,direction,windowBars:20,
  claim:'Descriptive history only; not a prediction or calibrated probability'};
}

export const MARKET_FRAMES=Object.freeze(['15m','1h','4h','1d']);
export function compareMarketFrames(frames,{asset}={}){
 const result=[];
 for(const interval of MARKET_FRAMES){
  const data=frames?.[interval];
  if(!data||data.interval!==interval||
     (asset&&data.asset!==asset)||
     !['OK','STALE','CACHE','RATE_LIMITED','OFFLINE','INVALID','EMPTY'].includes(data.state)){
   result.push({interval,status:'MISSING',mode:'UNKNOWN',direction:'UNKNOWN'});
   continue;
  }
  if(data.state!=='OK'){
   // Old cache may still be shown separately but never counted as current alignment.
   result.push({interval,status:data.state,mode:data.summary?.mode||'UNKNOWN',
    direction:data.summary?.direction||'UNKNOWN'});
   continue;
  }
  const summary=data.summary;
  result.push({interval,status:summary?.status||'INSUFFICIENT',
   mode:summary?.mode||'UNKNOWN',direction:summary?.direction||'UNKNOWN',
   volumeRatio:summary?.volumeRatio??null,efficiency:summary?.efficiency??null,
   lastClosedAt:summary?.lastClosedAt??null});
 }
 const available=result.filter(x=>x.status==='OK'&&
  ['UP','DOWN','FLAT'].includes(x.direction));
 const up=available.filter(x=>x.direction==='UP').length;
 const down=available.filter(x=>x.direction==='DOWN').length;
 const neutral=available.filter(x=>x.direction==='FLAT').length;
 const state=available.length<2?'INSUFFICIENT':
   up>0&&down>0?'DIVERGENT':up>=2&&down===0?'UP_CONTEXT':
   down>=2&&up===0?'DOWN_CONTEXT':'MIXED';
 return {state,asset:asset||null,available:available.length,
  counts:{up,down,neutral},frames:result,
  claim:'Agreement among observed intervals, not forecast probability'};
}
