// Immutable research rule definitions. Once a key has gathered live outcomes,
// change the key for any parameter alteration; never rewrite historical samples.
export const RULES = Object.freeze([
  Object.freeze({ key:'v0.1', title:'Структура + OB/FVG', structure:true, obFvg:true,
    liquidity:false, htf:false, description:'Базовый BOS/CHoCH, активные OB и FVG' }),
  Object.freeze({ key:'v0.2', title:'Структура + OB/FVG + объём', structure:true, obFvg:true,
    liquidity:true, htf:false, volumeLookback:20, minVolumeRatio:1.2,
    description:'v0.1 + объём пробойной свечи ≥ 1.20 среднего предыдущих 20 закрытых свечей' }),
  Object.freeze({ key:'v0.3', title:'Структура + OB/FVG + объём + HTF', structure:true, obFvg:true,
    liquidity:true, htf:true, volumeLookback:20, minVolumeRatio:1.2,
    description:'v0.2 + согласованность режима последнего закрытого старшего TF' })
]);
export const RULE_KEYS = Object.freeze(RULES.map(rule => rule.key));
export const ruleFor = key => RULES.find(rule=>rule.key===key) || null;

// Liquidity proxy, NOT order-book depth. Only closed bars, no current/future data.
export function volumeGate(bars, breakIndex, lookback=20, threshold=1.2) {
  if (!Array.isArray(bars) || breakIndex < lookback) return { allowed:false, reason:'NO_VOLUME_HISTORY', ratio:null };
  const prior = bars.slice(breakIndex-lookback, breakIndex);
  if (prior.length!==lookback || !prior.every(c=>Number.isFinite(c.volume) && c.volume>=0))
    return {allowed:false,reason:'BAD_VOLUME_HISTORY',ratio:null};
  const reference = prior.reduce((sum,c)=>sum+c.volume,0)/lookback;
  const now = bars[breakIndex]?.volume;
  if (!(reference>0) || !(now>=0) || !Number.isFinite(now))
    return {allowed:false,reason:'ZERO_OR_BAD_VOLUME',ratio:null};
  const ratio=now/reference;
  return {allowed:ratio>=threshold,reason:ratio>=threshold?'OK':'LOW_RELATIVE_VOLUME',
    ratio,volume:now,priorAverage:reference,lookback,threshold};
}
