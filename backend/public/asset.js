import { getPreferences, savePreferences, syncPreferences } from './notification-settings.js';
import { initWakeLock } from './wake.js';
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const symbol = (params.get('symbol') || '').toUpperCase();
const preview = params.has('preview');
let market = params.get('market') === 'futures' ? 'futures' : 'spot';
let interval = ['1m', '5m', '15m', '30m', '1h', '4h'].includes(params.get('interval')) ? params.get('interval') : '15m';
let selectedId = params.get('signal') || null;
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
  syncTabs(); loadAsset(); loadLargeTrades(); setInterval(loadAsset, 60000); setInterval(loadLargeTrades, 5000);
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
    const url = `/api/asset/${encodeURIComponent(symbol)}?market=${market}&interval=${interval}`;
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    if (serial !== requestSerial) return;
    asset = body; hovered = -1;
    if (preview) { asset.signals = [sampleSignal(body)]; if (!selectedId) selectedId = 'demo'; }
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
  $('#assetSignals').innerHTML = asset.signals.length ? asset.signals.slice(0, 15).map(signalCard).join('') : '<div class="asset-empty">По этому рынку пока нет сигналов. Структура, ордер-блоки и имбалансы ниже отображаются по закрытым свечам даже без торгового сигнала.</div>';
  renderSelectedSignal();
  const structure = asset.structure || { swings: [], breaks: [], imbalances: [] };
  $('#structureSummary').textContent = `Swing: ${structure.swings.length} · BOS: ${structure.breaks.length} · OB: ${structure.breaks.filter(item => item.block).length} · FVG: ${structure.imbalances.length} за последние ${asset.candles.length} свечей`;
  drawChart();
}
function signalCard(s) {
  const active = ['WAITING', 'OPEN'].includes(s.state);
  return `<button type="button" class="asset-signal ${selectedId === s.id ? 'selected' : ''}" data-signal="${escapeHtml(s.id)}"><div class="asset-signal-head"><strong>${escapeHtml(tfName[s.timeframe] || 'H1')} · ${escapeHtml(s.side)}</strong><small>${escapeHtml(stateName[s.state] || s.state)}</small></div><p>${active ? 'Активный сигнал' : 'История'} · ${date(s.detectedAt)} · ${s.imbalance ? 'FVG подтверждён' : 'без FVG (старый сигнал)'}${s.quality?.trusted ? ` · оценка модели ${Math.round(s.quality.probability * 100)}%` : ''}</p><div class="asset-signal-levels"><span>Вход ${number(s.entry)}</span><span>SL ${number(s.stop)}</span>${s.targets.map((target, i) => `<span>TP${i + 1} ${number(target)}</span>`).join('')}</div><div class="asset-signal-action">${selectedId === s.id ? 'Показан на графике ✓' : 'Показать на графике →'}</div></button>`;
}
function selectedSignal() {
  return asset?.signals.find(s => s.id === selectedId) || null;
}
function renderSelectedSignal() {
  const signal = selectedSignal(), panel = $('#selectedSignalPanel');
  panel.classList.toggle('hidden', !signal);
  if (!signal) return;
  const followed = getPreferences().selectedIds.includes(signal.id);
  panel.innerHTML = `<div class="selected-signal-heading"><strong>${escapeHtml(tfName[signal.timeframe])} · ${escapeHtml(signal.side)} · ${escapeHtml(stateName[signal.state])}</strong><span>${date(signal.detectedAt)}</span></div>
    <div class="selected-levels"><div><span>ЗОНА OB</span><b>${number(signal.entryLow)}–${number(signal.entryHigh)}</b></div><div><span>ВХОД</span><b>${number(signal.entry)}</b></div><div><span>СТОП</span><b>${number(signal.stop)}</b></div>${signal.targets.map((value, i) => `<div><span>TP${i + 1}</span><b>${number(value)} ${i < signal.hitTargets ? '✓' : ''}</b></div>`).join('')}</div>
    <p>${signal.imbalance ? `FVG ${number(signal.imbalance.low)}–${number(signal.imbalance.high)} · ` : ''}BOS ${number(signal.swing)} · ордер-блок ${signal.blockTime ? date(signal.blockTime) : '—'}</p>
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
  chartBars = (asset?.candles || []).slice(-Math.max(25, Math.floor(plotWidth / 5)));
  if (!chartBars.length) { ctx.fillStyle = '#8ca2b5'; ctx.fillText('Свечи пока недоступны', 20, 130); return; }
  chartLeft = left; chartBarWidth = plotWidth / chartBars.length;
  const signal = selectedSignal();
  const structure = asset.structure || { swings: [], breaks: [], imbalances: [] };
  const recentBlocks = structure.breaks.filter(item => item.block).slice(-2);
  const recentGaps = structure.imbalances.slice(-2);
  let min = Math.min(...chartBars.map(c => c.low)), max = Math.max(...chartBars.map(c => c.high));
  if (signal) {
    const levels = [signal.entryLow, signal.entryHigh, signal.stop, ...signal.targets];
    min = Math.min(min, ...levels); max = Math.max(max, ...levels);
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
    if (end < firstTime || start > lastTime) return;
    const from = Math.max(left, Math.min(left + plotWidth - 12, x(start)));
    const to = Math.max(from + 3, Math.min(left + plotWidth, x(end)));
    ctx.fillStyle = fill; ctx.fillRect(from, upper, to - from, lower - upper);
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(from, upper, to - from, lower - upper);
    ctx.fillStyle = stroke; ctx.font = 'bold 9px system-ui'; ctx.fillText(name, Math.min(from + 3, left + plotWidth - 37), Math.max(top + 9, upper - 3));
  }
  ctx.font = '10px system-ui'; ctx.textAlign = 'left';
  recentGaps.forEach(gap => zone(gap.low, gap.high, gap.time, '#eab87a16', '#d5ac6d', 'FVG', gap.filledAt || lastTime));
  recentBlocks.forEach(item => zone(item.block.low, item.block.high, item.block.time, item.direction === 'up' ? '#65dfa51f' : '#e77d951f', item.direction === 'up' ? '#67dca9' : '#e18c9e', 'OB'));
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
    ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 9px system-ui'; ctx.fillText(item.direction === 'up' ? 'BOS ↑' : 'BOS ↓', Math.max(left, to - 28), Math.max(top + 9, yy - 4));
  }
  if (signal) {
    const lines = [['ENTRY', signal.entry, '#8ae8c4'], ['SL', signal.stop, '#ff9eae'], ...signal.targets.map((v, i) => [`TP${i + 1}`, v, '#c8df86'])];
    for (const [name, value, color] of lines) {
      const yy = y(value); if (yy < top || yy > priceBottom) continue;
      ctx.setLineDash([4, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(left + plotWidth, yy); ctx.stroke(); ctx.setLineDash([]);
      const labelY = Math.max(top + 8, Math.min(priceBottom - 2, yy - 3));
      ctx.fillStyle = '#101a2b'; ctx.fillRect(left + 2, labelY - 9, 34, 12);
      ctx.fillStyle = color; ctx.font = '9px system-ui'; ctx.fillText(name, left + 5, labelY);
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
  if (interval !== signal.timeframe) { interval = signal.timeframe; syncTabs(); loadAsset(); }
  else { syncTabs(); render(); }
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
document.querySelectorAll('[data-market]').forEach(button => button.addEventListener('click', () => { market = button.dataset.market; selectedId = null; syncTabs(); loadAsset(); loadLargeTrades(); }));
document.querySelectorAll('[data-interval]').forEach(button => button.addEventListener('click', () => { interval = button.dataset.interval; syncTabs(); loadAsset(); }));

