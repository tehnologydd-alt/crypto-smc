-- Extend D1 reserveBudget with estimated model compute caps.
-- UTC Neuron accounting is independent of Kyiv calendar attempt counters.
-- Historical already-consumed attempts are conservatively seeded at
-- 500 reserved Neurons each. Estimates are NOT provider billing.
ALTER TABLE ai_budget ADD COLUMN neuron_day_key TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_budget ADD COLUMN neuron_reserved INTEGER NOT NULL DEFAULT 0 CHECK(neuron_reserved>=0);
UPDATE ai_budget SET
 neuron_day_key=strftime('%Y-%m-%d',last_at/1000,'unixepoch'),
 neuron_reserved=MIN(day_used*500,7500)
 WHERE service='language' AND neuron_day_key='';
