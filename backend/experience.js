import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { newModel, validModel, learnFromOutcome } from './learning.js';
import { buildStatistics } from './statistics.js';
import { RULE_KEYS } from './strategy-rules.js';

// SQLite is the durable journal. state.json remains a cache of UI settings and
// recent runtime state; the database owns signal history and learned outcomes.
export function openExperienceStore(path, legacy = {}) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY, strategy_version INTEGER NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, market TEXT NOT NULL, symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS signals_created ON signals(created_at DESC);
    CREATE TABLE IF NOT EXISTS outcomes (
      signal_id TEXT PRIMARY KEY, strategy_version INTEGER NOT NULL, resolved_at INTEGER NOT NULL,
      label INTEGER NOT NULL CHECK(label IN (0, 1)), market TEXT NOT NULL,
      symbol TEXT NOT NULL, timeframe TEXT NOT NULL, side TEXT NOT NULL,
      features TEXT NOT NULL, prediction REAL NOT NULL, baseline REAL NOT NULL,
      trained_samples INTEGER NOT NULL,
      FOREIGN KEY(signal_id) REFERENCES signals(id)
    );
    CREATE TABLE IF NOT EXISTS model_snapshots (
      version INTEGER PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rule_model_snapshots (
      rule_key TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS market_candles (
    market TEXT NOT NULL, symbol TEXT NOT NULL, timeframe TEXT NOT NULL,
    open_time INTEGER NOT NULL, close_time INTEGER NOT NULL,
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
    close REAL NOT NULL, volume REAL NOT NULL,
    PRIMARY KEY(market,symbol,timeframe,open_time)
  );
  CREATE INDEX IF NOT EXISTS market_candles_close
    ON market_candles(symbol,timeframe,close_time);`);
  const metaRow = db.prepare("SELECT value FROM meta WHERE key='server_id'");
  let serverId = metaRow.get()?.value;
  if (!serverId) {
    serverId = randomUUID();
    db.prepare("INSERT INTO meta(key,value) VALUES('server_id',?)").run(serverId);
  }
  const insertSignal = db.prepare('INSERT OR IGNORE INTO signals (id,strategy_version,created_at,updated_at,market,symbol,timeframe,state,payload) VALUES (?,?,?,?,?,?,?,?,?)');
  const upsertSignal = db.prepare(`INSERT INTO signals (id,strategy_version,created_at,updated_at,market,symbol,timeframe,state,payload)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,state=excluded.state,payload=excluded.payload`);
  const insertOutcome = db.prepare('INSERT OR IGNORE INTO outcomes (signal_id,strategy_version,resolved_at,label,market,symbol,timeframe,side,features,prediction,baseline,trained_samples) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const repairOutcomeVersion = db.prepare('UPDATE outcomes SET strategy_version=? WHERE signal_id=?');
  const repairSignalVersion = db.prepare('UPDATE signals SET strategy_version=? WHERE id=?');
  const selectOutcome = db.prepare('SELECT label FROM outcomes WHERE signal_id=?');
  const selectSignal = db.prepare('SELECT payload FROM signals WHERE id=?');
  const saveModel = db.prepare('INSERT INTO model_snapshots(version,updated_at,payload) VALUES(?,?,?) ON CONFLICT(version) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload');
  const modelRow = db.prepare('SELECT payload FROM model_snapshots WHERE version=3');
  const ruleModelRow = db.prepare('SELECT payload FROM rule_model_snapshots WHERE rule_key=?');
  const saveRuleModel = db.prepare('INSERT INTO rule_model_snapshots(rule_key,updated_at,payload) VALUES(?,?,?) ON CONFLICT(rule_key) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload');
  const signalRows = db.prepare("SELECT payload FROM signals ORDER BY CASE WHEN state IN ('WAITING','OPEN','UNCERTAIN') THEN 0 ELSE 1 END, created_at DESC LIMIT 500");
  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM signals) AS signals, (SELECT COUNT(*) FROM outcomes) AS outcomes');
  const allSignals = db.prepare('SELECT payload FROM signals');
  const allOutcomes = db.prepare('SELECT strategy_version,resolved_at,label,prediction,trained_samples FROM outcomes WHERE strategy_version IN (3,4) ORDER BY resolved_at');
  const insertCandle = db.prepare(`INSERT OR IGNORE INTO market_candles
    (market,symbol,timeframe,open_time,close_time,open,high,low,close,volume)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const candleCoverage = db.prepare(`SELECT symbol,timeframe,COUNT(*) AS candles,
    MIN(open_time) AS firstOpen,MAX(close_time) AS lastClose
    FROM market_candles WHERE market='futures'
    GROUP BY symbol,timeframe ORDER BY symbol,timeframe`);
  let statisticsCache = null;
  const versionOf = signal => signal.strategyVersion || (signal.imbalance ? 2 : 1);
  const rowOf = signal => [signal.id, versionOf(signal), signal.detectedAt, signal.updatedAt || signal.events?.at(-1)?.at || signal.detectedAt,
    signal.market, signal.symbol, signal.timeframe || '1h', signal.state, JSON.stringify(signal)];
  const outcomeOf = signal => [signal.id, versionOf(signal), signal.updatedAt || signal.events?.at(-1)?.at || Date.now(), signal.outcome,
    signal.market, signal.symbol, signal.timeframe, signal.side, JSON.stringify(signal.features),
    signal.quality.probability, signal.quality.baseline, signal.quality.trainedSamples];

  for (const signal of legacy.signals || []) {
    if (typeof signal.id !== 'string' || !signal.events) continue;
    insertSignal.run(...rowOf(signal));
    if ([3,4].includes(versionOf(signal)) && signal.learned && [0, 1].includes(signal.outcome) && signal.quality) insertOutcome.run(...outcomeOf(signal));
  }
  let model;
  try { model = JSON.parse(modelRow.get()?.payload || 'null'); } catch { model = null; }
  if (!validModel(model)) {
    model = validModel(legacy.model) ? legacy.model : newModel();
    saveModel.run(3, Date.now(), JSON.stringify(model));
  }

  const ruleModels = {};
  for (const key of RULE_KEYS) {
    let candidate;
    try { candidate = JSON.parse(ruleModelRow.get(key)?.payload || 'null'); }
    catch { candidate = null; }
    if (!validModel(candidate)) {
      candidate = newModel();
      saveRuleModel.run(key, Date.now(), JSON.stringify(candidate));
    }
    ruleModels[key] = candidate;
  }

  // Older server builds could persist a phone outcome before they knew its
  // strategy key. Recover the model from the durable journal once, without
  // claiming imported phone predictions as independent server validation.
  const journal = db.prepare(`SELECT s.payload,o.strategy_version AS outcome_version,
    s.strategy_version AS signal_version FROM outcomes o
    JOIN signals s ON s.id=o.signal_id
    ORDER BY o.resolved_at,o.signal_id`).all();
  const byRule = new Map();
  for (const row of journal) {
    const signal = JSON.parse(row.payload);
    const version = versionOf(signal);
    if (![3,4].includes(version)) continue;
    if (row.outcome_version !== version) repairOutcomeVersion.run(version,signal.id);
    if (row.signal_version !== version) repairSignalVersion.run(version,signal.id);
    if (!RULE_KEYS.includes(signal.ruleVersion)) continue;
    const records = byRule.get(signal.ruleVersion) || [];
    records.push(signal);
    byRule.set(signal.ruleVersion, records);
  }
  for (const [key, records] of byRule) {
    if (ruleModels[key].samples >= records.length) continue;
    const recovered = newModel();
    for (const signal of records) {
      const replay = { ...signal, learned: false,
        quality: signal.quality ? { ...signal.quality, trainedSamples: 0 } : null };
      if (!learnFromOutcome(recovered, replay)) break;
    }
    if (recovered.samples !== records.length) continue;
    saveRuleModel.run(key, Date.now(), JSON.stringify(recovered));
    ruleModels[key] = recovered;
  }

  return {
    id: serverId,
    loadSignals() { return signalRows.all().map(row => JSON.parse(row.payload)).sort((a, b) => b.detectedAt - a.detectedAt); },
    model,
    ruleModels,
    summary() { const row = counts.get(); return { signals: row.signals, outcomes: row.outcomes }; },
    researchSignals() { return allSignals.all().map(row => JSON.parse(row.payload)); },
    candleCoverage() { return candleCoverage.all().map(row => ({ ...row })); },
    recordCandles(market, symbol, timeframe, candles) {
      if (market !== 'futures' || !/^[A-Z0-9]{2,16}USDT$/.test(symbol) ||
          !['1m','5m','15m','30m','1h','4h','1d'].includes(timeframe) ||
          !Array.isArray(candles)) return 0;
      const minutes = { '1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440 }[timeframe];
      let added = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const candle of candles) {
          if (![candle.time,candle.end,candle.open,candle.high,candle.low,candle.close,candle.volume]
              .every(Number.isFinite) || candle.end !== candle.time + minutes * 60000 - 1 ||
              candle.end >= Date.now() || candle.high < Math.max(candle.open,candle.close,candle.low) ||
              candle.low > Math.min(candle.open,candle.close,candle.high) || candle.volume < 0) continue;
          added += insertCandle.run(market,symbol,timeframe,candle.time,candle.end,
            candle.open,candle.high,candle.low,candle.close,candle.volume).changes;
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return added;
    },
    statistics() {
      if (!statisticsCache) statisticsCache = buildStatistics(allSignals.all().map(row => JSON.parse(row.payload)), allOutcomes.all());
      return statisticsCache;
    },
    saveSignal(signal) { upsertSignal.run(...rowOf(signal)); statisticsCache = null; },
    importSignal(signal) {
      const saved = selectSignal.get(signal.id);
      const existing = saved ? JSON.parse(saved.payload) : null;
      const newestEvent = item => Math.max(item.detectedAt, item.updatedAt || 0, ...item.events.map(event => event.at));
      if (existing && (newestEvent(existing) > newestEvent(signal) ||
          (newestEvent(existing) === newestEvent(signal) && existing.events.length >= signal.events.length)))
        return { stored: false, learned: false };
      // Historical phone outcomes train the weights, but are never counted as
      // independent walk-forward validation of the server's predictions.
      // These reviews belong to this server. A later phone sync may carry new
      // price events, but must not erase or forge its frozen research decisions.
      const merged = { ...signal, researchV5: existing?.researchV5,
        localAi: existing?.localAi };
      const replay = { ...merged, learned: false,
        quality: signal.quality ? { ...signal.quality, trainedSamples: 0 } : null };
      const learned = !selectOutcome.get(signal.id) && this.recordOutcome(replay);
      this.saveSignal(learned ? { ...merged, learned: true, outcome: replay.outcome } : merged);
      return { stored: !existing, learned: Boolean(learned) };
    },
    recordOutcome(signal) {
      if (![3,4].includes(versionOf(signal)) || signal.learned) return false;
      const existing = selectOutcome.get(signal.id);
      if (existing) { signal.learned = true; signal.outcome = existing.label; return false; }
      const ruleKey = signal.ruleVersion || null;
      if (ruleKey && !RULE_KEYS.includes(ruleKey)) return false;
      const sourceModel = ruleKey ? ruleModels[ruleKey] : model;
      const nextModel = structuredClone(sourceModel), nextSignal = { ...signal, learned: false };
      if (!learnFromOutcome(nextModel, nextSignal)) return false;
      const recorded = { ...signal, learned: true, outcome: nextSignal.outcome };
      db.exec('BEGIN IMMEDIATE');
      try {
        upsertSignal.run(...rowOf(recorded));
        const result = insertOutcome.run(...outcomeOf(recorded));
        if (result.changes !== 1) { db.exec('ROLLBACK'); return false; }
        if (ruleKey) saveRuleModel.run(ruleKey, Date.now(), JSON.stringify(nextModel));
        else saveModel.run(3, Date.now(), JSON.stringify(nextModel));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      Object.assign(sourceModel, nextModel);
      signal.learned = true; signal.outcome = nextSignal.outcome;
      statisticsCache = null;
      return true;
    },
    close() { db.close(); }
  };
}

