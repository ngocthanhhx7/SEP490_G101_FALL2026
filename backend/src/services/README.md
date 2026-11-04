# Domain services

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

`product-sales/` owns the Customer shop: public catalog, cart and order placement. The order service reserves stock with a conditional update inside a transaction and replays idempotent retries; it reads `CustomerAddress` only to copy the delivery address after an area check. `product-order-pricing.js` is the deterministic integer-VND total (flat demo delivery fee; no discount or tax). `product-order-management.service.js` is the Admin side: each status change and its stock effect (release the hold and reduce real stock when goods leave, release only the hold on cancel, add back only the resellable quantity when a return is confirmed) run in one transaction guarded by the order status and version; a confirmed return by a refusing customer writes its `ProductCustomerRefusal` record in that same transaction. Who may handle orders comes from `constants/product-permissions.js`, not from a role name in the service. `customer-phone-directory.service.js` reads verified customer phones through the sign-in contact keys so the Admin list can search by whole phone number and show it; route composition injects it. See [product sales API](../../../doc/api/product-sales-v1.md).
