"""Cloudflare D1 SQLite quota tests; these are local only."""
import sqlite3
import unittest
import re
from pathlib import Path

SCHEMA = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")


class DailyQuotaTests(unittest.TestCase):
    def test_atomic_cap_cannot_exceed_twelve_attempts(self):
        connection = sqlite3.connect(":memory:")
        connection.executescript(SCHEMA)
        sql = """INSERT INTO ai_usage(day_key,attempts) VALUES(?1,1)
ON CONFLICT(day_key) DO UPDATE SET attempts=ai_usage.attempts+1
WHERE ai_usage.attempts<12 RETURNING attempts"""
        counts = []
        for _ in range(20):
            row = connection.execute(sql, ("2026-11-12",)).fetchone()
            counts.append(row[0] if row else None)
        self.assertEqual(counts[:12], list(range(1, 13)))
        self.assertEqual(counts[12:], [None] * 8)
        self.assertEqual(connection.execute(
            "SELECT attempts FROM ai_usage WHERE day_key=?", ("2026-11-12",)
        ).fetchone()[0], 12)
        self.assertEqual(connection.execute(sql, ("2026-11-13",)).fetchone()[0], 1)
        connection.close()



    def test_real_governor_sql_enforces_day_month_overnight_and_gap(self):
        script = Path(__file__).with_name("budget-governor.mjs").read_text(encoding="utf-8")
        match = re.search(r"const sql=`(INSERT INTO ai_budget.*?)`;", script, re.S)
        self.assertIsNotNone(match)
        sql = match.group(1)
        db = sqlite3.connect(":memory:")
        db.executescript(SCHEMA)
        # 23:15 Kyiv on 13 November, then 00:15 Kyiv next calendar day
        start = 1794604500000
        def reserve(service, day, month, night, at, gap, day_cap, month_cap, night_cap):
            return db.execute(sql, (service, day, month, night, int(bool(night)),
                                    at, gap, day_cap, month_cap, night_cap)).fetchone()
        self.assertIsNotNone(reserve("language","2026-11-13","2026-11",
                                     "2026-11-13",start,60000,12,280,1))
        self.assertIsNone(reserve("language","2026-11-13","2026-11",
                                  "2026-11-13",start+1000,60000,12,280,1))
        self.assertIsNone(reserve("language","2026-11-14","2026-11",
                                  "2026-11-13",start+3600000,60000,12,280,1))
        self.assertIsNotNone(reserve("language","2026-11-14","2026-11",
                                     "",start+9*3600000,60000,12,280,1))
        # Day cap is applied after the first day request and resets only on a new day.
        used = 1
        for i in range(11):
            self.assertIsNotNone(reserve("language","2026-11-14","2026-11",
                                         "",start+10*3600000+i*3600000,
                                         60000,12,280,1))
            used += 1
        self.assertEqual(used,12)
        self.assertIsNone(reserve("language","2026-11-14","2026-11","",
                                  start+25*3600000,60000,12,280,1))
        # Different service has independent counters and monthly cap.
        t=start+25*3600000
        self.assertIsNotNone(reserve("booster","2026-11-15","2026-11","",
                                     t,0,100,1,4))
        self.assertIsNone(reserve("booster","2026-11-15","2026-11","",
                                  t+1000,0,100,1,4))
        db.close()

if __name__ == "__main__":
    unittest.main()
