"""Cloudflare D1 SQLite quota tests; these are local only."""
import sqlite3
import unittest
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


if __name__ == "__main__":
    unittest.main()
