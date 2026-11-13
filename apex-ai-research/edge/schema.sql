-- APEX private single-user research API. Atomic daily request reservation.
-- Cloudflare Workers AI Neurons allocation is separately enforced by Cloudflare.
CREATE TABLE IF NOT EXISTS ai_usage (
  day_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0)
);

-- Atomic rolling counters for Cloudflare agent and remote CPU calls.
-- Both the daytime and the WHOLE overnight interval use one reservation.
-- These are calls, not actual cloud billing or Workers AI Neurons.
CREATE TABLE IF NOT EXISTS ai_budget (
  service TEXT PRIMARY KEY CHECK (service IN ('language','booster')),
  day_key TEXT NOT NULL,
  day_used INTEGER NOT NULL CHECK (day_used >= 0),
  month_key TEXT NOT NULL,
  month_used INTEGER NOT NULL CHECK (month_used >= 0),
  night_key TEXT NOT NULL,
  night_used INTEGER NOT NULL CHECK (night_used >= 0),
  last_at INTEGER NOT NULL
);
