# Sitter recommendations

Advisory matching for the invitation workflow only. `recommendation.service.js` orchestrates owned pet/service context, approved ranking weights, feasible schedule insertion and route-matrix evidence. `matching.repository.js` reads matching models and shared pet-care context without pricing models or policies. `routing.service.js` bounds provider calls and caches asymmetric travel times. `scheduling.service.js` validates feasible time slots; `scoring.service.js` explains normalized scores. `management.service.js` validates Admin matching imports. Snapshots are owner/expiry/kind scoped.

This package cannot calculate prices or mutate fees, tax, booking, invitation or assignment state. Existing backend commands revalidate eligibility/occupancy before invitations and assignment. Missing route evidence fails closed.

`commercial-routing.service.js` selects OSRM, Vietmap Matrix v4 or Google Routes DRIVE
from server configuration. Provider namespaces are distinct; raw commercial matrices are not
persisted. The employee scheduling adapter uses the same selection when rechecking travel.
See [Google/Vietmap configuration and limitations](../../../../doc/deployment/google-goong-maps.md).

Routing can enforce `AI_ROUTING_BOUNDS` before cache lookup, based on the deployed
dataset rather than a claimed service area. Its deadline covers the response
body and native streaming responses are capped at 1 MB. See the
[Hanoi operator guide](../../../../doc/deployment/hanoi-routing.md).

Schemas live in `../../models/sitter-matching.model.js`; HTTP adapters in controllers/routes. Outcome imports reject duplicate pet IDs/species before persistence, including ObjectId case variants. Training and public dataset quarantine tools live in `../../../scripts/ai/`, with their own README and tests in `../../../tests/python/`. Training requires verified satisfaction labels, unique source IDs and per-feature availability timestamps; declared provenance still needs independent source review. See the [current data/integration status](../../../../doc/testing/ai-real-data-2026-10-30.md).

See [API guide](../../../../doc/api/ai-pricing-matching-v1.md) and [package rules](../../../../doc/source-code-management/package-architecture.md).

`operational-ranker.service.js` adapts the same policy/model, features and routing
for the dispatch worker. It reorders only the exact authoritative eligible set;
missing advice or its three-second budget preserves deterministic ordering. This
operational invitation path permits newcomers without fabricating prior reviews;
the Customer MATCH quality threshold is unchanged. Snapshot features are saved on
the private offer and copied to the visit only after authoritative acceptance.
They do not contain names, addresses or pet descriptions. Boarding/special care
continues through its existing operational feasibility checks.

`model-registry.service.js` owns Admin status, immutable DRAFT artifact/evidence
imports and audited versioned APPROVE/RETIRE commands. Approval is serialized and
retires older active versions atomically. Raw artifacts/evidence are excluded
from ordinary model reads. The legacy model write endpoint cannot activate a
self-declared model. HTTP composition stays in the existing AI routes/controller.
See [offline tools](../../../scripts/ai/README.md) for export/train/import steps.

Customer-facing recommendation requests reject Customers with an owned COMPLETED care visit. This does not change the operational invitation ranker or its authoritative eligibility gates. The owner’s products, uncompleted visits and other owners’ visits do not establish completed care history.
