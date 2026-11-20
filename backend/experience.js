import { DatabaseSync } from 'node:sqlite';
import { newModel, validModel, learnFromOutcome } from './learning.js';
import { buildStatistics } from './statistics.js';

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
    );`);
  const insertSignal = db.prepare('INSERT OR IGNORE INTO signals (id,strategy_version,created_at,updated_at,market,symbol,timeframe,state,payload) VALUES (?,?,?,?,?,?,?,?,?)');
  const upsertSignal = db.prepare(`INSERT INTO signals (id,strategy_version,created_at,updated_at,market,symbol,timeframe,state,payload)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,state=excluded.state,payload=excluded.payload`);
  const insertOutcome = db.prepare('INSERT OR IGNORE INTO outcomes (signal_id,strategy_version,resolved_at,label,market,symbol,timeframe,side,features,prediction,baseline,trained_samples) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const selectOutcome = db.prepare('SELECT label FROM outcomes WHERE signal_id=?');
  const saveModel = db.prepare('INSERT INTO model_snapshots(version,updated_at,payload) VALUES(?,?,?) ON CONFLICT(version) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload');
  const modelRow = db.prepare('SELECT payload FROM model_snapshots WHERE version=2');
  const signalRows = db.prepare("SELECT payload FROM signals ORDER BY CASE WHEN state IN ('WAITING','OPEN','UNCERTAIN') THEN 0 ELSE 1 END, created_at DESC LIMIT 500");
  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM signals) AS signals, (SELECT COUNT(*) FROM outcomes) AS outcomes');
  const allSignals = db.prepare('SELECT payload FROM signals');
  const allOutcomes = db.prepare('SELECT strategy_version,resolved_at,label,prediction,trained_samples FROM outcomes ORDER BY resolved_at');
  let statisticsCache = null;
  const versionOf = signal => signal.imbalance ? 2 : 1;
  const rowOf = signal => [signal.id, versionOf(signal), signal.detectedAt, signal.updatedAt || signal.events?.at(-1)?.at || signal.detectedAt,
    signal.market, signal.symbol, signal.timeframe || '1h', signal.state, JSON.stringify(signal)];
  const outcomeOf = signal => [signal.id, 2, signal.updatedAt || signal.events?.at(-1)?.at || Date.now(), signal.outcome,
    signal.market, signal.symbol, signal.timeframe, signal.side, JSON.stringify(signal.features),
    signal.quality.probability, signal.quality.baseline, signal.quality.trainedSamples];

  for (const signal of legacy.signals || []) {
    if (typeof signal.id !== 'string' || !signal.events) continue;
    insertSignal.run(...rowOf(signal));
    if (signal.imbalance && signal.learned && [0, 1].includes(signal.outcome) && signal.quality) insertOutcome.run(...outcomeOf(signal));
  }
  let model;
  try { model = JSON.parse(modelRow.get()?.payload || 'null'); } catch { model = null; }
  if (!validModel(model)) {
    model = validModel(legacy.model) ? legacy.model : newModel();
    saveModel.run(2, Date.now(), JSON.stringify(model));
  }

  return {
    loadSignals() { return signalRows.all().map(row => JSON.parse(row.payload)).sort((a, b) => b.detectedAt - a.detectedAt); },
    model,
    summary() { const row = counts.get(); return { signals: row.signals, outcomes: row.outcomes }; },
    statistics() {
      if (!statisticsCache) statisticsCache = buildStatistics(allSignals.all().map(row => JSON.parse(row.payload)), allOutcomes.all());
      return statisticsCache;
    },
    saveSignal(signal) { upsertSignal.run(...rowOf(signal)); statisticsCache = null; },
    recordOutcome(signal) {
      if (!signal.imbalance || signal.learned) return false;
      const existing = selectOutcome.get(signal.id);
      if (existing) { signal.learned = true; signal.outcome = existing.label; return false; }
      const nextModel = structuredClone(model), nextSignal = { ...signal, learned: false };
      if (!learnFromOutcome(nextModel, nextSignal)) return false;
      const recorded = { ...signal, learned: true, outcome: nextSignal.outcome };
      db.exec('BEGIN IMMEDIATE');
      try {
        upsertSignal.run(...rowOf(recorded));
        const result = insertOutcome.run(...outcomeOf(recorded));
        if (result.changes !== 1) { db.exec('ROLLBACK'); return false; }
        saveModel.run(2, Date.now(), JSON.stringify(nextModel));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      Object.assign(model, nextModel);
      signal.learned = true; signal.outcome = nextSignal.outcome;
      statisticsCache = null;
      return true;
    },
    close() { db.close(); }
  };
}

