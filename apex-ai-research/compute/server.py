"""APEX AI Collective: authenticated CPU prediction service.

This service cannot invent a trained model. No live prediction is returned
until a separately evaluated candidate is activated on the server.
"""
import json
import math
import os
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

FEATURES = (
    "return_1m", "return_5m", "volatility_15m", "volume_z_15m",
    "spread_bps", "book_imbalance", "large_trade_pressure",
    "whale_flow_score", "relative_volume", "cross_venue_disagreement",
)
DATA_DIR = Path(os.environ.get("APEX_MODEL_DIR", "/srv/apex/models"))
app = FastAPI(title="APEX CPU Research", docs_url=None, redoc_url=None,
              openapi_url=None)
_cached_key = None
_cached_models = None


def require_key(authorization: Annotated[str | None, Header()] = None):
    expected = os.environ.get("APEX_COMPUTE_TOKEN", "")
    if len(expected) < 32 or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing server authorization")
    received = authorization[7:]
    if not secrets.compare_digest(received, expected):
        raise HTTPException(401, "Invalid server authorization")


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: dict[str, float] = Field(description="Only real measured values")
    source_ids: list[str] = Field(min_length=1, max_length=20)


class InputPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    observation: Observation


def validate_features(values: dict[str, float]) -> list[float]:
    if set(values) != set(FEATURES):
        raise HTTPException(422, "Feature schema mismatch")
    result = [float(values[key]) for key in FEATURES]
    if not all(math.isfinite(x) for x in result):
        raise HTTPException(422, "Non-finite market observation")
    return result


def load_active():
    global _cached_key, _cached_models
    active = DATA_DIR / "active.json"
    if not active.exists():
        return None
    try:
        meta = json.loads(active.read_text(encoding="utf-8"))
        version = meta["version"]
        if not isinstance(version, str) or not version.isalnum():
            return None
        xgb_path = DATA_DIR / f"{version}.xgboost.json"
        lgb_path = DATA_DIR / f"{version}.lightgbm.txt"
        if not xgb_path.exists() or not lgb_path.exists():
            return None
        key = (version, active.stat().st_mtime_ns,
               xgb_path.stat().st_mtime_ns, lgb_path.stat().st_mtime_ns)
        if key != _cached_key:
            import lightgbm as lgb
            import xgboost as xgb
            left = xgb.XGBClassifier()
            left.load_model(xgb_path)
            right = lgb.Booster(model_file=str(lgb_path))
            _cached_models = left, right, meta
            _cached_key = key
        return _cached_models
    except (OSError, ValueError, KeyError, TypeError):
        return None


@app.get("/health")
def health():
    # Public health does not expose model signatures, tokens or source data.
    return {"service": "apex-cpu", "status": "RUNNING",
            "model_available": load_active() is not None}


@app.get("/v1/models/status", dependencies=[Depends(require_key)])
def model_status():
    active = load_active()
    return {"state": "ACTIVE" if active else "NOT_TRAINED",
            "version": active[2].get("version") if active else None,
            "features": FEATURES}


@app.post("/v1/predict", dependencies=[Depends(require_key)])
def predict(payload: InputPayload):
    models = load_active()
    if models is None:
        raise HTTPException(409, "No evaluated model has been activated")
    row = validate_features(payload.observation.features)
    import numpy as np
    x = np.asarray([row], dtype="float64")
    xgb, lightgbm, meta = models
    a = float(xgb.predict_proba(x)[0][1])
    b = float(lightgbm.predict(x)[0])
    if not all(math.isfinite(v) and 0 <= v <= 1 for v in (a, b)):
        raise HTTPException(503, "Model returned invalid probability")
    return {
        "state": "MODEL_ESTIMATE", "model_version": meta["version"],
        "xgboost_p": round(a, 6), "lightgbm_p": round(b, 6),
        "disagreement": round(abs(a - b), 6),
        "source_ids": payload.observation.source_ids,
        "notice": "Research estimate, not a trading instruction",
    }
