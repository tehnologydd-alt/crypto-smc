"""Train two INDEPENDENT CPU challenger models from verified, completed labels.

Never generate synthetic candles, predictions, outcomes or backfill labels.
Candidate artifacts are not published to the API until manually activated.
"""
import argparse
import hashlib
import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import xgboost as xgb
import lightgbm as lgb
from sklearn.metrics import brier_score_loss, log_loss

from server import FEATURES

def load_rows(path: Path):
    records = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        raw = json.loads(line)
        keys = set(raw)
        if keys != {"asset", "observed_at", "resolved_at", "label", "source_ids", "features"}:
            raise ValueError(f"Line {line_number}: unexpected or missing field")
        if not (isinstance(raw["asset"], str) and raw["asset"].isalnum()
                and raw["asset"].isupper() and 2 <= len(raw["asset"]) <= 24):
            raise ValueError(f"Line {line_number}: invalid asset")
        if type(raw["label"]) is not int or raw["label"] not in (0, 1):
            raise ValueError(f"Line {line_number}: outcome not confirmed")
        if (type(raw["observed_at"]) is not int or
            type(raw["resolved_at"]) is not int or
            raw["observed_at"] >= raw["resolved_at"] or
            raw["resolved_at"] > int(time.time())):
            raise ValueError(f"Line {line_number}: invalid observation/outcome timing")
        if not (isinstance(raw["source_ids"], list) and
                all(isinstance(x, str) and x.strip() for x in raw["source_ids"])):
            raise ValueError(f"Line {line_number}: source lineage required")
        features = raw["features"]
        if not isinstance(features, dict) or set(features) != set(FEATURES):
            raise ValueError(f"Line {line_number}: feature schema mismatch")
        arr = [float(features[k]) for k in FEATURES]
        if not all(math.isfinite(x) for x in arr):
            raise ValueError(f"Line {line_number}: non-finite feature")
        records.append((raw["observed_at"], raw["resolved_at"], raw["label"], arr))
    records.sort(key=lambda item: item[0])
    if len(records) < 240:
        raise ValueError("Minimum 240 real, completed observations required")
    if len(set(r[0] for r in records)) != len(records):
        raise ValueError("Duplicate observation timestamps")
    return records

def train(path, output_dir, version):
    if not version.isalnum() or len(version) > 48:
        raise ValueError("Version may only contain letters and digits")
    rows = load_rows(path)
    split = int(len(rows) * 0.8)
    test = rows[split:]
    test_start = test[0][0]
    # Exclude outcomes that were not yet known at the start of holdout.
    train_rows = [r for r in rows[:split] if r[1] < test_start]
    if len(train_rows) < 120:
        raise ValueError("Too few historical labels available before holdout")
    X = np.asarray([r[3] for r in train_rows], dtype=np.float64)
    y = np.asarray([r[2] for r in train_rows], dtype=np.int64)
    T = np.asarray([r[3] for r in test], dtype=np.float64)
    z = np.asarray([r[2] for r in test], dtype=np.int64)
    if len(set(y)) != 2 or len(set(z)) != 2:
        raise ValueError("Both outcome classes must appear in train and holdout")
    m1 = xgb.XGBClassifier(
        n_estimators=120,max_depth=3,learning_rate=0.04,
        subsample=0.8,colsample_bytree=0.8,eval_metric="logloss",
        n_jobs=2,random_state=17,tree_method="hist"
    )
    m2 = lgb.LGBMClassifier(
        n_estimators=120,max_depth=3,num_leaves=9,learning_rate=0.04,
        min_child_samples=20,n_jobs=2,random_state=17,verbosity=-1
    )
    m1.fit(X,y)
    m2.fit(X,y)
    p1 = np.clip(m1.predict_proba(T)[:,1],1e-6,1-1e-6)
    p2 = np.clip(m2.predict_proba(T)[:,1],1e-6,1-1e-6)
    baseline = np.full(len(z),y.mean(),dtype=np.float64)
    def stats(prob):
        return {"brier":round(float(brier_score_loss(z,prob)),6),
                "log_loss":round(float(log_loss(z,prob,labels=[0,1])),6)}
    score = {"baseline":stats(baseline),"xgboost":stats(p1),
             "lightgbm":stats(p2)}
    folder = Path(output_dir)
    folder.mkdir(parents=True,exist_ok=True)
    x_path = folder / f"{version}.xgboost.json"
    l_path = folder / f"{version}.lightgbm.txt"
    report_path = folder / f"{version}.candidate.json"
    if any(p.exists() for p in (x_path,l_path,report_path)):
        raise FileExistsError("Model version already exists, never overwrite")
    m1.save_model(x_path)
    m2.booster_.save_model(str(l_path))
    report = {
        "state":"CANDIDATE_NOT_ACTIVE",
        "version":version,
        "trained_at":datetime.now(timezone.utc).isoformat(),
        "feature_keys":list(FEATURES),
        "source_file_sha256":hashlib.sha256(path.read_bytes()).hexdigest(),
        "train_rows":len(train_rows),
        "holdout_rows":len(z),
        "holdout_from":test_start,
        "holdout_to":test[-1][0],
        "models":score,
        "beats_baseline_brier":{
            "xgboost":score["xgboost"]["brier"]<score["baseline"]["brier"],
            "lightgbm":score["lightgbm"]["brier"]<score["baseline"]["brier"]
        },
        "warning":"Time-ordered holdout only; check leakage, regimes, calibration and real-world generalization. Candidate is never activated automatically."
    }
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",
                           encoding="utf-8")
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--observations",type=Path,required=True)
    parser.add_argument("--models",type=Path,default=Path("/srv/apex/models"))
    parser.add_argument("--version",required=True)
    args=parser.parse_args()
    print(json.dumps(train(args.observations,args.models,args.version),
                     ensure_ascii=False,indent=2))
