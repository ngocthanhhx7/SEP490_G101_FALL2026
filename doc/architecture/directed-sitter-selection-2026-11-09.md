# Customer-directed sitter selection

Owner decision, 2026-11-09: Customers choose a sitter directly from all employees registered for the selected service, sorted by public Customer rating descending. Unrated employees follow rated employees. Recommendations are available only before the Customer has completed care; product purchases and uncompleted bookings do not count. A COMPLETED owned care visit establishes history, including one completed visit of a multi-visit booking.

## Current and target ownership

Checkout currently exposes only a bounded eligibility-filtered search after another button. The target directory remains a backend read under the owned, unexpired quote. It joins existing approved public profiles, active Users/status, registered service capabilities and PUBLISHED CUSTOMER_TO_SITTER review aggregates. It exposes names, aggregate rating/count and a safe eligibility code; no review text, private application, work schedule, addresses or care notes are returned.

`directory: true, page` is additive to POST /checkout/availability. Pages contain 20 registered employees, sorted globally by rating then userId, with nextPage. Each page evaluates the existing authoritative eligibility rules; blocked employees remain visible with disabled selection and a reason. UI intersects eligibility across every requested visit. All selection, pricing, invitation, payment and occupancy guards remain unchanged, including transactional rechecks at checkout. A directory result never holds a slot or assigns an employee.

GET /checkout/options adds recommendationAllowed. Customer recommendation requests independently recheck completed history so stale UI cannot request new advice after completion. Operational invitation ranking is unchanged. AI never calculates prices or filters the manual directory.

## Storage, compatibility and release

No collection, index, validator, TTL, financial snapshot or historical record changes. No migration/backfill or production data mutation is needed. Reads use existing user/profile/capability/review/visit ownership and identity indexes; aggregation has a five-second server budget and pages bound eligibility work. Pagination may reflect live changes to public scores; checkout always rechecks current eligibility.

The legacy availability shape remains available without directory mode. Old checkout, notification and product-history routes are unrelated. Deploy only reviewed main source with normal artifact/backup and readiness checks. Rollback switches to the previous reviewed release; no database restoration is required for this additive read/UI change.

## Validation

Native tests cover global score order, multiple pages beyond 20 employees, unknown scores, unpublished/reverse-direction exclusion, service/status filtering and owner completed-care history. Checkout tests verify owned quotes, visible unavailable employees and failure after occupancy changes. UI tests cover automatic directory opening, disabled employees, rating display, load-more retaining a choice and suppression of recommendations for returning Customers. Run lint, architecture, affected tests and frontend build; final CI repeats full suites.

Integration regression: returning Customers retain explicit PawWorld-arranged dispatch without AI advice; boarding defaults to that option because staff must split care shifts before a directed employee can be selected. Ordinary services still default to direct choice. This preserves the approved boarding fulfillment policy and does not enable Customer AI recommendations after completed care.
