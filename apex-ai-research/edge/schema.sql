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


-- Manual approval of individual Android device public keys.
-- Never put APEX_EDGE_TOKEN or an app-wide secret in the APK.
CREATE TABLE IF NOT EXISTS ai_devices (
  device_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  verification_code TEXT NOT NULL UNIQUE,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  created_at INTEGER NOT NULL
);

-- Replay denial: a signed nonce can be consumed only once.
CREATE TABLE IF NOT EXISTS ai_device_nonces (
  device_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, nonce)
);

-- Global bounded enrollment attempts; a request never invokes Workers AI.
CREATE TABLE IF NOT EXISTS ai_pair_guard (
  day_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 0 AND 6)
);
