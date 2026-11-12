"""Test-only synthetic labels verify training plumbing, NOT market accuracy.

Fixtures are generated in temporary directories and never published to APEX.
"""
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
import train


class APEXResearchServerTests(unittest.TestCase):
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
                    "version":"ciTest1","asset":"BTCUSDT"
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
