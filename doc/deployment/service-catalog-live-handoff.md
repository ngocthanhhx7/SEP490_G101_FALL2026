# Service catalog connection and initial data

Owner: Phạm Thành Chung. Reviewer: Đoàn Tiến Đạt. Merger: Nguyễn Ngọc Thành. Branch: feature/wbs-008-service-catalog-presentation; target develop.

The user requested replacing Sản phẩm with Dịch vụ, the PawWorld favicon, reference-inspired service cards and a real database connection for the three current offerings. Local database inspection found empty service, price, policy and visibility collections; the API returned available=false. No user/Admin account existed either.

## Runtime and initial data

createApp now composes the existing system-settings, service-price and catalog modules against the real connection. Explicit injected module factories retain their corresponding override; normal duplicate registration still fails. Existing authenticated Admin/Staff and CSRF guards remain; public listing still requires an effective ACTIVE service, PUBLISHED service information, active price and enabled visibility. Health-only test harnesses without a database do not mount these modules.

The user explicitly authorized selecting initial prices, to be edited later in Admin:

| Code | Service | Initial price | Species |
| --- | --- | --- | --- |
| home-visit | Ghé thăm & chơi cùng Pet | 80,000 VND / 30 minutes | Dog and cat |
| dog-walking | Dắt chó đi dạo | 80,000 VND / 30 minutes | Dog |
| vet-escort | Đưa thú cưng đến lịch hẹn thú y | 150,000 VND / visit | Dog and cat |

For context, the provider's [published reference table](https://bworkee.com/news/dich-vu-cham-soc-thu-cung-tai-nha) lists home feeding/cleaning around 70–100k per half-hour and walking around 80–120k. Our values are initial project prices, not a quoted market guarantee; vet escort is an internal starting estimate. The escort service does not provide medical care or include clinic/medicine/treatment charges. Service information records describe scope and preparation; they do not introduce cancellation/refund rules or substitute for approved general terms/privacy.

From backend run `node --env-file-if-exists=.env scripts/seeds/service-catalog.js` for a dry run, adding `--apply` to provision. This was explicitly applied to the user's configured database during this task. It atomically creates missing offerings, initial versions, prices, service information, indexes, audits and initial visibility if no visibility setting exists. It never overwrites an existing code or setting, does not seed at application startup and records a unique provisioning key. Repeating the migration returns ALREADY_APPLIED and preserves later Admin price edits.

Audit actorId for this offline bootstrap identifies an actual catalogprovisioningruns document marked SYSTEM_MIGRATION, not a fabricated human or authenticated Admin. No user, login or role was created. Future Admin API edits use their real authenticated actor. Setting up a real Admin account remains a separate identity operation; the user must authenticate with a legitimately provisioned account to edit prices.

## UI and verification

Home, catalog and detail pages read the same API and IDs. The adapter retains the stable code for the correct image after name edits. Cards show real prices/species/scope, filter Vietnamese query strings and link to actual IDs. Favicon uses the existing PawWorld paw asset. Footer and About/Home descriptions reflect the three current offerings.

Validation: frontend 413 tests, backend 549 tests; both lints and frontend production build passed. Integration tests cover the default runtime, hidden/unpriced service gates, one-time provisioning, audit provenance and preserving edited prices. The real local API returned HTTP 200, available=true and all three seeded services with price/policy version 1. Browser checks cover the actual database-backed catalog, query filtering, detail navigation, image loading and responsive layout. No customer record or outbound message was used. Screenshots and local diagnostic fixtures are ignored and not committed.
