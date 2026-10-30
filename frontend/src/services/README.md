# API services

`workspace-api.js` validates aggregate metric, trend and distribution responses
from `/workspaces/:kind/analytics`; it never calculates financial figures.

Same-origin transport, endpoint adapters and DTO normalization belong here. `public-catalog-api.js` owns public catalog/policy requests; reusable price/date formatting belongs in `../utils/catalog-format.js`. Services cannot import presentation packages or React state owners. Authenticated requests use the shared API client, session/CSRF boundaries and explicit pending states.

`sitter-recommendation-api.js` loads matching-owned care context and validates
shortlists from `/ai/recommendations`; it does not request prices or send offers.
The caller clears results when the input changes and must reconcile uncertain
pet/address creates before issuing another non-idempotent create command.

sitter-application-api.js sends authenticated/CSRF application commands and raw private-image uploads. Upload keys are stable per File and submission keys are retained across uncertain acknowledgements. It loads the owner's intake/receipt and never sends raw storage paths or stores personal data in browser storage.

`customer-care-api.js` adapts `/pet-care` catalog/pets and owner-only
`/pet-care/addresses/manage`, versioned edit/archive commands and same-origin map
search/place resolution. Callers retain operation keys/payloads after uncertain
responses; private care/address data is not saved in browser storage.
