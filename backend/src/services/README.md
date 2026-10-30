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
