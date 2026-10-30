"""Descriptive audit of quarantined weather files; never infer satisfaction labels."""
import argparse
from collections import Counter
import csv
from datetime import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import statistics
import zipfile

from collect_public_data import inspect_archive


def summarize(values):
    if not values:
        return {"count": 0}
    values = sorted(values)
    return {"count": len(values), "min": values[0], "max": values[-1],
            "mean": statistics.mean(values),
            "p10": values[int((len(values) - 1) * 0.1)],
            "p50": statistics.median(values), "p90": values[int((len(values) - 1) * 0.9)]}


def audit(path, table, time_column, fields):
    inspect_archive(path)
    values = {field: [] for field in fields}
    missing = Counter()
    timestamps = []
    naive_times = invalid_times = rows = 0
    with zipfile.ZipFile(path) as archive, archive.open(table) as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
        if not {time_column, *fields}.issubset(reader.fieldnames or []):
            raise ValueError("Unexpected public table schema")
        for row in reader:
            rows += 1
            try:
                time = datetime.fromisoformat(row[time_column].replace("Z", "+00:00"))
                naive_times += time.tzinfo is None
                timestamps.append(row[time_column])
            except (ValueError, TypeError):
                invalid_times += 1
            for field in fields:
                try:
                    value = float(row[field])
                    if not math.isfinite(value):
                        raise ValueError("Non-finite public data")
                    values[field].append(value)
                except (ValueError, TypeError):
                    missing[field] += 1
    return {"archiveSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "table": table,
            "rows": rows, "duplicateTimestampRows": len(timestamps) - len(set(timestamps)),
            "invalidTimestampRows": invalid_times, "timezoneUnspecifiedRows": naive_times,
            "firstTimestampText": min(timestamps) if timestamps else None,
            "lastTimestampText": max(timestamps) if timestamps else None,
            "fields": {field: {**summarize(sample), "invalidOrMissing": missing[field]} for field, sample in values.items()},
            "state": "DESCRIPTIVE_QUARANTINE_AUDIT", "verifiedPhysicalObservations": False,
            "satisfactionLabels": False,
            "limits": "Uploader provenance and units require review; these are file statistics, not causal effects or future-available features"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path, help="Root containing the versioned Kaggle quarantine")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Use a new immutable report path")
    entries = [
        ("diabolicfox--hanoi-air-quality-pm2-5-weather-data-2024-2026/v1/dataset.zip",
         "hanoi_aqi_ml_ready_fixed.csv", "datetime", ["temperature", "precipitation", "rain", "pm25"]),
        ("anhminhnguyen01021--hanoi-urban-flooding-and-weather-time-series/v1/dataset.zip",
         "softs_flood_hanoi_50streets_multivariate.csv", "time", ["rain_mm", "temperature_c", "humidity_pct"]),
    ]
    reports = [audit(args.folder / archive, table, time, fields) for archive, table, time, fields in entries]
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(reports, output, ensure_ascii=False, indent=2)
    print(json.dumps(reports))


if __name__ == "__main__":
    main()
