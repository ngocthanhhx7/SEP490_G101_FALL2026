# API services

`stock-list-api.js` validates the read-only stock list/history contracts and forwards
search, paging, cursors and cancellation through the shared API client. It preserves
backend counts/status and never derives a stock threshold.
History validation distinguishes receipt fields from adjustment reason/recorder fields.

`stock-adjustment-api.js` validates product stock, immutable adjustment and paging
DTOs, forwards cancellation and sends only product/type/quantity/reason with CSRF
and the caller's stable `Idempotency-Key`. `api-client.js` preserves optional safe
nonnegative integer `available` in errors so MSG123 can show the backend's value.

`api-client.js` preserves HTTP status, a validated correlation UUID and positive
retry interval even for HTML gateway errors. Pages use the pure
`utils/api-error-feedback.js` fallback after their domain-specific messages;
never display an upstream message or automatically replay a failed mutation.
`useApiResource` keeps the HTTP status separately from its UI loading state.

Product Management transports bounded binary photos through the shared API client
with same-origin cookies, CSRF and `X-Product-Version`. Image writes use their own
routes and do not expose arbitrary photo URLs in the ordinary product editor DTO.

`service-basket-api.js` also owns the quote-scoped `/checkout/availability`
transport for directed booking; pages do not call the transport directly.

`workspace-api.js` validates aggregate metric, trend and distribution responses
from `/workspaces/:kind/analytics`; it never calculates financial figures.

`employee-scheduling-api.js` owns UC-82 withdrawal options and submission transport.
It also owns assigned care/acknowledgement/access-note
transport, execution reads and existing check-in/checklist/check-out commands.
Its injected private-image transport uploads evidence with a separate stable key.
`service-basket-api.js` owns quote, checkout and Customer rating calls;
pending or malformed acknowledgements retain the caller's operation key. Neither
adapter persists private care in browser storage or supplies authoritative prices.

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

The Admin application adapter reads private document blobs through the existing
bounded private-image transport using an internal application-specific read path.
All reads keep same-origin credentials/no-store, reject redirects and require a
PNG/JPEG MIME type; pages never receive an R2 signed URL. The default owner image
read path remains unchanged.

`product-sales-api.js` is the same-origin transport for `/products`, `/product-cart` and `/product-orders` and validates every DTO (integer VND, known enums). It sends no prices; the order request carries only receive/payment method and the owned address id. `product-order-management-api.js` is the Admin transport for `/admin/product-orders`: list with tab counts, and the carrier, ready, payment and hand-over steps. It sends no stock or status values, only the tracking code. `product-management-api.js` is the Admin transport for `/admin/products` (paged list with the page in `meta.page`, read, create, edit by `version`); it sends no code and no stock. `supplier-management-api.js` is the Admin transport for `/admin/suppliers` (paged list with the tab counts in `meta.counts`, read with products, add, edit, stop, resume); it sends no status and no name key. `goods-receipt-api.js` is the Admin transport for `/admin/goods-receipts` (active suppliers, product search, the recent receipts, one receipt, save); it sends no code, day, recorder or rejected quantity, and saves with the `Idempotency-Key` the page gives it. Contract: [product sales API](../../../doc/api/product-sales-v1.md).

`ai-model-api.js` owns Admin model status/import/review transport through the
shared API client and CSRF/idempotency handling; it never computes rankings.

`employment-document-api.js` owns application contract transport; `payroll-draft-api.js`
validates employee/source-preview/prepare acknowledgements. Components never build
shared endpoint URLs or persist contract/assessment data in browser storage.

Sitter application API includes private owned get/update methods. Update acknowledgements require a versioned result; UI retains the original payload/key on uncertain responses. Login uses the owned read for the applicant landing.

pagination-response.js validates optional page/limit/total envelopes for shop order transports. Owner-scoped order reads resolve notification deep links. Cards and pages continue using the shared API client.

`counter-sale-api.js` dùng shared client cho `/admin/counter-orders`, kiểm DTO quầy riêng để không nới enum online. Lookup gửi POST body, chỉ nhận id/tên, không đưa contact lên URL. Create gửi key cùng lines/customerId, không gửi tiền/status. Shared ApiError giữ available nguyên không âm và productId ObjectId hợp lệ để MSG58 dùng số authoritative, kể cả 0.

`service-basket-api.js` validates directed directory eligibility, public rating/count and next-page acknowledgements; it does not compute suitability or rating. Existing availability requests retain their compatible minimal response contract.

`customer-bookings-api.js` adapts and validates owner-scoped `/bookings` pages, including optional service/pet/schedule/amount summaries and compatible cursor envelopes. It never calculates payment amounts.

`avatar-image.js` performs local JPG/PNG decode and centered512px preview normalization; the existing server validation remains authoritative. `avatar-api.js` owns same-origin cookie-protected binary content transport and strict private path/MIME/size checks. It does not store a public media URL or move private images to R2.

pet-record-import-api.js handles consented same-origin JPEG/PNG/PDF transport; API keys remain server-side.

`booking-details-api.js` reads Staff/Admin booking details. Customer detail retains the service basket checkout transport.
