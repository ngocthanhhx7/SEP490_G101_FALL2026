# API services

Same-origin transport, endpoint adapters and DTO normalization belong here. `public-catalog-api.js` owns public catalog/policy requests; reusable price/date formatting belongs in `../utils/catalog-format.js`. Services cannot import presentation packages or React state owners. Authenticated requests use the shared API client, session/CSRF boundaries and explicit pending states.

`sitter-recommendation-api.js` loads matching-owned care context and validates
shortlists from `/ai/recommendations`; it does not request prices or send offers.
The caller clears results when the input changes and must reconcile uncertain
pet/address creates before issuing another non-idempotent create command.
