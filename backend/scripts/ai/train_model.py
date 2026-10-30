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
LABEL = "VERIFIED_CUSTOMER_SATISFACTION_V1"


def past_instant(value):
    if not isinstance(value, str):
        raise ValueError("Timezone-aware timestamp required")
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None or date > datetime.now(timezone.utc):
        raise ValueError("Past timezone-aware timestamp required")
    return date


def opaque_id(value):
    if not isinstance(value, str) or not 8 <= len(value) <= 80 or not all(c.isascii() and (c.isalnum() or c in "_-") for c in value):
        raise ValueError("Opaque source ID required; no contact data")
    return value


def load_rows(path, data=None):
    if path.stat().st_size > 50_000_000:
        raise ValueError("Dataset exceeds 50 MB")
    rows = []
    observations = set()
    data = path.read_bytes() if data is None else data
    if len(data) > 50_000_000:
        raise ValueError("Dataset exceeds 50 MB")
    for line in data.decode("utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        required = {"groupId", "observationId", "occurredAt", "decisionAt", "featuresAsOf",
                    "features", "targetScore", "verified", "rating", "labelVersion"}
        if not isinstance(row, dict) or set(row) != required or row["verified"] is not True or row["labelVersion"] != LABEL:
            raise ValueError("Verified satisfaction v1 and point-in-time provenance required; legacy rows cannot train")
        opaque_id(row["groupId"])
        observation = opaque_id(row["observationId"])
        if observation in observations:
            raise ValueError("Duplicate outcome source; retries cannot inflate training observations")
        observations.add(observation)
        if not isinstance(row["features"], dict):
            raise ValueError("Feature contract mismatch")
        if set(row["features"]) != set(FEATURES):
            raise ValueError("Feature contract mismatch")
        values = [row["features"][key] for key in FEATURES]
        if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or not 0 <= x <= 1 for x in values):
            raise ValueError("Normalized numeric features required")
        target = row["targetScore"]
        if isinstance(target, bool) or not isinstance(target, (int, float)) or not math.isfinite(target) or not 0 <= target <= 100:
            raise ValueError("Verified outcome target must be between 0 and 100")
        rating = row["rating"]
        if type(rating) is not int or not 1 <= rating <= 5 or target != (rating - 1) * 25:
            raise ValueError("Target must derive from verified customer rating: (stars - 1) * 25")
        date = past_instant(row["occurredAt"])
        decision = past_instant(row["decisionAt"])
        if not isinstance(row["featuresAsOf"], dict) or set(row["featuresAsOf"]) != set(FEATURES):
            raise ValueError("Each feature needs its own availability timestamp")
        if decision >= date or any(past_instant(at) > decision for at in row["featuresAsOf"].values()):
            raise ValueError("Feature leakage: inputs must exist at decision time, before the outcome")
        rows.append({"group": row["groupId"], "date": date, "decision": decision, "x": values, "y": target})
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
    # Training outcomes must already exist at the earliest held-out decision.
    # Splitting on outcome time alone can leak outcomes that arrive after prediction.
    cutoff = min(r.get("decision", r["date"]) for group in test_groups for r in groups[group])
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
    evidence_path = args.output.with_suffix(args.output.suffix + ".evidence.json")
    if args.output.exists() or evidence_path.exists():
        raise ValueError("Output exists; choose a new immutable model version")
    if args.dataset.stat().st_size > 50_000_000:
        raise ValueError("Dataset exceeds 50 MB")
    data = args.dataset.read_bytes()
    rows = load_rows(args.dataset, data)
    artifact = train_model(rows, args.version)
    train, test, test_groups = temporal_split(rows)
    serialized = json.dumps(artifact, ensure_ascii=False, indent=2)
    evidence = {"labelVersion": LABEL, "datasetSha256": hashlib.sha256(data).hexdigest(),
                "artifactSha256": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
                "trainingRows": len(train), "testRows": len(test), "testGroups": test_groups,
                "purgedRows": len(rows) - len(train) - len(test),
                "latestTrainingOutcome": max(row["date"] for row in train).isoformat(),
                "earliestTestDecision": min(row["decision"] for row in test).isoformat(),
                "sourceVerification": "OPERATOR_ATTESTED_REQUIRES_INDEPENDENT_REVIEW",
                "state": "DRAFT"}
    with args.output.open("x", encoding="utf-8", newline="\n") as output:
        output.write(serialized)
    with evidence_path.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(evidence, output, ensure_ascii=False, indent=2)
    print(json.dumps({"state": "DRAFT", "trainingRows": artifact["trainingRows"], "testMae": artifact["testMae"], "baselineMae": artifact["baselineMae"],
                      "labelVersion": LABEL, "datasetSha256": evidence["datasetSha256"],
                      "improved": artifact["testMae"] < artifact["baselineMae"]}))


if __name__ == "__main__":
    main()
