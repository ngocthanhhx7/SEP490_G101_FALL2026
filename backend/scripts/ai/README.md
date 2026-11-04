# Offline AI data tools

These scripts are operator tools, outside Express startup. Runtime matching only
recommends sitters; finance stays in backend domain services. Raw datasets, archives,
OSM graphs, Python dependencies and model artifacts belong in ignored
`backend/storage/`, never in Git. Database export is an explicit operator command;
public-data and trainer scripts do not connect to MongoDB.

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

`generate-grounded-scenarios.js` combines a validated public OSRM snapshot with
declared empty/occupied/break schedules, using the actual scheduling/scoring
services. It exports simulated features and feasibility reasons, with no customer
rating and `rankTrainingEligible:false`. The baseline policy score is diagnostic,
never a satisfaction target. Weather statistics are not injected as invented
causal effects. A 16-point snapshot produces 3,072 scenarios:

```powershell
node scripts/ai/generate-grounded-scenarios.js storage/ai-public/2026-10-30/hanoi-osrm-snapped-samples.json 2026-11-03 storage/ai-public/new-run/scenarios.jsonl
```

Choose a service date at least 24 hours ahead. This dataset can support scenario
review and feature-pipeline testing. The strict real-outcome trainer rejects it;
simulated feasibility is not verified customer satisfaction.

The approved ranker label is verified customer satisfaction: `(rating - 1) * 25`,
with integer ratings 1–5. `train_model.py` accepts v1 JSONL with unique opaque
outcome IDs and per-feature availability timestamps. Training outcomes must precede
the earliest held-out decision; every booking stays in one fold. Legacy rows lack
enough provenance and are rejected. See the [contract and acquisition plan](../../../doc/testing/ai-real-data-2026-10-30.md).

```powershell
python scripts/ai/train_model.py storage/ai/verified-outcomes-v1.jsonl --version pwc-satisfaction-v1 --output storage/ai/model-v1.json
```

Output remains DRAFT with a separate `.evidence.json` recording artifact/dataset
hashes, label and temporal split. Evidence is for independent review, not model import;
the model artifact keeps the existing API contract. Declared verification/timestamps
cannot themselves prove source authenticity. Do not upload a model until its
source join, evaluation and final SHA have been reviewed. Tests use synthetic
fixtures only and do not establish real model quality.

## Model persistence and transfer

The ranker is five learned weights, its version and evaluation metadata. It does
not memorize the original rows, map or user accounts. OSRM's graph is separate.
Moving the exact JSON weights to another machine does not retrain the model or
change predictions. The runtime stores imported models in MongoDB; restarting
Express does not discard them. New outcomes should produce a new immutable model
version and a new evidence file; retain the previous approved version for rollback.

```powershell
python scripts/ai/bundle_model.py storage/ai/model-v1.json --evidence storage/ai/model-v1.json.evidence.json --output storage/ai/model-v1-transfer.zip
```

The bundle contains only `model.json`, `evidence.json`, `manifest.json`; it never
contains training rows, accounts or credentials. Packaging requires both model
and matching evidence, verifies exact file hashes, temporal split and declared
evaluation/weight contracts. Partial trainer output without evidence cannot be
packaged. It never approves or imports a model. On a future reviewed VPS release,
check both hashes and independent source/evaluation review before using the
existing authenticated Admin model import. Source-code changes still follow the
main release process. A poor or simulated model must not be activated merely
because transfer integrity passed. Unit tests demonstrate byte-for-byte
portability with a temporary synthetic artifact, not a new real trained model.

## Verified runtime export and Admin lifecycle

From `backend/`, preview the configured database without exporting rows:

```powershell
node --env-file-if-exists=.env scripts/ai/export-training-data.js
```

`--apply --output storage/ai/new-run.jsonl` requires a private, stable
`AI_TRAINING_EXPORT_SECRET` of at least 32 characters supplied by the operator.
It is used only to HMAC opaque booking/review IDs; keep it outside Git and release
artifacts. No export is written below 200 verified observations / 50 booking
groups, after truncation, or over the trainer size bound. The command never
updates source records. Preserve the new JSONL and its hash manifest privately.
The acquisition plan still requires review of consent/source authenticity and
selection bias: only the actually accepted sitter can have an observed rating.

The exporter joins reviews, whole-booking completion, service credit, identities
and captured decision features. It excludes demo/fixture accounts, withheld or
changed ratings, stale schedules and absent/late features. Historical outcomes
without captured features are not reconstructed from current statistics.
`trainingEligible:false` on legacy provenance is not rewritten; the export
performs a fresh source join and feature audit for each row.

After training and independent source/evaluation review, use Admin → Điều phối AI
(`/admin/ai-models`). Import the original DRAFT JSON bytes and matching evidence
JSON. Both are persisted in MongoDB without activating the model. Approval needs
a review reference/reason and an optimistic version; it rechecks artifact hash,
chronological evidence and improvement over baseline. Activation retires the
previous model; approving a retained version after review provides rollback.
Retirement or invalid model integrity makes runtime use the approved rule policy.
Unknown acknowledgement must retry the original operation, not create a new one.

Runtime ranking lives in `src/services/sitter-matching/`; the historical
`src/ai/` package was moved in commit `018ffaf`. Its trainer was moved here.
Collection names (including `airankmodels` and `aivisitoutcomes`) remain stable.
No model is loaded from a temporary test directory or implicitly trained on boot.
