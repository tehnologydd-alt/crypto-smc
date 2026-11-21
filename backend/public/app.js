import { getPreferences, savePreferences, syncPreferences } from './notification-settings.js';
import { initWakeLock, keepScreenOn, setKeepScreenOn } from './wake.js';
import { journey, isFinished } from './signal-journey.js';
const $ = selector => document.querySelector(selector);
let data = null, filter = 'all', scope = 'all', tfFilter = 'all', activeDetail = null;
let demoSignalPrices = {};
const previewMode = new URLSearchParams(location.search).has('preview');
let accessToken = localStorage.getItem('orbit-token') || '';
let pushEnabled = false;
let pushChecked = false;
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: Number(value) < 1 ? 6 : Number(value) < 100 ? 4 : 2 });
const compact = value => Number.isFinite(Number(value)) ? Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(value)) : '—';
const time = value => new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusName = { WAITING: 'Ожидает вход', OPEN: 'В работе', STOPPED: 'Стоп', COMPLETED: 'TP3 достигнут', CANCELLED: 'Отменён', EXPIRED: 'Истёк', UNCERTAIN: 'Проверьте вручную' };
const tfName = { '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4' };
const eventName = { CREATED: 'Сигнал создан', ENTRY: 'Цена в зоне входа', TP1: 'TP1 достигнут', TP2: 'TP2 достигнут', TP3: 'TP3 достигнут', STOP: 'Стоп достигнут', INVALIDATED: 'Сигнал отменён', EXPIRED: 'Сигнал истёк', DATA_GAP: 'Пробел в данных', ACKNOWLEDGED: 'Архивирован вручную' };
const notificationNames = { CREATED: 'Новый сигнал', ENTRY: 'Вход', TP1: 'TP1', TP2: 'TP2', TP3: 'TP3', STOP: 'Стоп-лосс', INVALIDATED: 'Отмена сигнала', EXPIRED: 'Истечение', DATA_GAP: 'Пробел в данных' };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers } });
  let body;
  try { body = await response.json(); } catch { throw new Error(`HTTP ${response.status}`); }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function notice(message) { $('#notice').textContent = message; $('#notice').classList.remove('hidden'); }
