"""Test-only synthetic labels verify training plumbing, NOT market accuracy.

Fixtures are generated in temporary directories and never published to APEX.
"""
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
import server
import train
import activate
import training_window
from datetime import datetime,timezone
import hashlib


class APEXResearchServerTests(unittest.TestCase):
    def test_training_window_follows_kyiv_winter_and_summer_dst(self):
        moment=lambda stamp: datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)
        self.assertEqual(training_window.research_mode(moment("2026-11-13T20:59:00")), "ACTIVE")
        self.assertEqual(training_window.research_mode(moment("2026-11-13T21:00:00")), "ECO")
        self.assertFalse(training_window.training_permitted(moment("2026-11-14T05:59:00")))
        self.assertTrue(training_window.training_permitted(moment("2026-11-14T06:00:00")))
        self.assertTrue(training_window.training_permitted(moment("2026-07-13T19:59:00")))
        self.assertFalse(training_window.training_permitted(moment("2026-07-13T20:00:00")))


    def test_feature_schema_and_untrained_status(self):
        from fastapi import HTTPException
        with tempfile.TemporaryDirectory() as temporary:
            old = server.DATA_DIR
            server.DATA_DIR = Path(temporary)
            try:
                self.assertFalse(server.health()["model_available"])
                self.assertEqual(server.model_status()["state"], "NOT_TRAINED")
                with self.assertRaises(HTTPException) as error:
                    server.predict(server.InputPayload(observation={
                        "asset":"BTCUSDT","source_ids":["test:ci"],
                        "features":dict.fromkeys(server.FEATURES,0.0)
                    }))
                self.assertEqual(error.exception.status_code,409)
                with self.assertRaises(HTTPException):
                    server.validate_features({"unexpected":1.0})
            finally:
                server.DATA_DIR = old

    def test_training_creates_only_an_unevaluated_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            source = folder / "ci-only-data.jsonl"
            now = min(int(time.time())-10000,1700000000)
            rows=[]
            for i in range(260):
                row = {
                    "asset":"BTCUSDT",
                    "observed_at":now-10000000+i*120,
                    "resolved_at":now-10000000+i*120+60,
                    "label":int(i%3!=0),
                    "source_ids":["test-only-not-a-real-exchange-source"],
                    "features":{k:float((i*13+j*7)%37)/100.0
                                for j,k in enumerate(server.FEATURES)}
                }
                rows.append(json.dumps(row))
            source.write_text("\n".join(rows)+"\n",encoding="utf-8")
            model_dir = folder / "models"
            report=train.train(source,model_dir,"ciTest1")
            self.assertEqual(report["state"],"CANDIDATE_NOT_ACTIVE")
            self.assertEqual(report["asset"],"BTCUSDT")
            self.assertEqual(report["holdout_rows"],52)
            self.assertFalse((model_dir/"active.json").exists())
            self.assertTrue((model_dir/"ciTest1.xgboost.json").exists())
            self.assertTrue((model_dir/"ciTest1.lightgbm.txt").exists())
            self.assertTrue((model_dir/"ciTest1.candidate.json").exists())
            self.assertIn("baseline",report["models"])
            self.assertIn("brier",report["models"]["xgboost"])
            self.assertIn("brier",report["models"]["lightgbm"])
            old = server.DATA_DIR
            server.DATA_DIR = model_dir
            try:
                self.assertEqual(server.model_status()["state"],"NOT_TRAINED")
                (model_dir/"active.json").write_text(json.dumps({
                    "version":"ciTest1","asset":"BTCUSDT",
                    "feature_keys":list(server.FEATURES),
                    "model_sha256":report["model_sha256"]
                }),encoding="utf-8")
                self.assertEqual(server.model_status()["state"],"ACTIVE")
                features={k:0.1 for k in server.FEATURES}
                payload=server.InputPayload(observation={
                    "asset":"BTCUSDT","source_ids":["unit-test-only"],
                    "features":features
                })
                output=server.predict(payload)
                self.assertEqual(output["state"],"MODEL_ESTIMATE")
                self.assertLessEqual(output["disagreement"],1.0)
                with self.assertRaises(Exception):
                    server.predict(server.InputPayload(observation={
                        "asset":"ETHUSDT","source_ids":["unit-test-only"],
                        "features":features
                    }))
            finally:
                server.DATA_DIR=old
                server._cached_key=None
                server._cached_models=None

    def test_manual_activation_requires_review_and_verified_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            version = "ciOnly1"
            x = directory / (version + ".xgboost.json")
            l = directory / (version + ".lightgbm.txt")
            x.write_text("UNIT_TEST_NON_MODEL_1", encoding="utf-8")
            l.write_text("UNIT_TEST_NON_MODEL_2", encoding="utf-8")
            hashes = {
                "xgboost": hashlib.sha256(x.read_bytes()).hexdigest(),
                "lightgbm": hashlib.sha256(l.read_bytes()).hexdigest(),
            }
            report = {
                "state": "CANDIDATE_NOT_ACTIVE",
                "version": version, "asset": "BTCUSDT",
                "feature_keys": list(server.FEATURES),
                "train_rows": 200, "holdout_rows": 50,
                "model_sha256": hashes,
                "models": {
                    "baseline": {"brier": 0.25},
                    "xgboost": {"brier": 0.20},
                    "lightgbm": {"brier": 0.21},
                },
            }
            (directory / (version + ".candidate.json")).write_text(
                json.dumps(report), encoding="utf-8"
            )
            with self.assertRaises(PermissionError):
                activate.activate(directory, version, "different")
            self.assertFalse((directory / "active.json").exists())
            approved = activate.activate(directory, version, version)
            self.assertEqual(approved["asset"], "BTCUSDT")
            self.assertTrue((directory / "active.json").is_file())
            x.write_text("CORRUPTED_UNIT_TEST_FILE", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "integrity mismatch"):
                activate.prepare_activation(directory, version, version)

    def test_incomplete_and_cross_asset_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            file=Path(temporary)/"rows.jsonl"
            file.write_text(json.dumps({
                "asset":"BTCUSDT","observed_at":100,
                "resolved_at":200,"label":1,
                "source_ids":["unit-test-only"],
                "features":{k:0.1 for k in server.FEATURES}
            })+"\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"Minimum 240"):
                train.load_rows(file)

if __name__=="__main__":
    unittest.main()
