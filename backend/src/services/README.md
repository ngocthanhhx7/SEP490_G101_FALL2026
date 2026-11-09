# Domain services

`empty-accrual-queue-retirement.service.js` inspects/retires/restores one exact
empty legacy queue with profile, namespace, metadata, freeze, confirmation and
journal guards. It never changes the old16-store manifest or core records.
Restoration refuses conflicting/nonempty state and can finish a known partial
empty index restoration. Runtime never invokes this operator-only service.

`raw-operational-validation.service.js` owns bounded preflight, journaled explicit
install and known-contract reverse for six native raw validators. It preserves
current data/indexes and refuses foreign validators/stale digests; no automatic
collMod runs during application startup or normal provisioning. Missing raw stores
created by explicit finance provisioning receive their source-declared options.
Existing stores require the reviewed operator command and isolated restore gates.

`storage-contract-inspection.service.js` builds a runtime-scoped metadata manifest
and compares ordered index keys/options, critical constraints and read-index drift
without reading business documents or changing storage. Raw finance/scheduling
declarations are shared with their explicit provisioners. Specialized catalog
validators are checked only for their declared/selected contracts; uncovered
validators and physical stores remain visible as unasserted scope.

`service-presentation-retirement.service.js` verifies the complete embedded copy
and bounded legacy store before explicit cleanup; restore retains old IDs but
reads current canonical parent values. `catalog-index-retirement.service.js`
handles only two known redundant nonunique indexes and preserves unique guards.

`reference-catalog-retirement.service.js` verifies an exact copy before retiring
two fixed legacy catalogs. Private Extended JSON manifests retain the baseline
for metadata restoration and guarded reverse after target writes.

`reference-catalog-migration.service.js` owns bounded insert-only catalog copy and
checkpointed reverse reconciliation after target writes. Its storage service
provisions strict typed validation and three indexes; readers inherit one
connection-scoped source and never combine legacy with target data.

`legacy-storage-retirement.service.js` owns bounded empty-store inspection and
explicit retirement/restoration for the fixed compensation profile legacy set.
It verifies metadata and keeps compound index field order; it never deletes
business records or chooses collections by their emptiness alone.

`catalog-audit-migration.service.js` owns copy, verified cleanup and reverse-copy
orchestration for provenance embedded in immutable catalog versions. It reconstructs
legacy audit views from canonical facts, preserves BSON types/IDs, never
overwrites conflicts, defaults to aggregate dry-run and requires writer-drain
confirmation for cleanup/reverse. It does not migrate pricing or financial state.

`service-presentation.service.js` reads and provisions canonical embedded Service
metadata without legacy fallback or mirror writes. Its migration service
performs aggregate-only dry-run or explicitly confirmed additive copies; it
never removes the legacy collection. `service-catalog.service.js` batches public
policy/price reads and projects catalog metadata without private audit fields.

Product management deletion retains a MongoDB tombstone and its actor/reason,
blocks all order history and remaining/reserved stock, and serializes with
product/stock writes. Active reads exclude tombstones. The list's global summary
counts active/visible/hidden/out-of-stock products directly from persistence.
See [product management rules](../../../doc/testing/product-management-lifecycle-2026-11-05.md).

Default product lists use the existing unique code ordering without the redundant
_id sort suffix; search/category/pet queries retain their measured original shape.
Exact filtered totals and global Admin summaries remain separate authoritative
reads. Offset/deep-page work still grows; see the [conditional query evidence](../../../doc/database/product-default-query-2026-11-08.md).

`product-sales/product-photo.service.js` owns Admin gallery changes, bounded
decoding, metadata-free normalization, version checks and transactional MongoDB
blob/reference cleanup. Public reads require a shown product still referencing
the photo; Admin has a separate authenticated reader for hidden products.

`user-admin.service.js` owns role decisions, transactionally rechecks the acting
Admin, prevents self role changes and preserves Pet Sitter review boundaries.
Changes increment authEpoch/version, revoke sessions and audit old/new roles.

Services own domain decisions, data access orchestration and provider interactions. They import models/config/validators/utils/constants; never routes/controllers/middleware. Pricing is deterministic in `pricing/`; AI only recommends sitters in `sitter-matching/`. Shared owned-pet/service context has no pricing prerequisite. Private provider/default ports fail closed if unconfigured.

`demo-workflow-reset.service.js` is an operator-only bounded reset with snapshot
digests, seed-manifest selection, reservation reconciliation and transaction
postchecks. Runtime composition never calls it. See the [maintenance plan](../../../doc/database/demo-core-reset-2026-11-08.md).

