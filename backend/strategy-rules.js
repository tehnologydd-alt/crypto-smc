// Immutable research revisions. Older volume and swing-sweep versions remain archived.
export const RULES=Object.freeze([
  Object.freeze({key:'v0.1',category:'v0.1',title:'Структура + OB/FVG',liquidity:false,htf:false,
    description:'BOS/CHoCH + активные OB/FVG'}),
  Object.freeze({key:'v0.2-D2',category:'v0.2',title:'Структура + OB/FVG + стакан Binance',
    liquidity:true,htf:false,bookLevels:100,minImbalance:0.55,maxSnapshotLagMs:120000,
    description:'v0.1 + подтверждённый объём заявок bid/ask из depth Binance'}),
  Object.freeze({key:'v0.3-D2',category:'v0.3',title:'Стакан Binance + старший TF',
    liquidity:true,htf:true,bookLevels:100,minImbalance:0.55,maxSnapshotLagMs:120000,
    description:'v0.2-D2 + согласованность последнего закрытого старшего TF'}),
  Object.freeze({key:'v0.2-B5',category:'v0.2',title:'5-мин. фоновый WebSocket после свечи',
    liquidity:true,htf:false,background:true,bookLevels:100,minImbalance:0.55,
    description:'Отдельная гипотеза: 5 минут после структурного сигнала, без заднего числа'}),
  Object.freeze({key:'v0.3-B5',category:'v0.3',title:'5-мин. WebSocket + старший TF',
    liquidity:true,htf:true,background:true,bookLevels:100,minImbalance:0.55,
    description:'Отдельная гипотеза: 5-мин. подтверждение и закрытый старший TF'})
]);
export const ARCHIVED_RULES=Object.freeze([
  Object.freeze({key:'v0.2-D1',category:'v0.2',title:'Архив: одиночный REST-снимок стакана'}),
  Object.freeze({key:'v0.3-D1',category:'v0.3',title:'Архив: REST-снимок + старший TF'}),
  Object.freeze({key:'v0.2',category:'v0.2',title:'Архив: объём свечи'}),
  Object.freeze({key:'v0.3',category:'v0.3',title:'Архив: объём свечи + HTF'}),
  Object.freeze({key:'v0.2-L1',category:'v0.2',title:'Архив: структура ликвидности'}),
  Object.freeze({key:'v0.3-L1',category:'v0.3',title:'Архив: структура ликвидности + HTF'})
]);
export const RULE_KEYS=Object.freeze([...RULES,...ARCHIVED_RULES].map(r=>r.key));
export const ruleFor=key=>[...RULES,...ARCHIVED_RULES].find(r=>r.key===key)||null;

function averageTrueRangeBefore(bars, i, periods=14) {
  if(i<periods)return null;
  let total=0;
  for(let k=i-periods;k<i;k++){
    const b=bars[k],previous=bars[k-1]?.close??b.open;
    if(![b.high,b.low,b.open,b.close,previous].every(Number.isFinite))return null;
    total+=Math.max(b.high-b.low,Math.abs(b.high-previous),Math.abs(b.low-previous));
  }
  return total/periods;
}
function pivot(bars,index,side,span) {
  const value=side==='LONG'?bars[index]?.low:bars[index]?.high;
  if(!Number.isFinite(value)||index<span||index+span>=bars.length)return false;
  const neighbours=[...bars.slice(index-span,index),...bars.slice(index+1,index+span+1)];
  const cmp=side==='LONG'?(other)=>value<=other.low:(other)=>value>=other.high;
  const strict=side==='LONG'?(other)=>value<other.low:(other)=>value>other.high;
  return neighbours.every(cmp)&&neighbours.some(strict);
}

/**
 * Historical, reproducible SMC liquidity hypothesis:
 * 1. Two CONFIRMED, near-equal pivot lows (LONG) or highs (SHORT).
 * 2. A later closed candle sweeps the pool by >=0.05 ATR and closes back
 *    on the inner side of the level.
 * 3. The decisive BOS/CHoCH appears within the following 12 closed bars.
 * May indicate clustered resting stops, but cannot PROVE exchange liquidity.
 * No partial candles, future bars, trade volume or invented order-book values.
 */
export function liquiditySweepGate(bars, breakIndex, direction, options={}) {
  const side=direction==='up'?'LONG':direction==='down'?'SHORT':null;
  if(!side||!Array.isArray(bars)||breakIndex<20||breakIndex>=bars.length)
    return {allowed:false,reason:'NO_CLOSED_STRUCTURE'};
  const lookback=options.lookback??48,window=options.window??12,span=options.span??2,
    tolerance=options.toleranceAtr??.20,penetration=options.penetrationAtr??.05;
  const atr=averageTrueRangeBefore(bars,breakIndex);
  if(!(atr>0))return {allowed:false,reason:'NO_ATR'};
  const first=Math.max(span,breakIndex-lookback);
  const sweepStart=Math.max(first+2*span+4,breakIndex-window);
  for(let sweep=breakIndex-1;sweep>=sweepStart;sweep--){
    const candle=bars[sweep];
    if(!candle||![candle.high,candle.low,candle.close,candle.end].every(Number.isFinite))continue;
    // Both local extrema must have their confirmation candles closed BEFORE the sweep.
    const confirmed=[];
    for(let i=first;i<sweep-span;i++)if(pivot(bars,i,side,span))confirmed.push(i);
    for(let b=confirmed.length-1;b>0;b--){
      for(let a=b-1;a>=0;a--){
        const earlier=confirmed[a],later=confirmed[b];
        if(later-earlier<3)continue;
        const p1=side==='LONG'?bars[earlier].low:bars[earlier].high;
        const p2=side==='LONG'?bars[later].low:bars[later].high;
        if(Math.abs(p1-p2)>tolerance*atr)continue;
        const level=(p1+p2)/2;
        const swept=side==='LONG'?
          candle.low<level-penetration*atr&&candle.close>level:
          candle.high>level+penetration*atr&&candle.close<level;
        if(!swept)continue;
        return {allowed:true,reason:'CONFIRMED_POOL_SWEEP_RECLAIM',
          side,poolPrice:level,pivots:[bars[earlier].end,bars[later].end],
          sweepAt:candle.end,sweepIndex:sweep,
          penetrationAtr:side==='LONG'?(level-candle.low)/atr:(candle.high-level)/atr,
          atrAtBreak:atr,kind:side==='LONG'?'EQUAL_LOWS':'EQUAL_HIGHS'};
      }
    }
  }
  return {allowed:false,reason:'NO_CONFIRMED_POOL_SWEEP'};
}

// Kept only for explaining already-written v0.2/v0.3 historical rule snapshots.
// No active strategy uses this volume-based test.
export function archivedVolumeGate(bars, breakIndex, lookback=20, threshold=1.2) {
  if (!Array.isArray(bars) || breakIndex < lookback) return {allowed:false,ratio:null};
  const previous=bars.slice(breakIndex-lookback,breakIndex);
  const avg=previous.reduce((sum,c)=>sum+c.volume,0)/lookback;
  const volume=bars[breakIndex]?.volume;
  const ratio=avg>0&&Number.isFinite(volume)?volume/avg:null;
  return {allowed:ratio!=null&&ratio>=threshold,ratio};
}
