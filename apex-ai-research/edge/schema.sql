-- APEX private single-user research API. Atomic daily request reservation.
-- Cloudflare Workers AI Neurons allocation is separately enforced by Cloudflare.
CREATE TABLE IF NOT EXISTS ai_usage (
  day_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0)
);
