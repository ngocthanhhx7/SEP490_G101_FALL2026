# Notification services

This directory contains the recipient-scoped notification domain port. `notification.service.js` validates safe projections, read receipts, idempotent event publication and opt-in web-push subscriptions. It does not own Mongo schemas, provider credentials, or application route registration; P01/P34 supply those integration ports.

`mongo-notification.repository.js` supplies durable list/read/event storage,
signed scope/filter-bound pagination and snapshot-consistent unread counts.
Runtime composes the authenticated router; missing list storage is unavailable.
Checkout writes a booking-created Customer notification in its transaction.
`scheduling-notifications.service.js` writes invitation/response/rescheduling
messages in the domain transaction. `domain-notifications.service.js` handles
verified payment/reconciliation, payroll events, application decisions and care
check-in/out. Stable event/recipient ids prevent duplicate messages; rollback
removes both domain changes and notifications. Account-wide messages use null
role and remain recipient scoped. No private financial detail is copied into
notification text. Preferences, email/SMS and web-push delivery remain separate
provider gates and are not established by the in-app centre.
