"""Manually promote one evaluated research-only candidate.

No unattended activation, network calls or Android order placement.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from server import FEATURES


def prepare_activation(folder: Path, version: str, reviewed_version: str):
    if not re.fullmatch(r"[A-Za-z0-9]{1,48}", version):
        raise ValueError("Invalid candidate version")
    if reviewed_version != version:
        raise PermissionError("Explicit candidate review confirmation required")
    candidate = folder / f"{version}.candidate.json"
    if not candidate.is_file():
        raise FileNotFoundError("Candidate audit report not found")
    report = json.loads(candidate.read_text(encoding="utf-8"))
    if (report.get("state") != "CANDIDATE_NOT_ACTIVE" or
        report.get("version") != version or
        not re.fullmatch(r"[A-Z0-9]{2,24}", report.get("asset", "")) or
        report.get("feature_keys") != list(FEATURES) or
        type(report.get("train_rows")) is not int or report["train_rows"] < 120 or
        type(report.get("holdout_rows")) is not int or report["holdout_rows"] < 48):
        raise ValueError("Candidate does not meet evaluation metadata requirements")
    hashes = report.get("model_sha256")
    if not isinstance(hashes, dict):
        raise ValueError("No candidate artifact integrity hashes")
    for name, filename in (
        ("xgboost", f"{version}.xgboost.json"),
        ("lightgbm", f"{version}.lightgbm.txt")
    ):
        path = folder / filename
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != hashes.get(name):
            raise ValueError("Candidate artifact integrity mismatch")
    metrics = report.get("models", {})
    baseline = metrics.get("baseline", {}).get("brier")
    if not isinstance(baseline, (float, int)) or not 0 < baseline <= 1:
        raise ValueError("Invalid benchmark")
    for name in ("xgboost", "lightgbm"):
        value = metrics.get(name, {}).get("brier")
        if not isinstance(value, (float, int)) or not 0 <= value < baseline:
            raise ValueError(f"{name} has not beaten the holdout baseline")
    return {
        "version": version,
        "asset": report["asset"],
        "feature_keys": list(FEATURES),
        "model_sha256": hashes,
        "candidate_report_sha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
        "method": "MANUAL_HOLDOUT_REVIEW",
        "notice": "A single historical holdout does not prove future forecasting improvement",
    }


def activate(folder: Path, version: str, reviewed_version: str):
    payload = prepare_activation(folder, version, reviewed_version)
    target = folder / "active.json"
    temporary = folder / "active.json.pending"
    if temporary.exists():
        raise FileExistsError("Activation already pending")
    # Atomic same-volume publication. The operator can restore a previously
    # reviewed candidate, but there is no automatic candidate promotion.
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--confirm-reviewed-version", required=True,
                        help="Re-type reviewed candidate version exactly")
    args = parser.parse_args()
    approved = activate(args.models, args.version, args.confirm_reviewed_version)
    print(json.dumps({"state": "MANUALLY_ACTIVATED",
                      "version": approved["version"],
                      "asset": approved["asset"]}, ensure_ascii=False))
