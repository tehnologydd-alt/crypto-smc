import { getPreferences, savePreferences, syncPreferences } from './notification-settings.js';
import { initWakeLock } from './wake.js';
import { journey, isFinished, levelSegments } from './signal-journey.js';
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const symbol = (params.get('symbol') || '').toUpperCase();
const preview = params.has('preview');
let market = params.get('market') === 'futures' ? 'futures' : 'spot';
let interval = ['1m', '5m', '15m', '30m', '1h', '4h'].includes(params.get('interval')) ? params.get('interval') : '15m';
let selectedId = params.get('signal') || null;
let assetScope = 'current', chartAnchorAt = null, chartFocusPinned = false; // null: latest
let asset = null, requestSerial = 0, hovered = -1, chartBars = [], chartLeft = 8, chartBarWidth = 1;
const token = localStorage.getItem('orbit-token') || '';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: Number(value) < 1 ? 6 : Number(value) < 100 ? 4 : 2 }) : '—';
const compact = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(value)) : '—';
const date = value => new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const tfName = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4' };
const stateName = { WAITING: 'Ожидает вход', OPEN: 'В работе', STOPPED: 'Стоп', COMPLETED: 'TP3 достигнут', CANCELLED: 'Отменён', EXPIRED: 'Истёк', UNCERTAIN: 'Проверить вручную' };
initWakeLock();

if (!/^[A-Z0-9]{2,16}USDT$/.test(symbol)) {
  $('#assetError').textContent = 'Неверный актив'; $('#assetError').classList.remove('hidden');
} else {
  $('#assetTitle').textContent = `${symbol.slice(0, -4)} / USDT`;
  document.title = `${symbol} · Orbit Signals`;
  $('#backLink').href = preview ? '/?preview=1' : '/';
  document.querySelectorAll('.bottom-item').forEach(link => {
    const next = new URL('/', location.origin);
    if (preview) next.searchParams.set('preview', '1');
    if (link.dataset.page !== 'market') next.searchParams.set('page', link.dataset.page);
    link.href = next.pathname + next.search;
  });
  if (preview) $('#assetPreview').classList.remove('hidden');
  syncTabs(); loadAsset(); loadLargeTrades(); loadOrderBooks();
  setInterval(loadAsset, 60000); setInterval(loadLargeTrades, 5000);
  setInterval(loadOrderBooks, 2500);
}

