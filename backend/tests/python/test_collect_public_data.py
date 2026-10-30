import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("pwc_collect", Path(__file__).resolve().parents[2] / "scripts/ai/collect_public_data.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CollectionTests(unittest.TestCase):
    def archive(self, name, content):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "public.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr(name, content)
        return path

    def test_unsafe_paths_are_rejected_without_extraction(self):
        for name in ("../escape.csv", "/absolute.csv", "C:/absolute.csv", "..\\escape.csv"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Unsafe"):
                module.inspect_archive(self.archive(name, "a\n1\n"))

    def test_schema_count_preserves_quoted_records_without_exposing_values(self):
        report = module.inspect_archive(self.archive("weather.csv", 'time,note\n2025-01-01,"two\nlines"\n'))
        self.assertEqual(report["tables"], [{"file": "weather.csv", "columns": ["time", "note"], "rows": 1}])
        self.assertNotIn("two", str(report))

    def test_serialized_model_is_never_loaded(self):
        report = module.inspect_archive(self.archive("unsafe.pt", "not executable"))
        self.assertEqual(report["extensions"], {".pt": 1})
        self.assertEqual(report["tables"], [])


if __name__ == "__main__":
    unittest.main()
