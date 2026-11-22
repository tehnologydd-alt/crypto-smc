const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const date = value => value ? new Date(value).toLocaleString('ru-RU',
  { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
const percent = value => value == null ? '—' : `${(100 * value).toFixed(1)}%`;
const number = value => value == null ? '—' : Number(value).toLocaleString('en-US',
  { maximumFractionDigits: Number(value) < 1 ? 6 : 2 });
const strategyName = { smc:'SMC · OB/FVG', breakout:'Импульс и пробой' };
const stateName = { WAITING:'Ожидает вход', OPEN:'В работе', COMPLETED:'TP3',
  STOPPED:'Стоп', EXPIRED:'Истёк', CANCELLED:'Отменён', UNCERTAIN:'Пробел данных' };
const verdictName = { PASS:'Прошёл', REJECT:'Отклонён', COLLECT:'Сбор данных' };
const aiVerdictName = { PASS:'Поддерживает', REJECT:'Отклоняет', UNSURE:'Не уверен' };
let report = null;
let lastReplay = null;
let aiProviders = null;

function funnel(key, metrics) {
  const stages = [['Кандидаты', metrics.candidates], ['Входы', metrics.entered],
    ['Исходы', metrics.resolved], ['TP1 до стопа', metrics.tp1First]];
  const max = Math.max(1, metrics.candidates);
  return `<div class="funnel"><div class="funnel-title"><h3>${escapeHtml(strategyName[key])}</h3><span>${metrics.candidates} кандидатов</span></div>
    ${stages.map(([label, value], index) => `<div class="funnel-line"><span>${label}</span><div class="track"><i class="step-${index}" style="width:${100 * value / max}%"></i></div><b>${value}</b></div>`).join('')}
    <small>Вход: ${percent(metrics.entryRate)} · TP1 после входа: ${metrics.resolved >= 20 ? percent(metrics.tp1Rate) : 'мало исходов для оценки'} · истекли без входа: ${metrics.expiredWithoutEntry}</small></div>`;
}

function shadowCard(key, row) {
  const badge = key === 'PASS' ? 'good' : key === 'REJECT' ? 'bad' : 'waiting';
  return `<div class="shadow-card"><div><span class="verdict ${badge}">${verdictName[key]}</span><b>${row.candidates}</b></div>
    <p>Входы ${row.entered} · исходы ${row.resolved} · TP1 до стопа ${row.tp1First}</p>
    <small>${row.resolved >= 20 ? `Наблюдаемая доля TP1: ${percent(row.tp1Rate)}` : `Для предварительного сравнения нужно ещё ${20 - row.resolved} исходов`}</small></div>`;
}

function candidateRow(row) {
  const shadow = row.shadow;
  const ai = row.ai;
  const label = shadow ? verdictName[shadow.verdict] || shadow.verdict : 'До запуска v5';
  const reason = shadow?.reason || 'Решение на момент создания не записывалось';
  const href = `/asset.html?symbol=${encodeURIComponent(row.symbol)}&market=futures&interval=${encodeURIComponent(row.timeframe)}&signal=${encodeURIComponent(row.id)}`;
  return `<tr><td>${date(row.detectedAt)}</td><td><a href="${href}">${escapeHtml(row.symbol)}</a><small>${escapeHtml(row.timeframe?.toUpperCase())}</small></td>
    <td>${escapeHtml(strategyName[row.strategy])}</td><td class="${row.side === 'LONG' ? 'long' : 'short'}">${escapeHtml(row.side)}</td>
    <td><b>${number(row.entry)}</b><small>TP1 ${number(row.tp1)} · SL ${number(row.stop)}</small></td>
    <td>${escapeHtml(stateName[row.state] || row.state)}${row.outcome ? `<small>Первым: ${row.outcome}</small>` : ''}</td>
    <td><span class="verdict ${shadow?.verdict === 'PASS' ? 'good' : shadow?.verdict === 'REJECT' ? 'bad' : 'waiting'}">${escapeHtml(label)}</span><small title="${escapeHtml(reason)}">${escapeHtml(reason)}</small></td>
    <td>${ai ? `<span class="verdict ${ai.status === 'DONE' && ai.verdict === 'PASS' ? 'good' : ai.status === 'DONE' && ai.verdict === 'REJECT' ? 'bad' : 'waiting'}">${escapeHtml(ai.status === 'DONE' ? aiVerdictName[ai.verdict] : ai.status)}</span><small>${escapeHtml(ai.model)} · ${row.aiBeforeEntry ? 'до входа' : row.entered ? 'после входа' : 'входа не было'}</small><small>${escapeHtml(ai.reason || '')}</small>` : '—'}</td></tr>`;
}

function render() {
  if (!report) return;
  $('#connection').textContent = report.feed === 'live' ? '● Поток онлайн' : '● Проверить поток';
  $('#connection').classList.toggle('live', report.feed === 'live');
  $('#updated').textContent = `Обновлено: ${date(report.generatedAt)}`;
  $('#feed').textContent = `Ошибок потока: ${report.errors}`;
  $('#monitored').textContent = `Отмечено активов: ${report.monitored}`;
  $('#policyVersion').textContent = report.policy.version;
  const symbolField = $('#replaySymbol');
  const selectedSymbol = symbolField.value;
  symbolField.innerHTML = (report.symbols || []).map(symbol =>
    `<option value="${escapeHtml(symbol)}">${escapeHtml(symbol)}</option>`).join('');
  if (report.symbols?.includes(selectedSymbol)) symbolField.value = selectedSymbol;
  const t = report.total;
  $('#kCandidates').textContent = t.candidates;
  $('#kEntries').textContent = t.entered;
  $('#kEntryRate').textContent = `Доля входов ${percent(t.entryRate)}`;
  $('#kResolved').textContent = t.resolved;
  $('#kTp1').textContent = t.tp1First;
  $('#kTp1Rate').textContent = t.resolved >= 20 ? `${percent(t.tp1Rate)} из завершённых входов` : `Нужно ещё ${20 - t.resolved} исходов для оценки`;
  $('#kMissed').textContent = t.expiredWithoutEntry;
  $('#funnels').innerHTML = ['smc', 'breakout'].map(key => funnel(key, report.byStrategy[key])).join('');
  $('#assessed').textContent = `${report.assessed} оценено при создании`;
  $('#shadow').innerHTML = ['PASS', 'REJECT', 'COLLECT'].map(key => shadowCard(key, report.shadow[key])).join('');
  $('#aiSummary').innerHTML = report.ai.models.length ? report.ai.models.map(model =>
    `<div class="ai-model"><h3>${escapeHtml(model.provider)} · ${escapeHtml(model.model)} <small>Оценок ${model.reviewed} · до входа ${model.timely}</small></h3><div class="shadow">${['PASS', 'REJECT', 'UNSURE'].map(key => {
      const row = model.byVerdict[key];
      return `<div class="shadow-card"><div><span class="verdict ${key === 'PASS' ? 'good' : key === 'REJECT' ? 'bad' : 'waiting'}">${aiVerdictName[key]}</span><b>${row.candidates}</b></div><p>Исходов ${row.resolved} · TP1 до стопа ${row.tp1First}</p><small>${row.resolved >= 20 ? `Доля TP1: ${percent(row.tp1Rate)}` : 'Нужно минимум 20 независимых исходов'}</small></div>`;
    }).join('')}</div></div>`).join('') : '<p class="panel-note">Оценок локальной модели пока нет.</p>';
  $('#aiStatus').dataset.summary = `Оценок: ${report.ai.reviewed} · до входа: ${report.ai.timely} · после входа: ${report.ai.late} · без входа: ${report.ai.withoutEntry} · в очереди: ${report.ai.pending} · ошибок: ${report.ai.errors}`;
  if (aiProviders) showAiStatus();
  const filter = $('#strategyFilter').value;
  const rows = report.latest.filter(row => filter === 'all' || row.strategy === filter);
  $('#candidates').innerHTML = rows.length ? rows.map(candidateRow).join('') :
    '<tr><td colspan="8">Кандидатов пока нет.</td></tr>';
  const coverage = [...report.coverage].sort((a,b) => a.symbol.localeCompare(b.symbol) ||
    ['1m','5m','15m','30m','1h','4h','1d'].indexOf(a.timeframe) -
    ['1m','5m','15m','30m','1h','4h','1d'].indexOf(b.timeframe));
  $('#coverage').innerHTML = coverage.length ? coverage.map(row =>
    `<div><b>${escapeHtml(row.symbol)}</b><span>${escapeHtml(row.timeframe.toUpperCase())}</span><strong>${number(row.candles)}</strong><small>${date(row.firstOpen)} → ${date(row.lastClose)}</small></div>`).join('') :
    '<p>Архив начнёт заполняться после перезапуска сервера и получения закрытых свечей.</p>';
}

function showAiStatus(message = '') {
  if (message) { $('#aiStatus').textContent = message; return; }
  const provider = $('#aiProvider').value;
  const found = aiProviders?.[provider];
  const status = found?.online ? `API работает · моделей: ${found.models.length}` :
    `API недоступен${found?.error ? ': ' + found.error : ''}`;
  $('#aiStatus').textContent = `${status}. ${$('#aiStatus').dataset.summary || ''}`;
}

function renderAiModels(preferred = '') {
  const provider = $('#aiProvider').value;
  const models = aiProviders?.[provider]?.models || [];
  const field = $('#aiModel');
  field.innerHTML = models.length ? models.map(model =>
    `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join('') :
    '<option value="">Нет доступных моделей</option>';
  field.disabled = models.length === 0;
  if (models.includes(preferred)) field.value = preferred;
  showAiStatus();
}

async function refreshAi() {
  try {
    const token = localStorage.getItem('orbit-token') || '';
    const response = await fetch('/api/research/ai', {
      headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    aiProviders = body.providers;
    $('#aiProvider').value = body.config.provider;
    $('#aiEnabled').checked = body.config.enabled;
    renderAiModels(body.config.model);
  } catch (error) { showAiStatus(`Не удалось проверить локальный ИИ: ${error.message}`); }
}

async function refresh() {
  try {
    const token = localStorage.getItem('orbit-token') || '';
    const response = await fetch('/api/research/lab', { headers: token ? { Authorization:`Bearer ${token}` } : {} });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    report = body;
    $('#error').classList.add('hidden');
    $('#export').disabled = false;
    render();
  } catch (error) {
    $('#error').textContent = `Не удалось загрузить лабораторию: ${error.message}`;
    $('#error').classList.remove('hidden');
    $('#connection').textContent = '● Нет связи';
    $('#connection').classList.remove('live');
  }
}

$('#refresh').addEventListener('click', refresh);
$('#strategyFilter').addEventListener('change', render);
$('#aiProvider').addEventListener('change', () => renderAiModels());
$('#aiRefresh').addEventListener('click', refreshAi);
$('#aiForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#aiSave');
  button.disabled = true;
  try {
    const token = localStorage.getItem('orbit-token') || '';
    const response = await fetch('/api/research/ai', { method: 'PUT',
      headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ enabled: $('#aiEnabled').checked,
        provider: $('#aiProvider').value, model: $('#aiModel').value }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    await refreshAi();
    showAiStatus(`Настройка сохранена. ${$('#aiEnabled').checked ? 'Новые кандидаты будут оцениваться локально.' : 'Оценка новых кандидатов выключена.'}`);
  } catch (error) { showAiStatus(`Не удалось сохранить: ${error.message}`); }
  finally { button.disabled = false; }
});
$('#replayForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#replayButton');
  button.disabled = true;
  $('#replayExport').disabled = true;
  lastReplay = null;
  $('#replayStatus').textContent = 'Загружаю закрытые свечи и воспроизвожу стратегии…';
  try {
    const token = localStorage.getItem('orbit-token') || '';
    const response = await fetch('/api/research/replay', { method:'POST',
      headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
      body: JSON.stringify({ symbol:$('#replaySymbol').value, timeframe:$('#replayTimeframe').value,
        days:Number($('#replayDays').value), feeBps:Number($('#replayFee').value),
        slippageBps:Number($('#replaySlippage').value) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    lastReplay = result;
    $('#replayExport').disabled = false;
    $('#replayStatus').textContent = `${result.settings.symbol} · ${result.settings.timeframe.toUpperCase()} · ${result.period.days === 3 ? '3 дня' : '7 дней'} · ${result.candles.m1} M1 свечей. Проверочный период не использован для обучения.`;
    const windows = [['development','Разработка'],['validation','Проверка'],['holdout','Отложенный период']];
    const paperRows = Object.entries(result.paper.byStrategy).flatMap(([strategy, groups]) =>
      windows.map(([window, label]) => { const row = groups[window];
        return `<tr><td>${escapeHtml(strategyName[strategy])}</td><td>${label}</td><td>${row.candidates}</td><td>${row.entries}</td><td>${row.closed}</td><td>${row.open}</td><td>${row.unfilled}</td><td>${row.closed ? `${number(row.netR)}R` : '—'}</td><td>${row.closed >= 20 ? `${number(row.averageR)}R` : 'мало данных'}</td></tr>`;
      })).join('');
    const tradeRows = result.paper.trades.map(trade =>
      `<tr><td>${date(trade.detectedAt)}</td><td>${escapeHtml(strategyName[trade.strategy])}</td><td>${escapeHtml(trade.side)}</td><td>${trade.entryFill == null ? '—' : number(trade.entryFill)}</td><td>${escapeHtml(trade.status)}</td><td>${trade.netR == null ? '—' : `${number(trade.netR)}R`}</td><td>${trade.events.map(e => escapeHtml(e.type)).join(' → ') || '—'}</td></tr>`).join('');
    $('#replayResult').innerHTML = `<h3>Касания исходных сигналов</h3><div class="table-wrap"><table><thead><tr><th>Стратегия</th><th>Окно</th><th>Кандидаты</th><th>Входы</th><th>Исходы</th><th>TP1 до стопа</th><th>Доля TP1</th></tr></thead><tbody>${result.versions.flatMap(version =>
      windows.map(([key,label]) => { const row = version.windows[key];
        return `<tr><td>${escapeHtml(strategyName[version.rule.key])}</td><td>${label}</td><td>${row.created}</td><td>${row.entered}</td><td>${row.resolved}</td><td>${row.successful}</td><td>${row.resolved >= 20 ? percent(row.rate) : 'мало данных'}</td></tr>`;
      })).join('')}</tbody></table></div><h3>Бумажное исполнение и результат после расходов</h3>
      <p class="panel-note">Условный вход по касанию M1, частичные TP по ⅓, перенос стопа после TP1. Комиссия ${result.paper.assumptions.feeBps} б.п. и проскальзывание ${result.paper.assumptions.slippageBps} б.п. за исполнение. Funding: ${result.funding.known ? `${result.funding.events} реальных ставок Binance` : 'недоступен, результат без funding'}.</p>
      <div class="table-wrap"><table><thead><tr><th>Стратегия</th><th>Окно</th><th>Кандидаты</th><th>Условные входы</th><th>Закрыто</th><th>Открыто</th><th>Без входа</th><th>Сумма R</th><th>Средний R</th></tr></thead><tbody>${paperRows}</tbody></table></div>
      <h3>Журнал бумажных сделок</h3><div class="table-wrap"><table><thead><tr><th>Время сигнала</th><th>Стратегия</th><th>Сторона</th><th>Условный вход</th><th>Состояние</th><th>Итог</th><th>События</th></tr></thead><tbody>${tradeRows || '<tr><td colspan="7">Сделок пока нет.</td></tr>'}</tbody></table></div>
      <p class="panel-note">Это моделирование, а не подтверждённые исполнения биржи. История M1 не показывает очередь лимитных заявок и порядок событий внутри свечи. Малое число исходов не подтверждает преимущество.</p>`;
    void refresh();
  } catch (error) {
    $('#replayStatus').textContent = `Исследование не выполнено: ${error.message}`;
    $('#replayResult').textContent = '';
  } finally { button.disabled = false; }
});
$('#export').addEventListener('click', () => {
  if (!report) return;
  downloadJson(report, `orbit-research-v5-${new Date().toISOString().slice(0,10)}.json`);
});
$('#replayExport').addEventListener('click', () => {
  if (!lastReplay) return;
  downloadJson(lastReplay, `orbit-replay-${lastReplay.settings.symbol}-${lastReplay.settings.timeframe}-${lastReplay.period.days}d.json`);
});
function downloadJson(data, filename) {
  const object = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }));
  const link = document.createElement('a');
  link.href = object; link.download = filename;
  link.click(); setTimeout(() => URL.revokeObjectURL(object), 1000);
}
void refresh();
void refreshAi();
setInterval(() => void refresh(), 30000);
