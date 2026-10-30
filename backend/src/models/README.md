# Persistence models

Mongoose schemas/indexes and physical collection compatibility belong here. Pet-care, pricing, decision snapshots and sitter matching have separate factories. `platform-data.model.js` combines them only for explicit seed/test setup; runtime matching must not import pricing models. `model-definitions.js` retains legacy collection names, including `airoutingmatrixes`. No upper HTTP/service imports.

SitterApplication's new ownerUserId identifies the authenticated applicant for receipt recovery and same-account role promotion. Immutable policyConsents record the approved versions accepted at submission; existing legacy records retain a null owner and empty consent list. Collection names remain unchanged.
`sitter-public-profile.model.js` stores separately submitted public profile content,
its review state/version, immutable command replay results and content-hash audits.
It does not publish application experience or repurpose AI matching profiles.