function renderBook(marketType,book) {
  const prefix=marketType==='spot'?'bookSpot':'bookFutures';
  const status=$('#'+prefix+'Status'), totals=$('#'+prefix+'Totals');
  const bids=$('#'+prefix+'Bids'),asks=$('#'+prefix+'Asks');
  const change=$('#'+prefix+'Change');
  const live=book?.status==='live' && (book.ageMs??Infinity)<=10000;
  if(!live){
    status.textContent=book?.status==='stale'?'Устарел':book?.status==='offline'?'Нет связи':'Синхронизация…';
    status.classList.remove('active');
    totals.textContent='Нет актуального синхронизированного стакана';
    change.textContent='Сигналы D2 не подтверждаются без непрерывных данных';
    bids.textContent='—';asks.textContent='—';
    $('#'+prefix+'BidBar').style.width='0%';
    $('#'+prefix+'AskBar').style.width='0%';return;
  }
  status.textContent=`● WS · ${Math.round(book.ageMs/1000)}с · №${book.lastUpdateId}`;
  status.classList.add('active');
  const pct=Math.round(book.imbalance*100);
  totals.innerHTML=`<div><small>BID · ${pct}%</small><strong>${compact(book.bidUsdt)} USDT</strong></div>
    <div><small>ASK · ${100-pct}%</small><strong>${compact(book.askUsdt)} USDT</strong></div>
    <div><small>СПРЕД</small><strong>${Number(book.spreadPct).toFixed(3)}%</strong></div>`;
  $('#'+prefix+'BidBar').style.width=pct+'%';
  $('#'+prefix+'AskBar').style.width=(100-pct)+'%';
  const ch=n=>n==null?'—':`${n>=0?'+':''}${n.toFixed(1)}%`;
  change.textContent=`Δ30с: bid ${ch(book.bidChangePct)} · ask ${ch(book.askChangePct)} · ${book.observations} наблюдений · ${book.updates} обновлений`;
  const levels=(rows,cls)=>(rows||[]).slice(0,6).map(level=>`
    <div class="book-level ${cls}"><span>${number(level.price)}</span><strong>${compact(level.usdt)}</strong></div>`).join('');
  bids.innerHTML=levels(book.bids,'bid');
  asks.innerHTML=levels(book.asks,'ask');
}
let bookRequest=0;
async function loadOrderBooks() {
  const serial=++bookRequest;
  try{
    const response=await fetch('/api/order-book/'+encodeURIComponent(symbol),
      {headers:token?{Authorization:'Bearer '+token}:{}});
    const body=await response.json();
    if(!response.ok)throw Error(body.error||'HTTP '+response.status);
    if(serial!==bookRequest)return;
    renderBook('spot',body.spot);renderBook('futures',body.futures);
    $('#bookUpdateStatus').textContent='WS · обновление каждые ~2,5с';
  }catch(error){
    if(serial!==bookRequest)return;
    renderBook('spot',null);renderBook('futures',null);
    $('#bookUpdateStatus').textContent='Нет связи';
  }
}
async function loadLargeTrades() {
  const selectedMarket = market;
  try {
    const response = await fetch(`/api/large-trades/${encodeURIComponent(symbol)}?market=${selectedMarket}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const flow = await response.json();
    if (!response.ok) throw new Error(flow.error || `HTTP ${response.status}`);
    if (selectedMarket !== market) return;
    $('#largeTradesStatus').textContent = flow.status === 'live' ? '● онлайн' : '● нет связи';
    $('#largeTradesStatus').classList.toggle('active', flow.status === 'live');
    $('#largeTradesTotals').innerHTML = `<div><span>КРУПНЫЕ ПОКУПКИ</span><strong>${flow.buyCount} · ${compact(flow.buyUsd)} USDT</strong></div><div><span>КРУПНЫЕ ПРОДАЖИ</span><strong>${flow.sellCount} · ${compact(flow.sellUsd)} USDT</strong></div>`;
    $('#largeTradesList').innerHTML = flow.recent.length ? flow.recent.slice(0, 5).map(trade => `<div class="large-trade-row"><span class="${trade.side}">${trade.side === 'buy' ? 'Покупка' : 'Продажа'}</span><strong>${compact(trade.usd)} USDT</strong><small>${date(trade.at)} · ${number(trade.price)}</small></div>`).join('') : '<div class="large-trade-empty">За время наблюдения сделок выше порога пока нет.</div>';
  } catch (error) {
    if (selectedMarket !== market) return;
    $('#largeTradesStatus').textContent = '● недоступно';
    $('#largeTradesStatus').classList.remove('active');
    $('#largeTradesTotals').textContent = `Данные недоступны: ${error.message}`;
    $('#largeTradesList').textContent = '';
  }
}

function syncTabs() {
  document.querySelectorAll('[data-market]').forEach(button => button.classList.toggle('active', button.dataset.market === market));
  document.querySelectorAll('[data-interval]').forEach(button => button.classList.toggle('active', button.dataset.interval === interval));
  const next = new URL(location.href); next.searchParams.set('market', market); next.searchParams.set('interval', interval);
  if (selectedId) next.searchParams.set('signal', selectedId); else next.searchParams.delete('signal');
  history.replaceState(null, '', next);
}
async function loadAsset() {
  const serial = ++requestSerial;
  try {
    const minutes = { '1m':1, '5m':5, '15m':15, '30m':30, '1h':60, '4h':240 }[interval] || 15;
    const startTime = chartAnchorAt == null ? '' : `&startTime=${Math.max(1, chartAnchorAt - 40 * minutes * 60000)}`;
    const url = `/api/asset/${encodeURIComponent(symbol)}?market=${market}&interval=${interval}${startTime}`;
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    if (serial !== requestSerial) return;
    asset = body; hovered = -1;
    if (preview) { asset.signals = [sampleSignal(body)]; if (!selectedId) selectedId = 'demo'; }
    const selected = selectedSignal();
    if (selectedId && selected) {
      assetScope = isFinished(selected) ? 'finished' : 'current';
      if (chartAnchorAt === null && !chartFocusPinned) {
        const anchor = journey(selected).entry?.at || selected.detectedAt;
        if (Number.isFinite(anchor) && anchor > 0) {
          chartAnchorAt = anchor;
          chartFocusPinned = true;
          if (anchor < asset.candles[0]?.time || anchor > asset.candles.at(-1)?.end) {
            loadAsset();
            return;
          }
        }
      }
    }
    $('#assetError').classList.add('hidden');
    render();
  } catch (error) {
    if (serial !== requestSerial) return;
    $('#assetError').textContent = `Не удалось загрузить обзор: ${error.message}`;
    $('#assetError').classList.remove('hidden');
  }
}
function sampleSignal(body) {
  const price = body.lastM1?.price || body.candles.at(-1)?.close || 100;
  const isLong = body.market === 'spot';
  const entry = price * (isLong ? .995 : 1.005);
  const risk = price * .008;
  const stop = entry + (isLong ? -risk : risk);
  const block = body.candles.at(-18) || body.candles.at(-1);
  return { id: 'demo', symbol, market: body.market, timeframe: body.interval === '1m' ? '15m' : body.interval,
    side: isLong ? 'LONG' : 'SHORT', state: 'WAITING', hitTargets: 0, detectedAt: Date.now() - 60000,
    blockTime: block?.time, swing: body.structure?.swings?.at(-1)?.price,
    imbalance: { direction: isLong ? 'up' : 'down', time: body.candles.at(-10)?.time, low: entry - price * .003, high: entry - price * .001 },
    entryLow: entry - price * .0015, entryHigh: entry + price * .0015, entry, stop,
    targets: [1, 2, 3].map(n => entry + (isLong ? 1 : -1) * risk * n),
    quality: { probability: .68, trusted: true, recommended: true } };
}
function render() {
  if (!asset) return;
  const price = asset.lastM1?.price || asset.candles.at(-1)?.close;
  $('#assetPrice').textContent = price ? number(price) : '—';
  $('#assetUpdated').textContent = asset.lastM1 ? `Закрытие M1: ${date(asset.lastM1.at)} · ${market === 'spot' ? 'спот' : 'USDT-M фьючерсы'}` : 'Последняя M1 пока не получена';
  const change = asset.ticker?.changePercent;
  $('#assetChange').textContent = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
  $('#assetChange').classList.toggle('negative', change < 0);
  $('#dayHigh').textContent = number(asset.ticker?.high);
  $('#dayLow').textContent = number(asset.ticker?.low);
  $('#dayVolume').textContent = `${compact(asset.ticker?.volume)} ${symbol.slice(0, -4)}`;
  $('#dayQuote').textContent = `${compact(asset.ticker?.quoteVolume)} USDT`;
  const displayedSignals = asset.signals.filter(s => assetScope === 'finished' ? isFinished(s) : !isFinished(s));
  document.querySelectorAll('[data-asset-scope]').forEach(button =>
    button.classList.toggle('active', button.dataset.assetScope === assetScope));
  $('#assetSignals').innerHTML = displayedSignals.length
    ? displayedSignals.slice(0, 35).map(signalCard).join('')
    : `<div class="asset-empty">${assetScope === 'finished' ? 'Завершённых сигналов нет.' :
        'Актуальных сигналов нет. Завершённые сценарии находятся в соседней вкладке.'}</div>`;
  $('#chartWindow').textContent = chartAnchorAt == null ? 'Последние закрытые свечи'
    : `Историческое окно: ${date(chartAnchorAt)} · ${tfName[interval]}`;
  const marked = selectedSignal(), trace = marked ? journey(marked) : null;
  document.querySelectorAll('[data-focus]').forEach(button => {
    button.disabled = button.dataset.focus !== 'now' && (!marked ||
      button.dataset.focus === 'entry' && !trace.entry ||
      button.dataset.focus === 'exit' && !trace.exit);
    button.classList.toggle('active', (button.dataset.focus === 'now' && chartAnchorAt == null) ||
      (button.dataset.focus !== 'now' && Number.isFinite(chartAnchorAt) &&
        chartAnchorAt === (button.dataset.focus === 'start' ? marked?.detectedAt :
          button.dataset.focus === 'entry' ? trace?.entry?.at : trace?.exit?.at)));
  });
  renderSelectedSignal();
  const structure = asset.structure || { swings: [], breaks: [], imbalances: [] };
  $('#structureSummary').textContent = `Swing: ${structure.swings.length} · BOS: ${structure.breaks.filter(item => item.type !== 'CHoCH').length} · CHoCH: ${structure.breaks.filter(item => item.type === 'CHoCH').length} · OB: ${structure.breaks.filter(item => item.block).length} · FVG: ${structure.imbalances.length} за последние ${asset.candles.length} свечей`;
  drawChart();
}
function signalCard(s) {
  const trace = journey(s);
  const result = trace.exit
    ? `Финиш ${date(trace.exit.at)} · ${number(trace.exit.price)}`
    : trace.finished ? trace.result : trace.entry ? 'В работе' : 'Ожидает вход';
  const timeline = trace.entry
    ? `Вход ${date(trace.entry.at)} · ${number(trace.entry.price)}`
    : 'Вход ещё не зафиксирован';
  return `<button type="button" class="asset-signal ${selectedId === s.id ? 'selected' : ''}"
    data-signal="${escapeHtml(s.id)}">
    <div class="asset-signal-head"><strong>${escapeHtml(tfName[s.timeframe] || 'H1')} · ${escapeHtml(s.side)} · ${s.ruleVersion ? escapeHtml(s.ruleVersion) : 'SMC v3'}</strong>
    <small>${escapeHtml(stateName[s.state] || s.state)}</small></div>
    <p>Сигнал ${date(s.detectedAt)} · ${timeline} · ${result}</p>
    <div class="asset-signal-levels"><span>Вход ${number(s.entry)}</span><span>SL ${number(s.stop)}</span>
    ${s.targets.map((target, i) => `<span>TP${i + 1} ${number(target)}</span>`).join('')}</div>
    <div class="asset-signal-action">${selectedId === s.id ? 'Показан на графике ✓' : 'Показать путь на графике →'}</div></button>`;
}

function selectedSignal() {
  return asset?.signals.find(s => s.id === selectedId) || null;
}
function renderSelectedSignal() {
  const signal = selectedSignal(), panel = $('#selectedSignalPanel');
  panel.classList.toggle('hidden', !signal);
  if (!signal) return;
  const followed = getPreferences().selectedIds.includes(signal.id);
  const trace = journey(signal);
  const entryText = trace.entry ? `${date(trace.entry.at)} · ${number(trace.entry.price)}` : 'не зафиксирован';
  const exitText = trace.exit ? `${date(trace.exit.at)} · ${number(trace.exit.price)} · ${trace.result}`
    : trace.finished ? trace.result : 'движение не завершено';
  const percentText = trace.percent == null ? '' :
    `<strong class="path-result ${trace.percent >= 0 ? 'positive' : 'negative'}">${trace.percent >= 0 ? '+' : ''}${trace.percent.toFixed(2)}% по цене от входа до финиша</strong>`;
  panel.innerHTML = `<div class="selected-signal-heading"><strong>${escapeHtml(tfName[signal.timeframe])} · ${escapeHtml(signal.side)} · ${signal.ruleVersion ? escapeHtml(signal.ruleVersion) : 'SMC v3'} · ${escapeHtml(stateName[signal.state])}</strong><span>${date(signal.detectedAt)}</span></div>
    <div class="selected-levels"><div><span>ЗОНА OB</span><b>${number(signal.entryLow)}–${number(signal.entryHigh)}</b></div><div><span>ВХОД</span><b>${number(signal.entry)}</b></div><div><span>СТОП</span><b>${number(signal.stop)}</b></div>${signal.targets.map((value, i) => `<div><span>TP${i + 1}</span><b>${number(value)} ${i < signal.hitTargets ? '✓' : ''}</b></div>`).join('')}</div>
    <p>${signal.imbalance ? `FVG ${number(signal.imbalance.low)}–${number(signal.imbalance.high)} · ` : ''}${signal.structureEvent?.type || "BOS"} ${number(signal.swing)} · ордер-блок ${signal.blockTime ? date(signal.blockTime) : '—'}</p>
    <div class="signal-path-summary">
      <div><b>СТАРТ СИГНАЛА</b><span>${date(signal.detectedAt)} ${trace.createdPrice != null ? '· ' + number(trace.createdPrice) : ''}</span></div>
      <div><b>ТОЧКА ВХОДА</b><span>${entryText}</span></div>
      <div><b>ЗАВЕРШЕНИЕ</b><span>${exitText}</span></div>
      ${percentText}
    </div>
    <button id="followSignal" class="primary-button ${followed ? 'outline' : ''}" type="button">${followed ? '✓ Уведомления выбраны · отменить' : 'Следить за сигналом'}</button><small id="followHelp">${preview ? 'Демо-сигнал: уведомления по нему не отправляются.' : followed ? 'Режим «только выбранные» включён для этого устройства.' : 'Включит режим «только выбранные» и добавит этот сигнал.'}</small>`;
}
function drawChart() {
  const canvas = $('#priceChart'), ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect(), width = Math.max(100, rect.width), height = 320;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const left = 8, right = 63, top = 14, priceBottom = 240, volumeTop = 255, volumeBottom = 296;
  const plotWidth = width - left - right;
  const available = asset?.candles || [], capacity = Math.max(25, Math.floor(plotWidth / 5));
  if (chartAnchorAt == null) chartBars = available.slice(-capacity);
  else {
    const index = available.findIndex(c => chartAnchorAt >= c.time && chartAnchorAt <= c.end);
    const candidate = index >= 0 ? index : available.findIndex(c => c.end >= chartAnchorAt);
    const centered = candidate >= 0 ? candidate : available.length - 1;
    const start = Math.max(0, Math.min(available.length - capacity, centered - Math.floor(capacity * .34)));
    chartBars = available.slice(start, start + capacity);
  }
  if (!chartBars.length) { ctx.fillStyle = '#8ca2b5'; ctx.fillText('Свечи пока недоступны', 20, 130); return; }
  chartLeft = left; chartBarWidth = plotWidth / chartBars.length;
  const signal = selectedSignal();
  const structure = asset.structure || { swings: [], breaks: [], imbalances: [] };
  const recentBlocks = structure.breaks.filter(item => item.block).slice(-2);
  const recentGaps = structure.imbalances.slice(-2);
  let min = Math.min(...chartBars.map(c => c.low)), max = Math.max(...chartBars.map(c => c.high));
  if (signal) {
    const visibleEvents = (signal.events || []).filter(e => Number.isFinite(e.price) && e.price > 0 &&
      chartBars.some(bar => e.at >= bar.time && e.at <= bar.end)).map(e => e.price);
    const segments = levelSegments(signal, chartBars.at(-1).end);
    const visibleLevels = segments.filter(level => level.startAt <= chartBars.at(-1).end &&
      level.endAt >= chartBars[0].time && Number.isFinite(level.price) && level.price > 0)
      .map(level => level.price);
    const visiblePrices = [...visibleEvents, ...visibleLevels];
    if (visiblePrices.length) { min = Math.min(min, ...visiblePrices); max = Math.max(max, ...visiblePrices); }
  }
  for (const zone of [...recentBlocks.map(item => item.block), ...recentGaps]) {
    if (zone && Math.abs((zone.low + zone.high) / 2 - (min + max) / 2) / ((min + max) / 2) < .08) {
      min = Math.min(min, zone.low); max = Math.max(max, zone.high);
    }
  }
  const pad = Math.max((max - min) * .07, max * .0003); min -= pad; max += pad;
  const y = value => top + (max - value) / (max - min) * (priceBottom - top);
  const firstTime = chartBars[0].time, lastTime = chartBars.at(-1).time;
  const x = time => left + (time - firstTime) / Math.max(1, lastTime - firstTime) * (plotWidth - chartBarWidth) + chartBarWidth / 2;
  function zone(low, high, start, fill, stroke, name, end = lastTime) {
    const upper = Math.max(top, y(high)), lower = Math.min(priceBottom, y(low));
    if (lower <= upper) return;
    const timeframeMs = ({'1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240}[interval] || 15) * 60000;
    end = Math.min(end, start + 7 * timeframeMs); // short origin zone, not a full-width position
    if (end < firstTime || start > lastTime) return;
    const from = Math.max(left, Math.min(left + plotWidth - 12, x(start)));
    const to = Math.max(from + 3, Math.min(left + plotWidth, x(end)));
    ctx.fillStyle = fill; ctx.fillRect(from, upper, to - from, lower - upper);
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(from, upper, to - from, lower - upper);
    ctx.fillStyle = stroke; ctx.font = 'bold 9px system-ui'; ctx.fillText(name, Math.min(from + 3, left + plotWidth - 37), Math.max(top + 9, upper - 3));
  }
  ctx.font = '10px system-ui'; ctx.textAlign = 'left';
  recentGaps.forEach(gap => zone(gap.low, gap.high, gap.time, '#eab87a16', '#d5ac6d', 'FVG ' + (gap.status || 'active'), gap.filledAt || lastTime));
  recentBlocks.forEach(item => zone(item.block.low, item.block.high, item.block.time, item.direction === 'up' ? '#65dfa51f' : '#e77d951f', item.direction === 'up' ? '#67dca9' : '#e18c9e', 'OB ' + (item.block.status || 'active')));
  if (signal) {
    zone(signal.entryLow, signal.entryHigh, signal.blockTime || firstTime, '#75edba32', '#8ae8c4', 'OB · ВХОД');
    if (signal.imbalance) zone(signal.imbalance.low, signal.imbalance.high, signal.imbalance.time, '#eab87a2b', '#efc686', 'FVG СИГНАЛА');
  }
  for (let i = 0; i <= 4; i++) {
    const yy = top + i * (priceBottom - top) / 4;
    ctx.strokeStyle = '#35465a'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(left + plotWidth, yy); ctx.stroke();
    ctx.fillStyle = '#8ca2b3'; ctx.fillText(number(max - i * (max - min) / 4), left + plotWidth + 5, yy + 3);
  }
  const maxVolume = Math.max(1, ...chartBars.map(c => c.volume || 0));
  chartBars.forEach((c, i) => {
    const x = left + (i + .5) * chartBarWidth;
    const up = c.close >= c.open, color = up ? '#79eac0' : '#f28e9f';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();
    const bodyTop = y(Math.max(c.open, c.close)), bodyHeight = Math.max(1, Math.abs(y(c.open) - y(c.close)));
    ctx.fillRect(x - Math.max(1.5, chartBarWidth * .32), bodyTop, Math.max(3, chartBarWidth * .64), bodyHeight);
    ctx.globalAlpha = .45; ctx.fillRect(x - Math.max(1.5, chartBarWidth * .32), volumeBottom - (c.volume || 0) / maxVolume * (volumeBottom - volumeTop), Math.max(3, chartBarWidth * .64), (c.volume || 0) / maxVolume * (volumeBottom - volumeTop)); ctx.globalAlpha = 1;
  });
  for (const swing of structure.swings.filter(item => item.time >= firstTime).slice(-8)) {
    const xx = x(swing.time), yy = y(swing.price);
    if (yy < top || yy > priceBottom) continue;
    ctx.fillStyle = swing.kind === 'high' ? '#9fc4ef' : '#c8b7ef'; ctx.font = 'bold 9px system-ui';
    ctx.fillText(swing.kind === 'high' ? 'SH' : 'SL', Math.max(left, Math.min(left + plotWidth - 18, xx - 7)), swing.kind === 'high' ? Math.max(top + 9, yy - 5) : Math.min(priceBottom, yy + 12));
  }
  for (const item of structure.breaks.filter(item => item.time >= firstTime).slice(-3)) {
    const yy = y(item.level), from = Math.max(left, x(item.swingTime)), to = Math.min(left + plotWidth, x(item.time));
    if (yy < top || yy > priceBottom || to <= from) continue;
    ctx.strokeStyle = item.direction === 'up' ? '#85c4fa' : '#f19bad'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(from, yy); ctx.lineTo(to, yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 9px system-ui'; ctx.fillText((item.type === 'CHoCH' ? 'CHoCH' : 'BOS') + (item.direction === 'up' ? ' ↑' : ' ↓'), Math.max(left, to - 28), Math.max(top + 9, yy - 4));
  }
  if (signal) {
    // Show each ENTRY/SL/TP level only for the recorded lifetime of the scenario.
    // A touched line ends at that level's last registered touch; unreached levels
    // remain dashed until the last observed candle or terminal event.
    const lastEnd = chartBars.at(-1).end;
    const levelColors = { ENTRY: '#83eac0', SL: '#ff93a9',
      TP1: '#e9dc91', TP2: '#e9dc91', TP3: '#e9dc91' };
    for (const segment of levelSegments(signal, lastEnd)) {
      if (segment.startAt > lastEnd || segment.endAt < firstTime ||
          !Number.isFinite(segment.price) || segment.price <= 0) continue;
      const yy = y(segment.price);
      if (yy < top || yy > priceBottom) continue;
      const from = segment.startAt < firstTime ? left :
        Math.max(left, Math.min(left + plotWidth, x(segment.startAt)));
      const to = segment.endAt >= lastEnd ? left + plotWidth :
        Math.max(left, Math.min(left + plotWidth, x(segment.endAt)));
      if (to < from) continue;
      const color = levelColors[segment.name] || '#e9dc91';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = segment.touched ? .95 : .58;
      ctx.setLineDash(segment.touched ? [] : [5, 4]);
      ctx.lineWidth = segment.touched ? 1.7 : 1.1;
      ctx.beginPath();ctx.moveTo(from, yy);ctx.lineTo(Math.max(to, from+1), yy);ctx.stroke();
      ctx.setLineDash([]);ctx.globalAlpha = 1;
      ctx.font = 'bold 9px system-ui';ctx.textAlign='left';
      const tw = ctx.measureText(segment.name).width + 8;
      const labelX = Math.min(Math.max(left, from + 4), left + plotWidth - tw);
      const labelY = Math.max(top + 12, Math.min(priceBottom - 2, yy - 4));
      ctx.fillStyle = '#0d192c';
      ctx.fillRect(labelX-2,labelY-10,tw+2,13);
      ctx.fillStyle = color;ctx.fillText(segment.name,labelX+2,labelY);
      ctx.restore();
    }
    const trace = journey(signal);
    const events = trace.events.filter(e => Number.isFinite(e.at) && Number.isFinite(e.price) && e.price > 0);
    const indexOf = at => chartBars.findIndex(bar => at >= bar.time && at <= bar.end);
    const px = index => left + (index + .5) * chartBarWidth;
    if (trace.entry) {
      const lastAt = trace.exit?.at || chartBars.at(-1).end;
      const points = [];
      const entryIndex = indexOf(trace.entry.at);
      if (entryIndex >= 0) points.push([px(entryIndex), y(trace.entry.price)]);
      chartBars.forEach((bar, i) => {
        if (bar.end > trace.entry.at && bar.end <= lastAt) points.push([px(i), y(bar.close)]);
      });
      if (trace.exit) {
        const exitIndex = indexOf(trace.exit.at);
        if (exitIndex >= 0) points.push([px(exitIndex), y(trace.exit.price)]);
      }
      if (points.length > 1) {
        ctx.beginPath(); ctx.moveTo(...points[0]);
        points.slice(1).forEach(p => ctx.lineTo(...p));
        ctx.strokeStyle = '#86b9f3'; ctx.lineWidth = 2.3; ctx.stroke();
      }
    }
    // Dated pins sit on the closed candle containing each recorded M1 event.
    const palette = {
      CREATED:['СТАРТ','#85c4fa'], ENTRY:['ВХОД','#83eac0'],
      TP1:['TP1','#e9dc91'], TP2:['TP2','#e9dc91'], TP3:['ВЫХОД TP3','#83eac0'],
      STOP:['СТОП','#ff93a9'], INVALIDATED:['ОТМЕНА','#aeb6c1'], EXPIRED:['ИСТЁК','#aeb6c1']
    };
    const initial = events.find(e => e.type === 'CREATED');
    const plottedEvents = [...(initial ? [initial] : []),
      ...events.filter(e => ['ENTRY','TP1','TP2','TP3','STOP','INVALIDATED','EXPIRED'].includes(e.type))];
    for (const e of plottedEvents) {
      const index = indexOf(e.at);
      if (index < 0 || !palette[e.type]) continue;
      const [title, color] = palette[e.type], xx = px(index), yy = y(e.price);
      ctx.fillStyle = '#0d192c'; ctx.beginPath(); ctx.arc(xx,yy,6.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle = color;ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fill();
      ctx.font = 'bold 9px system-ui';const tw = ctx.measureText(title).width + 12;
      const lx = Math.max(left,Math.min(left+plotWidth-tw,xx-tw/2));
      const labelY = yy > top+23 ? yy-15 : yy+24;
      ctx.fillStyle = '#0d192c';ctx.fillRect(lx,labelY-12,tw,15);
      ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(title,lx+6,labelY-2);
    }
  }
  if (hovered >= 0 && hovered < chartBars.length) {
    const x = left + (hovered + .5) * chartBarWidth;
    ctx.strokeStyle = '#dbeac477'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, volumeBottom); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = '#8398aa'; ctx.font = '9px system-ui';
  ctx.fillText(new Date(chartBars[0].time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), left, height - 7);
  ctx.textAlign = 'right'; ctx.fillText(new Date(chartBars.at(-1).time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), left + plotWidth, height - 7);
  const info = chartBars[hovered >= 0 ? hovered : chartBars.length - 1];
  $('#candleInfo').textContent = `${date(info.time)} · O ${number(info.open)}  H ${number(info.high)}  L ${number(info.low)}  C ${number(info.close)} · Vol ${compact(info.volume)}`;
}
$('#priceChart').addEventListener('pointermove', event => {
  if (!asset || !chartBars.length) return;
  const x = event.clientX - $('#priceChart').getBoundingClientRect().left;
  hovered = Math.max(0, Math.min(chartBars.length - 1, Math.floor((x - chartLeft) / chartBarWidth)));
  drawChart();
});
$('#priceChart').addEventListener('pointerleave', () => { hovered = -1; if (asset) drawChart(); });
window.addEventListener('resize', () => { if (asset) drawChart(); });
$('#assetSignals').addEventListener('click', event => {
  const id = event.target.closest('[data-signal]')?.dataset.signal;
  if (!id) return;
  const signal = asset?.signals.find(s => s.id === id);
  if (!signal) return;
  selectedId = id;
  assetScope = isFinished(signal) ? 'finished' : 'current';
  interval = signal.timeframe;
  chartAnchorAt = journey(signal).entry?.at || signal.detectedAt;
  chartFocusPinned = true;
  syncTabs(); render(); loadAsset();
  $('#selectedSignalPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#selectedSignalPanel').addEventListener('click', async event => {
  if (!event.target.closest('#followSignal')) return;
  if (preview) { $('#followHelp').textContent = 'Это пример. Для реальных уведомлений откройте обычный режим.'; return; }
  const signal = selectedSignal(); if (!signal) return;
  const preferences = getPreferences();
  if (preferences.selectedIds.includes(signal.id)) preferences.selectedIds = preferences.selectedIds.filter(id => id !== signal.id);
  else { preferences.selectedIds.push(signal.id); preferences.selectedOnly = true; }
  savePreferences(preferences); renderSelectedSignal();
  try { const synced = await syncPreferences(preferences); $('#followHelp').textContent = synced ? 'Выбор синхронизирован с сервером.' : 'Выбор сохранён. Включите push в настройках.'; }
  catch (error) { $('#followHelp').textContent = `Сохранено на устройстве. Синхронизация: ${error.message}`; }
});
document.querySelectorAll('[data-market]').forEach(button => button.addEventListener('click', () => {
  market = button.dataset.market; selectedId = null; chartAnchorAt = null; chartFocusPinned = false;
  assetScope = 'current'; syncTabs(); loadAsset(); loadLargeTrades();
}));
document.querySelectorAll('[data-asset-scope]').forEach(button => button.addEventListener('click', () => {
  assetScope = button.dataset.assetScope;
  const selected = selectedSignal();
  if (selected && isFinished(selected) !== (assetScope === 'finished')) {
    selectedId = null; chartAnchorAt = null; chartFocusPinned = false; syncTabs(); loadAsset();
  } else render();
}));
document.querySelectorAll('[data-focus]').forEach(button => button.addEventListener('click', () => {
  if (button.disabled) return;
  const trace = selectedSignal() ? journey(selectedSignal()) : null;
  const selected = selectedSignal();
  const focused = button.dataset.focus;
  if (focused !== 'now' && !selected) return;
  chartAnchorAt = focused === 'now' ? null : focused === 'start' ? selected.detectedAt :
    focused === 'entry' ? trace.entry?.at : trace.exit?.at;
  chartFocusPinned = true;
  loadAsset();
}));
document.querySelectorAll('[data-interval]').forEach(button => button.addEventListener('click', () => { interval = button.dataset.interval; syncTabs(); loadAsset(); }));

