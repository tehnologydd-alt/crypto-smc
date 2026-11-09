"""Execute the exact Worker quota UPSERT against real SQLite with atomic writes."""
import pathlib
import re
import sqlite3
import unittest
from datetime import datetime, timedelta, timezone

HERE=pathlib.Path(__file__).resolve().parent
SOURCE=(HERE/"worker.mjs").read_text()
MATCH=re.search(r"const stmt=`(INSERT INTO news_quota.+?RETURNING provider)`",SOURCE,re.S)
if not MATCH:
    raise RuntimeError("Could not locate real Worker D1 reservation SQL")
SQL=MATCH.group(1)
SCHEMA=(HERE/"schema.sql").read_text()
START=datetime(2026,11,1,0,0,tzinfo=timezone.utc)

def args(provider,at):
    return (provider,at.strftime("%Y-%m-%d"),at.strftime("%Y-%m"),
            int(at.timestamp()*1000),21600000,4,100)

class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA)
    def tearDown(self):
        self.db.close()
    def reserve(self,provider,at):
        return self.db.execute(SQL,args(provider,at)).fetchone() is not None
    def test_one_per_six_hours_four_per_day(self):
        self.assertTrue(self.reserve("newsdata",START))
        self.assertFalse(self.reserve("newsdata",START+timedelta(minutes=1)))
        self.assertFalse(self.reserve("newsdata",START-timedelta(seconds=1)))
        self.assertTrue(self.reserve("newsdata",START+timedelta(hours=6)))
        self.assertTrue(self.reserve("newsdata",START+timedelta(hours=12)))
        self.assertTrue(self.reserve("newsdata",START+timedelta(hours=18)))
        self.assertFalse(self.reserve("newsdata",START+timedelta(hours=23)))
        self.assertTrue(self.reserve("newsdata",START+timedelta(days=1)))
    def test_source_budgets_independent(self):
        self.assertTrue(self.reserve("newsdata",START))
        self.assertTrue(self.reserve("cryptopanic",START))
    def test_monthly_limit_survives_daily_reset(self):
        for day in range(25):
            for hour in (0,6,12,18):
                self.assertTrue(self.reserve("newsdata",START+timedelta(days=day,hours=hour)))
        self.assertFalse(self.reserve("newsdata",START+timedelta(days=25)))
        self.assertTrue(self.reserve("newsdata",datetime(2026,12,1,tzinfo=timezone.utc)))
if __name__=="__main__":
    unittest.main()
