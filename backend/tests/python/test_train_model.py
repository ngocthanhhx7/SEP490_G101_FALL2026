import importlib.util
import json
import hashlib
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("pwc_train", Path(__file__).resolve().parents[2] / 'scripts' / 'ai' / 'train_model.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TrainingTests(unittest.TestCase):
    def load(self, rows):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "outcomes.jsonl"
            path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            return module.load_rows(path)

    def verified_rows(self):
        rows = []
        for index in range(240):
            decision = datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(days=index)
            rating = 1 + index % 5
            rows.append({"groupId": "booking_%04d" % index, "observationId": "rating_%04d" % index,
                         "decisionAt": decision.isoformat(), "occurredAt": (decision + timedelta(hours=1)).isoformat(),
                         "featuresAsOf": dict.fromkeys(module.FEATURES, decision.isoformat()),
                         "features": dict.fromkeys(module.FEATURES, 0.5), "verified": True,
                         "rating": rating, "targetScore": (rating - 1) * 25, "labelVersion": module.LABEL})
        return rows

    def rows(self):
        rows = []
        for group in range(60):
            date = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=group)
            for observation in range(4):
                x = [((group * (index + 3) + observation * 11) % 100) / 100 for index in range(5)]
                rows.append({"group": "synthetic-%03d" % group, "date": date, "x": x, "y": sum(a * b for a, b in zip(x, [40, 20, 20, 10, 10]))})
        return rows

    def test_no_group_or_time_leakage(self):
        train, test, groups = module.temporal_split(self.rows())
        self.assertFalse({r["group"] for r in train} & {r["group"] for r in test})
        self.assertLess(max(r["date"] for r in train), min(r["date"] for r in test))
        self.assertGreaterEqual(groups, 10)

    def test_artifact_is_nonnegative_explainable_and_stays_draft(self):
        artifact = module.train_model(self.rows(), "synthetic-training-test")
        self.assertEqual(artifact["state"], "DRAFT")
        self.assertAlmostEqual(sum(artifact["weights"].values()), 100)
        self.assertTrue(all(value >= 0 for value in artifact["weights"].values()))
        self.assertLess(artifact["testMae"], artifact["baselineMae"])

    def test_refuses_insufficient_groups(self):
        with self.assertRaises(ValueError):
            module.temporal_split(self.rows()[:20])

    def test_verified_rating_mapping_and_prediction_time_split(self):
        rows = self.load(self.verified_rows())
        train, test, _ = module.temporal_split(rows)
        self.assertEqual({row["y"] for row in rows}, {0, 25, 50, 75, 100})
        self.assertLess(max(row["date"] for row in train), min(row["decision"] for row in test))

    def test_rejects_features_observed_after_prediction(self):
        rows = self.verified_rows()
        rows[0]["featuresAsOf"]["quality"] = rows[0]["occurredAt"]
        with self.assertRaisesRegex(ValueError, "leakage"):
            self.load(rows)

    def test_rejects_duplicate_rating_retry(self):
        rows = self.verified_rows()
        rows[1]["observationId"] = rows[0]["observationId"]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.load(rows)

    def test_rejects_heuristic_target_and_unverified_rating(self):
        for field, value, message in [("targetScore", 82, "Target"), ("rating", True, "Target"),
                                      ("verified", False, "Verified")]:
            with self.subTest(field=field):
                rows = self.verified_rows()
                rows[0][field] = value
                with self.assertRaisesRegex(ValueError, message):
                    self.load(rows)

    def test_rejects_legacy_rows_without_provenance(self):
        rows = self.verified_rows()
        del rows[0]["featuresAsOf"]
        with self.assertRaisesRegex(ValueError, "provenance"):
            self.load(rows)

    def test_purges_training_outcomes_unavailable_at_test_decision(self):
        rows = self.rows()
        # Every outcome arrives a week after its decision. A split by outcome
        # date would incorrectly retain the seven days before the holdout.
        for row in rows:
            row["decision"] = row["date"] - timedelta(days=7)
        train, test, _ = module.temporal_split(rows)
        self.assertLess(max(row["date"] for row in train), min(row["decision"] for row in test))

    def test_cli_persists_dataset_evidence_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "synthetic-outcomes.jsonl"
            output = Path(directory) / "draft.json"
            dataset.write_text("\n".join(json.dumps(row) for row in self.verified_rows()), encoding="utf-8")
            command = [sys.executable, str(Path(module.__file__)), str(dataset), "--version", "synthetic-cli-test", "--output", str(output)]
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)["state"], "DRAFT")
            evidence = json.loads(output.with_suffix(".json.evidence.json").read_text())
            self.assertEqual(evidence["datasetSha256"], hashlib.sha256(dataset.read_bytes()).hexdigest())
            self.assertEqual(evidence["artifactSha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(evidence["labelVersion"], module.LABEL)
            self.assertLess(evidence["latestTrainingOutcome"], evidence["earliestTestDecision"])
            before = output.read_bytes()
            repeat = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(repeat.returncode, 0)
            self.assertEqual(output.read_bytes(), before)
            bundle = Path(directory) / "transfer.zip"
            packaged = subprocess.run([sys.executable, str(Path(module.__file__).with_name("bundle_model.py")),
                                       str(output), "--evidence", str(output.with_suffix(".json.evidence.json")),
                                       "--output", str(bundle)], capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(packaged.stdout)["modelSha256"], evidence["artifactSha256"])
            import zipfile
            with zipfile.ZipFile(bundle) as archive:
                self.assertEqual(set(archive.namelist()), {"model.json", "evidence.json", "manifest.json"})
                self.assertEqual(archive.read("model.json"), output.read_bytes())
            # A modified model cannot be packaged against the previous evidence.
            output.write_text(output.read_text() + " ", encoding="utf-8")
            tampered = subprocess.run([sys.executable, str(Path(module.__file__).with_name("bundle_model.py")),
                                      str(output), "--evidence", str(output.with_suffix(".json.evidence.json")),
                                      "--output", str(Path(directory) / "invalid.zip")], capture_output=True, text=True)
            self.assertNotEqual(tampered.returncode, 0)
            self.assertFalse((Path(directory) / "invalid.zip").exists())


if __name__ == "__main__":
    unittest.main()
