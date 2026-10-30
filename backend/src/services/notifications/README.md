# Notification services

This directory contains the recipient-scoped notification domain port. `notification.service.js` validates safe projections, read receipts, idempotent event publication and opt-in web-push subscriptions. It does not own Mongo schemas, provider credentials, or application route registration; P01/P34 supply those integration ports.

`mongo-notification.repository.js` supplies durable list/read/event storage,
signed scope/filter-bound pagination and snapshot-consistent unread counts.
Runtime composes the authenticated router; missing list storage is unavailable.
Checkout writes a booking-created Customer notification in its transaction.
Other event producers, preferences and web-push integration remain pending.
