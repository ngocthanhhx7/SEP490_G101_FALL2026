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