`pet-care-management.service.js` owns Customer pet/address intake, owner-scoped
edit/archive and durable command replay. `customer-bookings.service.js` provides
bounded owner-filtered history with signed cursors. Notification persistence lives
in `notifications/`; checkout publishes a Customer notification transactionally.

The registration/sitter runtime and its scoped OTP status flow are now connected; see [registration verification](../../../doc/testing/registration-sitter-flow.md). The application intake service keeps owner/media checks separate from submission/approval transactions.
`deployment-storage.service.js` provisions registered runtime collections/indexes and
enabled finance/scheduling raw storage for the explicit deployment command. It
checks payroll, finance and scheduling storage before the release can activate;
it never inserts fixtures, removes indexes or runs during server startup.

`product-sales/` owns the Customer shop: public catalog, cart and order placement. The order service reserves stock with a conditional update inside a transaction and replays idempotent retries; it reads `CustomerAddress` only to copy the delivery address after an area check. `product-order-pricing.js` is the deterministic integer-VND total (flat demo delivery fee; no discount or tax). `product-order-management.service.js` is the Admin side: each status change and its stock effect (release the hold and reduce real stock when goods leave, release only the hold on cancel, add back only the resellable quantity when a return is confirmed) run in one transaction guarded by the order status and version; a confirmed return by a refusing customer writes its `ProductCustomerRefusal` record in that same transaction. Who may handle orders comes from `constants/product-permissions.js`, not from a role name in the service. `customer-phone-directory.service.js` reads verified customer phones through the sign-in contact keys so the Admin list can search by whole phone number and show it; route composition injects it. `product-management.service.js` is the Admin side for products: list (search, filters, paging), read, create and edit. A new code is allocated in the same transaction as the insert, so a failed save leaves no gap, and an edit only applies when the `detailsVersion` the Admin saw is still current. `pagination.service.js` is the shared `find` + `countDocuments` page for Admin lists; it takes the parsed `page` and `limit` from `validators/pagination.validator.js`. `supplier-management.service.js` is the Admin side for suppliers: list by tab in Vietnamese letter order (collation `vi`, so Đ comes after D) with the size of every tab, read with its products, add, edit, stop and resume. A name that is already used (stopped suppliers included) is refused through the unique name key, so two Admins cannot save the same name; every change matches the version the Admin saw. The product list of a supplier is a record only; a goods receipt is not limited by it. See [product sales API](../../../doc/api/product-sales-v1.md).

`ai-training/` owns the read-only verified source export; `sitter-matching/` owns
advisory operational ranking and the Admin model registry. Offline training stays
in `backend/scripts/ai/`, outside application startup.

`payroll/` owns application employment-document lifecycle and source-derived payroll
drafts. It never infers attendance from customer service hours or statutory
obligations from missing data; see its component README.

Sitter application service owns direct applicant reads and audited PENDING updates, with account/verified-contact ownership and the same state/version serialization as Admin review. It never promotes applicants from a self-edit.

Product order lists page after authoritative role/owner filters. Domain notifications write recipient-scoped IN_APP product order placement/status/payment events in the same transaction. Stable order/version/recipient IDs deduplicate replay; state/stock/notification failures roll back together. No contact/address snapshot enters notifications.
Public profile moderation lists SUBMITTED/APPROVED/REJECTED states with state-scoped cursors, bounded user display-name lookups and aggregate counts across current profile records. Counts do not represent historical application submissions or immutable review events.

`avatar.service.js` owns owner-scoped normalized avatar bytes, transaction/version/retry guards and parent-profile concurrency; applicant document slots remain in sitter-application service. See [profile media](../../../doc/testing/profile-media-2026-11-05.md).

`booking-read-storage.service.js` owns aggregate preflight and explicitly confirmed
provision of the raw bookings owner/cursor index. Deployment asserts an equivalent
plain two-field index (including reverse scans); it never silently creates one.
Missing/null legacy owners are preserved, unknown types/conflicts block apply.

`retired-compensation.service.js` is the EMPLOYEE compatibility facade for legacy
settlement/earnings routes. It returns a retired-domain error after existing HTTP
security middleware, and never registers or queries legacy compensation storage.

Customer booking list reads a projected summary from the existing owner-scoped booking snapshot: service/pet names, saved schedule/count, created time and payment amount/state. It does not expose private access/care notes or calculate money. Detail adds snapshot pet names and assigned sitter display names through bounded identity lookups after ownership checks.
