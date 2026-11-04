# Verified training data

`dataset-export.service.js` reads completed customer-review sources and joins
booking/visit completion, employee service credit, identities and immutable
point-in-time feature snapshots. It returns bounded aggregates in dry-run mode
and pseudonymous trainer-contract rows only with an explicit private HMAC key.
It never writes labels, assignments or financial records. Public/simulated data
and missing historical features cannot be promoted into verified observations.
See [operator tools](../../../scripts/ai/README.md).
