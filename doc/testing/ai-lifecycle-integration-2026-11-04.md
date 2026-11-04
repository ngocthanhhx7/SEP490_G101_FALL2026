# AI lifecycle and operational integration — 04/11/2026

## Recovery findings

The historical `backend/src/ai` package was introduced at `496d10a` and moved
at `018ffaf` into services/models/controllers/routes; the trainer moved into
`backend/scripts/ai`. Existing Mongo collection names remain intact. This is a
source reorganization, not evidence that a persisted production model was deleted.

Read-only inspection found 888 demo outcomes in the separate local
`paw_world_care_ai_demo` database, no models there, and no models/outcomes in the
configured development database or the inspected VPS database. The old Python
training and model persistence tests use temporary synthetic artifacts/databases.
The real-data worktree retained public-source manifests and 3,072 simulated
scenarios, with its handoff explicitly recording that real satisfaction training
had not run. These observations do not prove no other private backup exists.

## Change and acceptance scope

- Persist original model/evidence bytes, hash, version and audit in MongoDB;
  Admin status/import/review/retirement UI. No startup auto-training/import.
- Wire advisory policy/approved-model ranking into automatic invitations while
  retaining authoritative eligibility, origin travel, occupancy and acceptance.
- Preserve real feature values/timestamps before MATCH expiry and on accepted
  operational offers, without addresses/names in the feature snapshot.
- Add explicit, read-only source-joined JSONL export with HMAC IDs. Require
  whole-booking completion, immutable credit/review provenance, unchanged slot,
  observed assignee and pre-decision features. Reject demo/withheld/stale sources.
- Keep training offline with verified-data gates. Public context, OSRM graphs,
  heuristic scores and the 888 demo outcomes do not establish a real model.

Integration regressions run against isolated MongoDB replica sets and simulated
routing. The exporter test feeds its synthetic JSONL into the real Python trainer
and verifies DRAFT/evidence output, removing the temporary artifacts afterward.
Model tests exercise import replay/hash conflicts, activation, retirement,
version conflicts, reviewed rollback and invalid-model fallback. Browser fixtures
at 1440, 390 and 320 px exercise empty rules/history, DRAFT import and uncertain
review acknowledgement with identical-body/key retry. They intercept APIs and do
not imply a real customer rating, invitation or production model activation.

The deployment acceptance must report current reviewed SHA/CI, actual readiness
and source/data status separately. No verified production model can be trained
from the currently inspected zero source outcomes; future verified completions
must accumulate captured features and pass source/evaluation review first.
