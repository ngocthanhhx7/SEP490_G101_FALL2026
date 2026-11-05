# Domain services

Product management deletion retains a MongoDB tombstone and its actor/reason,
blocks all order history and remaining/reserved stock, and serializes with
product/stock writes. Active reads exclude tombstones. The list's global summary
counts active/visible/hidden/out-of-stock products directly from persistence.
See [product management rules](../../../doc/testing/product-management-lifecycle-2026-11-05.md).

`product-sales/product-photo.service.js` owns Admin gallery changes, bounded
decoding, metadata-free normalization, version checks and transactional MongoDB
blob/reference cleanup. Public reads require a shown product still referencing
the photo; Admin has a separate authenticated reader for hidden products.

`user-admin.service.js` owns role decisions, transactionally rechecks the acting
Admin, prevents self role changes and preserves Pet Sitter review boundaries.
Changes increment authEpoch/version, revoke sessions and audit old/new roles.

Services own domain decisions, data access orchestration and provider interactions. They import models/config/validators/utils/constants; never routes/controllers/middleware. Pricing is deterministic in `pricing/`; AI only recommends sitters in `sitter-matching/`. Shared owned-pet/service context has no pricing prerequisite. Private provider/default ports fail closed if unconfigured.

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
