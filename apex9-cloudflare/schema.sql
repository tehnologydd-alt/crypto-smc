-- Free D1 storage. Apply once using Wrangler d1 execute --remote.
-- One provider reservation = one upstream attempt, including failures.
CREATE TABLE IF NOT EXISTS news_quota (
 provider TEXT PRIMARY KEY NOT NULL,
 day_key TEXT NOT NULL,
 day_used INTEGER NOT NULL DEFAULT 0 CHECK (day_used >= 0),
 month_key TEXT NOT NULL,
 month_used INTEGER NOT NULL DEFAULT 0 CHECK (month_used >= 0),
 last_at INTEGER NOT NULL CHECK (last_at >= 0)
);
CREATE TABLE IF NOT EXISTS news_cache (
 provider TEXT NOT NULL,
 coin TEXT NOT NULL,
 stored_at INTEGER NOT NULL CHECK (stored_at >= 0),
 payload TEXT NOT NULL,
 PRIMARY KEY (provider, coin)
);
