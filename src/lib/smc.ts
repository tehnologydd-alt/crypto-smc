import type { Candle, OrderBlock, SMCData } from '../types/crypto';

const finite = (n: number) => Number.isFinite(n) && n > 0;

export function calculateSMC(candles: Candle[], price: number): SMCData | null {
  // Use only completed 1h candles; the current incomplete candle is excluded by the caller.
  if (candles.length < 24 || !finite(price)) return null;
  const highs: number[] = [];
  const lows: number[] = [];
  const blocks: OrderBlock[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.high > candles[i-1].high && c.high >= candles[i-2].high && c.high > candles[i+1].high && c.high >= candles[i+2].high) highs.push(c.high);
    if (c.low < candles[i-1].low && c.low <= candles[i-2].low && c.low < candles[i+1].low && c.low <= candles[i+2].low) lows.push(c.low);

    const n1 = candles[i+1], n2 = candles[i+2];
    const typicalRange = Math.max(0.00000001, (candles.slice(Math.max(0,i-12),i).reduce((s,x) => s + (x.high-x.low), 0) / Math.min(12, i)));
    const bullish = c.close < c.open && n1.close > n1.open && n2.close > n2.open && n2.close > c.high && n2.close-n1.open >= typicalRange * 0.8;
    const bearish = c.close > c.open && n1.close < n1.open && n2.close < n2.open && n2.close < c.low && n1.open-n2.close >= typicalRange * 0.8;
    if (!bullish && !bearish) continue;
    const type = bullish ? 'bullish' : 'bearish';
    const mitigated = candles.slice(i+3).some(x => bullish ? x.low <= c.high : x.high >= c.low);
    const previousVolume = candles.slice(Math.max(0,i-12),i).reduce((s,x) => s + x.volume,0) / Math.min(12,i);
    // Strength is an uncalibrated relative-volume score, NOT a win probability.
    const relativeVolumeScore = Math.round(Math.min(99,Math.max(10, 50 * c.volume / Math.max(previousVolume,0.00001))));
    blocks.push({ type, levelLow:c.low, levelHigh:c.high, strength:relativeVolumeScore, mitigated, label:type==='bullish'?'Бычья свечная зона':'Медвежья свечная зона', time:c.time });
  }
  const range = candles.slice(-48);
  const min = Math.min(...range.map(c => c.low));
  const max = Math.max(...range.map(c => c.high));
  const mid = (min+max)/2;
  const last3 = candles.slice(-3);
  let fvg: SMCData['fvg'] = {present:false};
  if (last3[2].low > last3[0].high) fvg={present:true,type:'bullish',bottom:last3[0].high,top:last3[2].low,description:'Свечной дисбаланс по 3 закрытым свечам'};
  else if(last3[2].high < last3[0].low) fvg={present:true,type:'bearish',bottom:last3[2].high,top:last3[0].low,description:'Свечной дисбаланс по 3 закрытым свечам'};
  const supports = [...new Set(lows.filter(l => l < price))].sort((a,b)=>b-a).slice(0,4);
  const resistances = [...new Set(highs.filter(h => h > price))].sort((a,b)=>a-b).slice(0,4);
  const previous = candles[candles.length - 13].close;
  const current = candles[candles.length - 1].close;
  return {
    orderBlocks: blocks.filter(b=> !b.mitigated && (b.type==='bullish' ? b.levelHigh < price : b.levelLow > price)).slice(-12).reverse().slice(0,6),
    supportLevels:supports, resistanceLevels:resistances,
    marketStructure: current > previous ? 'ВОСХОДЯЩАЯ_12Ч' : current < previous ? 'НИСХОДЯЩАЯ_12Ч' : 'БОКОВАЯ_12Ч',
    fvg,
    discountZone:{min,max:mid}, premiumZone:{min:mid,max},
  };
}
