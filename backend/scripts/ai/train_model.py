"""Train an auditable non-negative additive ranker from verified, de-identified outcomes.
No pickle, third-party dependencies, synthetic production labels or network calls.
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

FEATURES = ("fit", "travel", "quality", "reliability", "workload")
BASELINE = [30.0, 25.0, 20.0, 15.0, 10.0]


def load_rows(path):
    if path.stat().st_size > 50_000_000:
        raise ValueError("Dataset exceeds 50 MB")
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if set(row) != {"groupId", "occurredAt", "features", "targetScore", "verified"} or row["verified"] is not True:
            raise ValueError("Only verified, explicitly scoped outcomes are permitted")
        if not isinstance(row["groupId"], str) or not 8 <= len(row["groupId"]) <= 80 or not all(c.isalnum() or c in "_-" for c in row["groupId"]):
            raise ValueError("Opaque booking group ID required; no contact data")
        if set(row["features"]) != set(FEATURES):
            raise ValueError("Feature contract mismatch")
        values = [row["features"][key] for key in FEATURES]
        if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or not 0 <= x <= 1 for x in values):
            raise ValueError("Normalized numeric features required")
        target = row["targetScore"]
        if isinstance(target, bool) or not isinstance(target, (int, float)) or not math.isfinite(target) or not 0 <= target <= 100:
            raise ValueError("Verified outcome target must be between 0 and 100")
        date = datetime.fromisoformat(row["occurredAt"].replace("Z", "+00:00"))
        if date.tzinfo is None or date > datetime.now(timezone.utc):
            raise ValueError("Past timezone-aware outcome time required")
        rows.append({"group": row["groupId"], "date": date, "x": values, "y": target})
    if len(rows) < 200:
        raise ValueError("At least 200 verified observations required; do not generate fake training data")
    return rows


def temporal_split(rows):
    # Keep every observation of one booking in a single fold. Exclude any group
    # spanning the temporal cutoff; otherwise future outcomes leak into training.
    groups = {}
    for row in rows:
        groups.setdefault(row["group"], []).append(row)
    if len(groups) < 50:
        raise ValueError("At least 50 independent booking groups required")
    last_date = {group: max(r["date"] for r in entries) for group, entries in groups.items()}
    ordered = sorted(groups, key=last_date.__getitem__)
    test_groups = set(ordered[int(len(ordered) * 0.8):])
    cutoff = min(r["date"] for group in test_groups for r in groups[group])
    train = [r for group in ordered if group not in test_groups and last_date[group] < cutoff for r in groups[group]]
    test = [r for group in test_groups for r in groups[group]]
    if len(train) < 100 or len(test_groups) < 10:
        raise ValueError("Insufficient disjoint chronological training/test data")
    return train, test, len(test_groups)


def mae(rows, weights):
    return sum(abs(sum(a * b for a, b in zip(row["x"], weights)) - row["y"]) for row in rows) / len(rows)


def fit(train):
    weights = BASELINE[:]
    for _ in range(1000):
        gradient = [0.0] * len(FEATURES)
        for row in train:
            error = sum(a * b for a, b in zip(row["x"], weights)) - row["y"]
            for index, value in enumerate(row["x"]):
                gradient[index] += 2 * error * value / len(train)
        weights = [max(0.001, w - 0.04 * g) for w, g in zip(weights, gradient)]
        total = sum(weights)
        weights = [w * 100 / total for w in weights]
    return weights


def train_model(rows, version):
    train, test, test_groups = temporal_split(rows)
    values = fit(train)
    trained_until = max(row["date"] for row in rows).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {"version": version, "weights": dict(zip(FEATURES, values)), "trainingRows": len(train),
            "testMae": mae(test, values), "baselineMae": mae(test, BASELINE), "testGroups": test_groups,
            "trainedUntil": trained_until, "state": "DRAFT"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Output exists; choose a new immutable model version")
    artifact = train_model(load_rows(args.dataset), args.version)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"state": "DRAFT", "trainingRows": artifact["trainingRows"], "testMae": artifact["testMae"], "baselineMae": artifact["baselineMae"],
                      "datasetSha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(), "improved": artifact["testMae"] < artifact["baselineMae"]}))


if __name__ == "__main__":
    main()
