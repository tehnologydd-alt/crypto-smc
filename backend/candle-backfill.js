const MINUTE = 60000;
const MAX_AGE = 48 * 60 * MINUTE;

// Archive closed M1 candles after downtime without replaying them as live
// entries or rewriting already recorded signal outcomes.
export async function backfillM1(symbols, missingStart, fetchPage, now = Date.now()) {
  const results = [];
  for (const symbol of symbols) {
    let startTime = missingStart(symbol, now - MAX_AGE, now);
    if (!startTime) continue;
    startTime = Math.floor(Math.max(startTime, now - MAX_AGE) / MINUTE) * MINUTE;
    let pages = 0;
    let received = 0;
    try {
      while (pages < 3 && startTime < now - MINUTE) {
        const candles = await fetchPage(symbol, startTime, 1000);
        if (!candles.length) break;
        const next = candles.at(-1).end + 1;
        if (next <= startTime || next > now) throw new Error('Неверная страница исторических M1');
        pages++;
        received += candles.length;
        startTime = next;
        if (candles.length < 1000) break;
      }
      results.push({ symbol, pages, received });
    } catch (error) { results.push({ symbol, pages, received, error: error.message }); }
  }
  return results;
}
