# Sitter recommendations

Advisory matching for the invitation workflow only. `recommendation.service.js` orchestrates owned pet/service context, approved ranking weights, feasible schedule insertion and route-matrix evidence. `matching.repository.js` reads matching models and shared pet-care context without pricing models or policies. `routing.service.js` bounds provider calls and caches asymmetric travel times. `scheduling.service.js` validates feasible time slots; `scoring.service.js` explains normalized scores. `management.service.js` validates Admin matching imports. Snapshots are owner/expiry/kind scoped.

This package cannot calculate prices or mutate fees, tax, booking, invitation or assignment state. Existing backend commands revalidate eligibility/occupancy before invitations and assignment. Missing route evidence fails closed.

Schemas live in `../../models/sitter-matching.model.js`; HTTP adapters in controllers/routes. Training is `../../../scripts/ai/train_model.py` with tests in `../../../tests/python/`. Grouped temporal splitting is not proof of point-in-time feature provenance.

See [API guide](../../../../doc/api/ai-pricing-matching-v1.md) and [package rules](../../../../doc/source-code-management/package-architecture.md).
