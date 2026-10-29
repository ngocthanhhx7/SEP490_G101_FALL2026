"""Collect public Kaggle candidates into quarantine; never train or activate a model.

Standard library only. No credentials, archive extraction or dataset code execution.
"""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import quote
from urllib.request import Request, urlopen
import zipfile

API = "https://www.kaggle.com/api/v1/datasets/"
CANDIDATES = {
    "chi26n/hanoi-traffic": "Inspect measured trip times, mode and road identifiers",
    "diabolicfox/hanoi-air-quality-pm2-5-weather-data-2024-2026": "Weather research; not travel-time or sitter-outcome labels",
    "anhminhnguyen01021/hanoi-urban-flooding-and-weather-time-series": "Flood/weather research; verify original provenance and event availability",
}
MAX_DOWNLOAD = 80_000_000
MAX_EXPANDED = 150_000_000


def fetch_json(url):
    with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=30) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("Metadata exceeds limit")
    return json.loads(data)


def inspect_archive(path):
    """Return schema/counts only. Reject unsafe/oversized archives without extracting."""
    with zipfile.ZipFile(path) as archive:
        files = archive.infolist()
        if len(files) > 10000 or sum(item.file_size for item in files) > MAX_EXPANDED:
            raise ValueError("Expanded archive exceeds limit")
        extensions = Counter()
        tables = []
        for item in files:
            name = PurePosixPath(item.filename.replace("\\", "/"))
            if name.is_absolute() or ".." in name.parts or ":" in item.filename or item.flag_bits & 1:
                raise ValueError("Unsafe archive entry")
            if item.is_dir():
                continue
            extensions[name.suffix.lower()] += 1
            if name.suffix.lower() == ".csv":
                with archive.open(item) as raw:
                    reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
                    columns = next(reader, [])
                    if len(columns) > 200:
                        raise ValueError("CSV column limit exceeded")
                    count = sum(1 for _ in reader)
                tables.append({"file": item.filename, "columns": columns, "rows": count})
        return {"fileCount": len(files), "extensions": dict(extensions), "tables": tables}


def collect(ref, root):
    if ref not in CANDIDATES:
        raise ValueError("Choose an explicitly researched candidate")
    metadata = fetch_json(API + "view/" + ref)
    version = metadata["currentVersionNumber"]
    if not isinstance(version, int) or version < 1 or metadata.get("isPrivate"):
        raise ValueError("Public versioned dataset required")
    if metadata.get("licenseName") not in {"Apache 2.0", "CC0: Public Domain"}:
        raise ValueError("License needs manual review before download")
    folder = root / ref.replace("/", "--") / ("v" + str(version))
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    path = folder / "dataset.zip"
    digest = hashlib.sha256()
    size = 0
    url = API + "download/" + ref + "?datasetVersionNumber=" + quote(str(version))
    try:
        # Kaggle redirects to signed storage; never log response URLs or headers.
        with urlopen(Request(url), timeout=60) as response, path.open("xb") as output:
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_DOWNLOAD:
                    raise ValueError("Download exceeds limit")
                digest.update(chunk)
                output.write(chunk)
        audit = inspect_archive(path)
        manifest = {"ref": ref, "version": version, "source": "https://www.kaggle.com/datasets/" + ref,
                    "retrievedAt": datetime.now(timezone.utc).isoformat(), "licenseClaim": metadata["licenseName"],
                    "licenseStatus": "UPLOADER_CLAIM_ORIGINAL_SOURCE_REVIEW_REQUIRED",
                    "purpose": CANDIDATES[ref], "bytes": size, "sha256": digest.hexdigest(),
                    "state": "QUARANTINED", "rankTrainingEligible": False, "audit": audit}
        (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return manifest
    except Exception:
        path.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Private/ignored storage folder")
    parser.add_argument("--dataset", choices=CANDIDATES, action="append", required=True)
    args = parser.parse_args()
    for ref in dict.fromkeys(args.dataset):
        print(json.dumps(collect(ref, args.output)))


if __name__ == "__main__":
    main()
