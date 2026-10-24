import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("pwc_train", Path(__file__).with_name("train_model.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TrainingTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
