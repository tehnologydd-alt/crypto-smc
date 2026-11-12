/**
 * Publication delay diagnostic shared with Android native source policy.
 * Pure presentation only: never rewrite a published forecast, entry or result.
 * Freshness is measured from the genuine CLOSED source candle, not from P
 * drawn on a chart or from the next M1 evaluator close.
 */
export const PUBLICATION_MAX_DELAY=Object.freeze({
 '15m':90_000,'1h':180_000,'4h':300_000
});
const STEPS=Object.freeze({'1m':60_000,'15m':900_000,
 '1h':3_600_000,'4h':14_400_000});
export function publicationTiming(scenario){
 const frame=scenario?.sourceInterval||scenario?.interval;
 const maxDelay=PUBLICATION_MAX_DELAY[frame];
 const anchor=scenario?.anchorCloseAt;
 const at=scenario?.publishedAt;
 if(!maxDelay||!Number.isSafeInteger(anchor)||anchor<=0||
  !Number.isSafeInteger(at)||at<=anchor)
  return {state:'UNAVAILABLE'};
 const lagMs=at-anchor;
 return {state:lagMs>maxDelay?'LATE':'FRESH',lagMs,
  seconds:Math.floor(lagMs/1000),limitMs:maxDelay,interval:frame};
}
/**
 * A market bar can only represent an instantaneous event *somewhere inside*
 * its time range. Map the P marker to the ACTUAL publication bar, NEVER the
 * preceding reference (anchor) candle.
 * This is not a claim that a level was available from the candle open.
 */
export function publishedBarCloseAt(publishedAt,interval){
 const step=STEPS[interval];
 if(!step||!Number.isSafeInteger(publishedAt)||publishedAt<=0)return null;
 return Math.floor(publishedAt/step)*step+step-1;
}
export function publicationCaveat(scenario){
 const timing=publicationTiming(scenario);
 if(timing.state!=='LATE')return '';
 const delay=Math.round(timing.seconds/60);
 return 'Исследование опубликовано с задержкой примерно '+delay+
  ' мин после закрытия опорной свечи. Уровень E за это время '+
  'мог потерять актуальность. До публикации касания не засчитываются; '+
  'запись не означает исполненную сделку.';
}
