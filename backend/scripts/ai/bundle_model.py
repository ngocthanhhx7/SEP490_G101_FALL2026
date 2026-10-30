"""Package learned weights and evidence for transfer; no training, DB or activation.

A valid bundle still requires independent source/evaluation review before promotion.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import zipfile

from train_model import FEATURES, LABEL, past_instant


def prepare(model_path, evidence_path):
    for path in (model_path, evidence_path):
        if path.stat().st_size > 1_000_000:
            raise ValueError("Artifact exceeds limit")
    model_bytes, evidence_bytes = model_path.read_bytes(), evidence_path.read_bytes()
    model, evidence = json.loads(model_bytes), json.loads(evidence_bytes)
    sha256 = hashlib.sha256(model_bytes).hexdigest()
    expected = {"version", "weights", "trainingRows", "testMae", "baselineMae", "testGroups", "trainedUntil", "state"}
    if set(model) != expected or model["state"] != "DRAFT":
        raise ValueError("Only an unmodified DRAFT model contract can be packaged")
    if not isinstance(model["version"], str) or not 1 <= len(model["version"]) <= 80:
        raise ValueError("Invalid model version")
    weights = model["weights"]
    if not isinstance(weights, dict) or set(weights) != set(FEATURES):
        raise ValueError("Feature contract mismatch")
    for value in weights.values():
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError("Invalid weights")
    if abs(sum(weights.values()) - 100) > 0.00001:
        raise ValueError("Invalid weight sum")
    for key, minimum in (("trainingRows", 100), ("testGroups", 10)):
        if type(model[key]) is not int or model[key] < minimum:
            raise ValueError("Insufficient evaluation groups/rows")
    for key in ("testMae", "baselineMae"):
        if type(model[key]) not in (int, float) or not math.isfinite(model[key]) or not 0 <= model[key] <= 100:
            raise ValueError("Invalid evaluation")
    past_instant(model["trainedUntil"])
    if evidence.get("artifactSha256") != sha256 or evidence.get("labelVersion") != LABEL or evidence.get("state") != "DRAFT":
        raise ValueError("Evidence does not match artifact/label")
    dataset_hash = evidence.get("datasetSha256", "")
    if len(dataset_hash) != 64 or any(character not in "0123456789abcdef" for character in dataset_hash):
        raise ValueError("Dataset hash required")
    if any(evidence.get(key) != model[key] for key in ("trainingRows", "testGroups")):
        raise ValueError("Evidence evaluation counts mismatch")
    if past_instant(evidence.get("latestTrainingOutcome")) >= past_instant(evidence.get("earliestTestDecision")):
        raise ValueError("Temporal evaluation leakage")
    manifest = {"kind": "PWC_RANK_TRANSFER_BUNDLE_V1", "version": model["version"], "state": "DRAFT",
                "modelSha256": sha256, "evidenceSha256": hashlib.sha256(evidence_bytes).hexdigest(),
                "datasetSha256": dataset_hash, "labelVersion": LABEL,
                "improvedOnDeclaredHoldout": model["testMae"] < model["baselineMae"],
                "activation": "REQUIRES_INDEPENDENT_SOURCE_AND_EVALUATION_REVIEW",
                "containsTrainingData": False}
    return model_bytes, evidence_bytes, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    model, evidence, manifest = prepare(args.model, args.evidence)
    with zipfile.ZipFile(args.output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("model.json", model)
        archive.writestr("evidence.json", evidence)
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