function clearNotice() { $('#notice').classList.add('hidden'); }
function setScreen(page, updateUrl = true) {
  const selected = ['market', 'signals', 'stats', 'settings'].includes(page) ? page : 'market';
  for (const name of ['market', 'signals', 'stats', 'settings']) $(`#${name}Screen`).classList.toggle('hidden', name !== selected);
  $('#settingsButton').classList.toggle('active', selected === 'settings');
  if (selected === 'settings') $('#settingsButton').setAttribute('aria-current', 'page'); else $('#settingsButton').removeAttribute('aria-current');
  document.querySelectorAll('.bottom-item').forEach(button => {
    const active = button.dataset.page === selected;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (updateUrl) {
    const next = new URL(location.href);
    if (selected === 'market') next.searchParams.delete('page'); else next.searchParams.set('page', selected);
    history.pushState({ page: selected }, '', next);
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function feed(element, name, status) {
  element.textContent = `● ${name}: ${status === 'live' ? 'онлайн' : status === 'rest' ? 'резерв REST' : status === 'connecting' ? 'подключение' : 'нет связи'}`;
  element.classList.toggle('live', status === 'live');
}
function renderBackgroundStatus() {
  if (!data) return;
  const active = ['live', 'rest'].includes(data.feeds.spot) && ['live', 'rest'].includes(data.feeds.futures);
  $('#monitorStatus').textContent = active ? 'Работает' : 'Проверить связь';
  $('#monitorStatus').classList.toggle('active', active);
  $('#deliveryStatus').textContent = !data.pushAvailable ? 'Сервер не настроен' : pushEnabled ? 'Подписка активна' : 'Включите push';
  $('#deliveryStatus').classList.toggle('active', Boolean(data.pushAvailable && pushEnabled));
}
function priceFor(signal) { return demoSignalPrices[signal.id] || data.prices[`${signal.market}:${signal.symbol}`]; }
const finishedStates = new Set(['STOPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED']);
function outcome(signal) {
  if (!finishedStates.has(signal.state)) return '';
  if (signal.state === 'COMPLETED' || signal.hitTargets >= 3) return 'outcome-green';
  if (signal.hitTargets > 0) return 'outcome-yellow';
  if (signal.state === 'STOPPED') return 'outcome-red';
  return 'outcome-gray';
}
function smallBook(book,label) {
  const live=book?.status==='live' && (book.ageMs??Infinity)<=10000;
  if(!live)return `<div class="asset-book-foot offline"><b>${label} · стакан</b><span>${safe(book?.status==='stale'?'устарел':'синхронизация')}</span></div>`;
  const bid=Math.round(book.imbalance*100),ask=100-bid;
  return `<div class="asset-book-foot"><b>${label} · WS</b>
    <span><em>Bid ${compact(book.bidUsdt)} (${bid}%)</em> /
      <i>Ask ${compact(book.askUsdt)} (${ask}%)</i></span>
    <small>${Math.round(book.ageMs/1000)}с · ${book.levels} ур.</small></div>`;
}
function assetCard(symbol) {
  const spot = data.prices[`spot:${symbol}`]?.price;
  const futures = data.prices[`futures:${symbol}`]?.price;
  const active = data.signals.filter(s => s.symbol === symbol && ['WAITING', 'OPEN'].includes(s.state)).length;
  const href = `/asset.html?symbol=${encodeURIComponent(symbol)}${previewMode ? '&preview=1' : ''}`;
  return `<a class="asset-card" href="${href}"><div class="asset-card-top"><div class="asset-icon">${safe(symbol[0])}</div><div><strong>${safe(symbol.replace('USDT', ''))}<small>/USDT</small></strong><span>${active ? `${active} активн. сигналов` : 'Обзор рынка'}</span></div><b>↗</b></div>
    <div class="asset-prices"><div><span>СПОТ · M1</span><strong>${spot ? num(spot) : '—'}</strong></div><div><span>ФЬЮЧЕРСЫ · M1</span><strong>${futures ? num(futures) : '—'}</strong></div></div>
    <div class="asset-book-preview" data-symbol="${safe(symbol)}">
      ${smallBook(data.orderBooks?.[`spot:${symbol}`],'Спот')}
      ${smallBook(data.orderBooks?.[`futures:${symbol}`],'Фьючерсы')}
    </div></a>`;
}

function card(signal) {
  const current = priceFor(signal);
  const positive = signal.state === 'COMPLETED' || signal.hitTargets > 0;
  const step = signal.state === 'WAITING' ? 'РЕТЕСТ ЗОНЫ' : signal.state === 'OPEN' ? `${signal.hitTargets}/3 ЦЕЛИ` : statusName[signal.state]?.toUpperCase();
  const version = signal.ruleVersion ? `Правила ${safe(signal.ruleVersion)} · ` : 'Прежние правила · ';
  const book = signal.ruleSnapshot?.book || signal.bookEvidence;
  const bookNote = book ? `<div class="quality">Стакан bid ${num(book.bidUsdt)} / ask ${num(book.askUsdt)} USDT · bid ${Math.round(book.imbalance*100)}% · ${time(book.capturedAt)}</div>` : '';
  const quality = signal.quality?.trusted ? `<div class="quality ${signal.quality.recommended ? 'good' : 'weak'}">Оценка модели: ${Math.round(signal.quality.probability * 100)}% · ${signal.quality.recommended ? 'приоритетный' : 'низкий приоритет'}</div>` : `<div class="quality">Модель собирает результаты</div>`;
  return `<button class="signal-card ${safe(signal.state.toLowerCase())} ${outcome(signal)}" data-id="${safe(signal.id)}">
    <div class="card-top"><div class="pair-icon">${safe(signal.symbol.slice(0, 1))}</div><div class="pair"><strong>${safe(signal.symbol.replace('USDT', ''))}<small>/USDT</small></strong><span>${signal.market === 'spot' ? 'Спот' : 'USDT-M фьючерсы'} · ${safe(tfName[signal.timeframe] || 'H1')} · ${time(signal.detectedAt)}</span><span>${version}${safe(statusName[signal.state] || signal.state)}</span></div><span class="side ${signal.side.toLowerCase()}">${signal.side === 'LONG' ? '↗ LONG' : '↘ SHORT'}</span></div>
    <div class="card-values"><div><span>Вход</span><strong>${num(signal.entry)}</strong></div><div><span>M1 close</span><strong>${current ? num(current.price) : '—'}</strong></div><div><span>Стоп</span><strong>${num(signal.stop)}</strong></div></div>
    <div class="card-bottom"><span class="status ${positive ? 'positive' : ''}"><i></i>${safe(statusName[signal.state] || signal.state)}</span><span>${safe(step)} →</span></div>${quality}${bookNote}
  </button>`;
}
function renderStatistics(stats) {
  if (!stats) return;
  const { totals, newStrategy } = stats;
  const variants = stats.ruleComparisons?.versions || [];
  const archived = (stats.ruleComparisons?.archivedVersions || []).filter(r=>r.signals>0);
  const allComparable = variants.length === 3 && variants.every(row => row.resolved >= 30);
  const maxObserved = allComparable ? variants.reduce((best,row)=>
    row.successRate > best.successRate ? row : best,variants[0]) : null;
  const percent = value => value == null ? '—' : (100 * value).toFixed(1) + '%';
  const fraction = (n,d) => d > 0 ? Math.round(n / d * 100) : 0;
  $('#ruleComparison').innerHTML = variants.length ? `
    <div class="rule-comparison-chart">
      ${variants.map(r=>`<div class="rule-compare-row">
        <strong>${safe(r.key)}</strong>
        <div class="rule-track"><i style="width:${fraction(r.successful,r.resolved)}%"></i></div>
        <b>${percent(r.successRate)}</b><small>${r.successful}/${r.resolved}</small>
      </div>`).join('')}
    </div>
    <p class="muted">${allComparable
      ? `Наибольшая наблюдаемая доля TP1: ${safe(maxObserved.key)}. Фильтры выбирают разные сигналы: это ещё не доказательство преимущества.`
      : 'До предварительного сравнения нужно не менее 30 разрешённых входов каждой версии. Лидера пока не определяем.'}</p>
    <div class="rule-grid">${variants.map(r=>{
      const model = data?.ruleModels?.[r.key] || {};
      const brier = r.modelBrier == null ? '—' : Number(r.modelBrier).toFixed(3);
      const base = r.baselineBrier == null ? '—' : Number(r.baselineBrier).toFixed(3);
      const val = model.validationSamples || 0, samples = model.samples || 0;
      return `<article class="rule-stat">
        <div class="rule-name"><b>${safe(r.key)}</b><strong>${safe(r.title)}</strong></div>
        <div class="rule-facts">
          <div><span>Сигналов</span><strong>${r.signals}</strong></div>
          <div><span>Входов</span><strong>${r.entered}</strong></div>
          <div><span>Исходов</span><strong>${r.resolved}</strong></div>
          <div><span>TP1</span><strong>${r.tp1}</strong></div>
          <div><span>TP2</span><strong>${r.tp2}</strong></div>
          <div><span>TP3</span><strong>${r.tp3}</strong></div>
          <div><span>Стопов</span><strong>${r.stopped}</strong></div>
          <div><span>Успех TP1</span><strong>${percent(r.successRate)}</strong></div>
        </div>
        <div class="rule-model">
          <div><span>Обучение</span><b>${samples} исходов</b></div>
          <div><span>Проверка</span><b>${val} исходов</b></div>
          <div><span>Brier модели / база</span><b>${brier} / ${base}</b></div>
        </div>
        <small>${r.resolved < 30 ? `Предварительная выборка: ${r.resolved}/30` : 'Выборка достигла порога предварительной оценки'}</small>
      </article>`;
    }).join('')}</div>
    <p class="muted">D2 анализирует синхронизированный WebSocket-стакан Binance Spot / USDT-M: 100 уровней bid/ask в USDT, минимум 10 секунд наблюдения, устойчивость дисбаланса и непрерывные номера обновлений. REST используется только для начальной синхронизации или восстановления. Старые REST/объёмные правила находятся в архиве. Метрики наблюдательные, без комиссий.</p>
    ${archived.length ? `<details class="rule-archive"><summary>Архив прежних правил (${archived.reduce((n,r)=>n+r.signals,0)} сигналов)</summary>
      ${archived.map(r=>`<div class="asset-stat-row"><strong>${safe(r.key)} · ${safe(r.title)}</strong>
       <span>${r.signals} сигналов · ${r.resolved} исходов · TP1 ${percent(r.successRate)}</span></div>`).join('')}
      </details>` : ''}
  ` : '<p class="muted">Сравнение появится после начала накопления сигналов новых версий.</p>';
  const pct = value => value == null ? '—' : `${Math.round(value * 100)}%`;
  $('#statSignals').textContent = totals.signals;
  $('#statEntries').textContent = totals.entered;
  $('#statStops').textContent = totals.stop;
  const levels = [['Вход', totals.entered], ['TP1', totals.tp1], ['TP2', totals.tp2], ['TP3', totals.tp3], ['Стоп', totals.stop]];
  const max = Math.max(1, ...levels.map(([, count]) => count));
  $('#levelStats').innerHTML = levels.map(([name, count]) => `<div class="level-row"><span>${name}</span><div class="level-track"><i style="width:${Math.round(count / max * 100)}%"></i></div><strong>${count}</strong></div>`).join('') +
    `<p class="muted">Вся история: TP1 раньше стопа у ${totals.successful} из ${totals.resolved} разрешённых входов (${pct(totals.resolved ? totals.successful / totals.resolved : null)}). Старые и новые правила здесь показаны вместе.</p><p class="muted">Отменено до входа: ${totals.invalidated} · истекло: ${totals.expired} · пробел в данных: ${totals.uncertain}</p>`;
  const trend = newStrategy.strategyTrend;
  $('#strategyStats').innerHTML = `<div class="stat-kpi"><span>Разрешённых сигналов с FVG</span><strong>${newStrategy.resolved}</strong></div><div class="stat-kpi"><span>TP1 раньше стопа</span><strong>${pct(newStrategy.rate)}</strong></div>` +
    (trend ? `<div class="trend-result ${trend.difference >= 0 ? 'up' : 'down'}">Последние 20: ${pct(trend.recent)} · предыдущие 20: ${pct(trend.previous)} · ${trend.difference >= 0 ? '+' : ''}${Math.round(trend.difference * 100)} п.п.</div>` : `<p class="muted">Для сравнения динамики нужны 40 разрешённых сигналов новой стратегии: две отдельные группы по 20. Сейчас ${newStrategy.resolved}.</p>`);
  $('#strategySeries').innerHTML = newStrategy.series.length ? newStrategy.series.map(group => `<div class="series-item"><strong>${pct(group.rate)}</strong><div class="series-track"><i style="height:${Math.max(4, Math.round(group.rate * 100))}%"></i></div><span>${time(group.to)}</span></div>`).join('') : '<p class="muted">График появится после первых 10 результатов новой стратегии.</p>';
  const forecast = newStrategy.forecastTrend;
  $('#forecastStats').innerHTML = `<div class="stat-kpi"><span>Проверочных результатов</span><strong>${newStrategy.validation}</strong></div>` +
    (forecast ? `<div class="stat-kpi"><span>Ошибка: предыдущие 20 → последние 20</span><strong>${forecast.previousError.toFixed(3)} → ${forecast.recentError.toFixed(3)}</strong></div><div class="trend-result ${forecast.difference <= 0 ? 'up' : 'down'}">${forecast.difference < 0 ? 'Ошибка снизилась' : forecast.difference > 0 ? 'Ошибка выросла' : 'Ошибка без изменений'} на ${Math.abs(forecast.difference).toFixed(3)}. Меньше — лучше.</div>` : `<p class="muted">Для оценки изменения прогноза нужны 40 проверочных результатов. Сейчас ${newStrategy.validation}. Первые 30 исходов служат для обучения и сюда не входят.</p>`);
  $('#assetStats').innerHTML = stats.bySymbol.length ? stats.bySymbol.map(row => `<div class="asset-stat-row"><strong>${safe(row.symbol)}</strong><span>Сигналы ${row.signals} · вход ${row.entered} · TP1 до стопа ${pct(row.resolved ? row.successful / row.resolved : null)}</span><small>TP1 ${row.tp1} · TP2 ${row.tp2} · TP3 ${row.tp3} · стоп ${row.stop}</small></div>`).join('') : '<p class="muted">Сигналы ещё не записаны.</p>';
}
function render() {
  if (!data) return;
  $('#assetsCount').textContent = data.symbols.length;
  $('#waitingCount').textContent = data.signals.filter(s => s.state === 'WAITING').length;
  $('#openCount').textContent = data.signals.filter(s => s.state === 'OPEN').length;
  feed($('#spotFeed'), 'Спот', data.feeds.spot);
  feed($('#futuresFeed'), 'Фьючерсы', data.feeds.futures);
  renderBackgroundStatus();
  const model = data.model;
  const samples = model?.samples || 0, validation = model?.validationSamples || 0;
  const level = model?.trusted ? 3 : samples >= 50 && validation >= 30 ? 2 : samples >= 30 ? 1 : 0;
  $('#learningLevel').textContent = `УРОВЕНЬ ${level}/3`;
  $('#trainingProgress').textContent = `${Math.min(samples, 30)}/30`;
  $('#validationProgress').textContent = `${Math.min(validation, 30)}/30`;
  $('#trainingBar').style.width = `${Math.min(samples / 30, 1) * 100}%`;
  $('#validationBar').style.width = `${Math.min(validation / 30, 1) * 100}%`;
  $('#learningStage').textContent = ['СБОР ОПЫТА', 'БАЗОВАЯ МОДЕЛЬ', 'ПРОВЕРКА КАЧЕСТВА', 'ПРОВЕРЕНА'][level];
  $('#learningHomeHelp').textContent = model?.trusted ? 'Модель прошла проверку на новых результатах. Это не гарантия прибыльности.' : samples >= 50 && validation >= 30 ? 'Выборка набрана, но ошибка прогноза пока не лучше базовой частоты на 5%. Обучение продолжается.' : 'Учитываются только сигналы новой FVG-стратегии после входа и достижения TP1 или стопа. Заполнение шкал не гарантирует улучшения точности.';
  $('#modelTag').textContent = model?.trusted ? 'ПРОВЕРЕНА' : 'ОБУЧАЕТСЯ';
  $('#modelTag').classList.toggle('trusted', Boolean(model?.trusted));
  $('#modelText').textContent = model?.trusted ? `Обучена на ${model.samples} завершённых сигналах. Ошибка прогноза на ${model.validationSamples} новых примерах: ${model.modelBrier.toFixed(3)} против ${model.baselineBrier.toFixed(3)} у базовой частоты. Уведомления о слабых сигналах приглушены.` : `Результатов по новой стратегии: ${model?.samples || 0}. Для первой проверки нужны минимум 30 обучающих результатов и 30 последующих проверочных (сейчас ${model?.validationSamples || 0}). Срок зависит от частоты сигналов и касания входа; точность пока не подтверждена.`;
  $('#experienceText').textContent = `Реальная база опыта: ${data.experience?.signals || 0} сигналов, ${data.experience?.outcomes || 0} исходов для модели. Записи сохраняются после перезапуска.`;
  $('#assetsGrid').innerHTML = data.symbols.map(assetCard).join('');
  const selectedIds = new Set(getPreferences().selectedIds);
  const signals = data.signals.filter(s => (filter === 'all' || s.market === filter) && (tfFilter === 'all' || (s.timeframe || '1h') === tfFilter) && (scope === 'all' ? !isFinished(s) : scope === 'marked' ? selectedIds.has(s.id) : isFinished(s)));
  $('#signalsCount').textContent = data.signals.filter(s => !isFinished(s)).length;
  const emptyText = scope === 'marked' ? 'Выберите сигнал в его карточке или обзоре актива, чтобы он появился здесь.' : scope === 'finished' ? 'Завершённые сигналы появятся после TP3, стопа, отмены или истечения.' : `Актуальных сигналов нет. Завершённые сценарии находятся во вкладке «Завершённые».`;
  $('#signals').innerHTML = signals.length ? signals.map(card).join('') : `<div class="empty"><div class="empty-orbit">◌</div><strong>Пока нет сигналов</strong><p>${emptyText}</p></div>`;
  renderStatistics(data.statistics);
  if (document.activeElement !== $('#symbolsInput')) $('#symbolsInput').value = data.symbols.join(', ');
  if (!pushEnabled) $('#pushHelp').textContent = data.pushAvailable ? 'Разрешите уведомления в браузере. Для работы при закрытом приложении сайт должен быть открыт по HTTPS и установлен на телефон.' : 'Для push нужен HTTPS и VAPID_SUBJECT на сервере.';
  renderSelectedSignals();
  if (activeDetail) showDetail(activeDetail, false);
}
function renderSelectedSignals() {
  const preferences = getPreferences();
  document.querySelectorAll('[name="signalScope"]').forEach(input => { input.checked = input.value === (preferences.selectedOnly ? 'selected' : 'all'); });
  const selected = preferences.selectedIds.map(id => data?.signals.find(s => s.id === id)).filter(Boolean);
  $('#selectedSignals').innerHTML = selected.length ? selected.map(s => `<div class="selected-signal"><span>${safe(s.symbol)} · ${s.market === 'spot' ? 'спот' : 'фьючерсы'} · ${safe(tfName[s.timeframe])} · ${safe(s.side)}</span><button type="button" data-remove-signal="${safe(s.id)}" aria-label="Убрать сигнал">×</button></div>`).join('') : 'Выбранных сигналов пока нет.';
}
function showDetail(id, open = true) {
  const s = data?.signals.find(x => x.id === id);
  if (!s) return;
  activeDetail = id;
  const trace = journey(s);
  const pathSummary = `<div class="detail-grid">
    <div><span>Начало сигнала</span><strong>${time(s.detectedAt)}</strong></div>
    <div><span>Точка входа</span><strong>${trace.entry ? time(trace.entry.at) + ' · ' + num(trace.entry.price) : 'не было'}</strong></div>
    <div><span>Завершение</span><strong>${trace.exit ? time(trace.exit.at) + ' · ' + num(trace.exit.price) : trace.result}</strong></div>
    <div><span>Изменение цены</span><strong>${trace.percent == null ? '—' : (trace.percent>=0 ? '+' : '') + trace.percent.toFixed(2) + '%'}</strong></div>
  </div>`;
  const events = s.events.map(e => `<div class="timeline-row"><div class="timeline-dot"></div><div><strong>${safe(eventName[e.type] || e.type)}</strong><span>${time(e.at)} · ${num(e.price)} USDT</span></div></div>`).reverse().join('');
  $('#detailContent').innerHTML = `<div class="detail-eyebrow">${s.market === 'spot' ? 'BINANCE SPOT' : 'BINANCE USDT-M'} · ${safe(tfName[s.timeframe] || 'H1')} · ${s.ruleVersion ? 'Правила ' + safe(s.ruleVersion) : 'SMC v3 (архив)'}</div><h2>${safe(s.symbol)} <span class="side ${s.side.toLowerCase()}">${safe(s.side)}</span></h2><p class="detail-status">${safe(statusName[s.state])} · контроль по M1</p>
    <div class="detail-grid"><div><span>Зона входа</span><strong>${num(s.entryLow)} – ${num(s.entryHigh)}</strong></div><div><span>Расчётный вход</span><strong>${num(s.entry)}</strong></div><div><span>Стоп</span><strong>${num(s.stop)}</strong></div><div><span>Риск на единицу</span><strong>${num(Math.abs(s.entry - s.stop))}</strong></div></div>
    <div class="targets">${s.targets.map((tp, i) => `<div class="target ${i < s.hitTargets ? 'reached' : ''}"><span>TP${i + 1} <small>${i + 1}R</small></span><strong>${num(tp)}</strong><b>${i < s.hitTargets ? '✓' : '○'}</b></div>`).join('')}</div>
    <p class="detail-quality">${s.quality?.trusted ? `Оценка модели при создании: ${Math.round(s.quality.probability * 100)}%. ${s.quality.recommended ? 'Приоритетный сигнал.' : 'Низкий приоритет; уведомления приглушены.'}` : 'Оценка модели пока обучается. Сигнал создан базовыми правилами.'}</p>
    <button class="primary-button outline follow-detail" type="button" data-follow="${safe(s.id)}">${getPreferences().selectedIds.includes(s.id) ? '✓ Отмечен · убрать' : '☆ Отметить сигнал'}</button>
    <a class="primary-button detail-chart-link" href="/asset.html?symbol=${encodeURIComponent(s.symbol)}&market=${encodeURIComponent(s.market)}&interval=${encodeURIComponent(s.timeframe)}&signal=${encodeURIComponent(s.id)}${previewMode ? '&preview=1' : ''}">Показать на графике актива</a>
    ${pathSummary}<div class="timeline"><h3>История сигнала</h3>${events}</div>${s.state === 'UNCERTAIN' ? `<button class="primary-button archive-button" data-archive="${safe(s.id)}">Архивировать после проверки</button>` : ''}<p class="detail-note">Уровни рассчитаны по свече ордер-блока и ATR. Касание цены не подтверждает исполнение биржевого ордера.</p>`;
  if (open) $('#detailDialog').showModal();
}
async function refresh() {
  try {
    data = await api('/api/state'); clearNotice();
    if (previewMode) {
      const now = Date.now();
      const long = { id: 'demo:spot:BTCUSDT', market: 'spot', symbol: 'BTCUSDT', side: 'LONG', timeframe: '15m', detectedAt: now - 3 * 3600000, entryLow: 99000, entryHigh: 100000, entry: 99500, stop: 98500, targets: [100500, 101500, 102500], state: 'OPEN', hitTargets: 1, quality: { probability: .72, trusted: true, recommended: true }, events: [{ type: 'CREATED', at: now - 3 * 3600000, price: 102000 }, { type: 'ENTRY', at: now - 2 * 3600000, price: 99500 }, { type: 'TP1', at: now - 30 * 60000, price: 100500 }] };
      const short = { id: 'demo:futures:SOLUSDT', market: 'futures', symbol: 'SOLUSDT', side: 'SHORT', timeframe: '4h', detectedAt: now - 3600000, entryLow: 248, entryHigh: 252, entry: 250, stop: 254, targets: [246, 242, 238], state: 'WAITING', hitTargets: 0, quality: { probability: .38, trusted: true, recommended: false }, events: [{ type: 'CREATED', at: now - 3600000, price: 244 }] };
      data.signals = [long, short];
      demoSignalPrices = { 'demo:spot:BTCUSDT': { price: 100700, at: now }, 'demo:futures:SOLUSDT': { price: 245, at: now } };
      $('#previewBanner').classList.remove('hidden');
    }
    render();
    if (!pushChecked && data.pushAvailable) { pushChecked = true; void restorePushSubscription(); }
    const errors = Object.values(data.errors);
    if (errors.length && !previewMode) notice(`Часть данных недоступна: ${errors.slice(0, 2).join('; ')}`);
  } catch (error) {
    notice(`Нет связи с сервером: ${error.message}`);
    if (error.message.includes('ключ')) setScreen('settings');
  }
}
async function restorePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await api('/api/subscription', { method: 'POST', body: JSON.stringify({ ...subscription.toJSON(), preferences: getPreferences() }) });
    localStorage.setItem('orbit-push-endpoint', subscription.endpoint);
    pushEnabled = true;
    $('#pushHelp').textContent = 'Уведомления включены на этом устройстве.';
    renderBackgroundStatus();
  } catch (error) { $('#pushHelp').textContent = `Проверьте подписку: ${error.message}`; }
}

$('#settingsButton').addEventListener('click', () => setScreen('settings'));
$('#assetsButton').addEventListener('click', () => setScreen('settings'));
$('#saveToken').addEventListener('click', () => { accessToken = $('#apiToken').value.trim(); localStorage.setItem('orbit-token', accessToken); $('#settingsNotice').textContent = 'Ключ сохранён на этом устройстве'; $('#settingsNotice').classList.remove('hidden'); refresh(); });
$('#saveSymbols').addEventListener('click', async () => {
  try {
    const symbols = $('#symbolsInput').value.split(/[\s,;]+/).filter(Boolean);
    await api('/api/symbols', { method: 'PUT', body: JSON.stringify({ symbols }) });
    $('#symbolsHelp').textContent = 'Список пар сохранён'; refresh();
  } catch (error) { $('#symbolsHelp').textContent = error.message; }
});
$('#keepScreenOn').checked = keepScreenOn();
initWakeLock(message => { $('#wakeHelp').textContent = message; });
$('#keepScreenOn').addEventListener('change', event => { void setKeepScreenOn(event.target.checked); });
$('#eventPreferences').innerHTML = Object.entries(notificationNames).map(([type, title]) => `<label class="preference-choice"><input type="checkbox" data-event="${type}"> ${title}</label>`).join('');
function renderEventPreferences() {
  const preferences = getPreferences();
  document.querySelectorAll('[data-event]').forEach(input => { input.checked = preferences.events[input.dataset.event]; });
}
async function commitPreferences(preferences) {
  savePreferences(preferences);
  render();
  $('#preferencesHelp').textContent = 'Выбор сохранён на этом устройстве.';
  try { if (await syncPreferences(preferences)) $('#preferencesHelp').textContent = 'Настройки уведомлений сохранены на сервере.'; }
  catch (error) { $('#preferencesHelp').textContent = `Сохранено на устройстве. Синхронизация: ${error.message}`; }
}
$('#eventPreferences').addEventListener('change', event => {
  const type = event.target.dataset.event;
  if (!type) return;
  const preferences = getPreferences(); preferences.events[type] = event.target.checked; void commitPreferences(preferences);
});
document.querySelectorAll('[name="signalScope"]').forEach(input => input.addEventListener('change', () => {
  const preferences = getPreferences(); preferences.selectedOnly = input.value === 'selected'; void commitPreferences(preferences);
}));
$('#selectedSignals').addEventListener('click', event => {
  const id = event.target.closest('[data-remove-signal]')?.dataset.removeSignal;
  if (!id) return;
  const preferences = getPreferences(); preferences.selectedIds = preferences.selectedIds.filter(value => value !== id); void commitPreferences(preferences);
});
$('#signals').addEventListener('click', event => { const card = event.target.closest('[data-id]'); if (card) showDetail(card.dataset.id); });
$('#detailDialog').addEventListener('close', () => { activeDetail = null; });
$('#detailDialog').addEventListener('click', async event => {
  const followId = event.target.closest('[data-follow]')?.dataset.follow;
  if (followId) {
    const preferences = getPreferences();
    if (preferences.selectedIds.includes(followId)) preferences.selectedIds = preferences.selectedIds.filter(value => value !== followId);
    else { preferences.selectedIds.push(followId); preferences.selectedOnly = true; }
    void commitPreferences(preferences);
    render();
    return;
  }
  const id = event.target.closest('[data-archive]')?.dataset.archive;
  if (!id) return;
  try { await api(`/api/signals/${encodeURIComponent(id)}/archive`, { method: 'POST' }); await refresh(); }
  catch (error) { notice(error.message); }
});
document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => {
  scope = button.dataset.scope;
  document.querySelectorAll('[data-scope]').forEach(x => { x.classList.toggle('active', x === button); x.setAttribute('aria-selected', String(x === button)); });
  render();
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === button)); render(); }));
document.querySelectorAll('.tf-tab').forEach(button => button.addEventListener('click', () => { tfFilter = button.dataset.timeframe; document.querySelectorAll('.tf-tab').forEach(x => x.classList.toggle('active', x === button)); render(); }));
document.querySelectorAll('.bottom-item').forEach(button => button.addEventListener('click', () => setScreen(button.dataset.page)));
window.addEventListener('popstate', () => setScreen(new URLSearchParams(location.search).get('page'), false));
function unb64(value) { const padded = value.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), c => c.charCodeAt(0)); }
$('#enablePush').addEventListener('click', async () => {
  try {
    if (!data?.pushAvailable) throw new Error('На сервере не задан VAPID_SUBJECT');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Этот браузер не поддерживает push');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64(data.vapidPublicKey) });
    await api('/api/subscription', { method: 'POST', body: JSON.stringify({ ...subscription.toJSON(), preferences: getPreferences() }) });
    localStorage.setItem('orbit-push-endpoint', subscription.endpoint);
    pushEnabled = true; $('#pushHelp').textContent = 'Уведомления включены';
    renderBackgroundStatus();
  } catch (error) { $('#pushHelp').textContent = error.message; }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(error => console.error(error));
$('#apiToken').value = accessToken;
renderEventPreferences();
setScreen(new URLSearchParams(location.search).get('page'), false);
refresh(); setInterval(refresh, 5000);

