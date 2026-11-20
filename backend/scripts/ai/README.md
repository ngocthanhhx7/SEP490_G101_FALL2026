# Offline routing and scenario analysis

These tools support routing validation and scenario analysis outside runtime. Raw datasets,
archives and OSM graphs belong in ignored `backend/storage/`. The application
ranks sitters with the approved policy.

From `backend/` with Python 3.12+:

```powershell
python scripts/ai/collect_public_data.py --output storage/ai-public/new-run --dataset chi26n/hanoi-traffic --dataset diabolicfox/hanoi-air-quality-pm2-5-weather-data-2024-2026 --dataset anhminhnguyen01021/hanoi-urban-flooding-and-weather-time-series
python scripts/ai/audit_hanoi_roads.py storage/routing-source/hanoi-buffered.osm.pbf --output storage/ai-public/new-run/roads.json
python scripts/ai/analyze_public_context.py storage/ai-public/new-run --output storage/ai-public/new-run/weather-analysis.json
python -m unittest discover -s tests/python -p 'test_*.py'
```

Collection pins the current Kaggle version before download, records its metadata,
license claim, hash, archive types and CSV schema/counts, then quarantines it. It
does not extract archives, import `.pt`/pickle, execute notebooks or accept raw
datasets as ranker labels. Reuse a new output directory when a prior attempt exists.
Licenses declared by uploaders still require original-provider review. Downloads
are capped at 80 MB, expanded metadata at 150 MB and CSV columns at 200.

Road audit additionally needs `osmium==4.3.2` installed in an isolated environment.
It reads an existing OSM extract, reports tag presence/restrictions and a source
hash. These counts do not verify connectivity or ETA accuracy. Use the separate
[OSRM pipeline](../../../doc/deployment/hanoi-routing.md) to build a graph.
