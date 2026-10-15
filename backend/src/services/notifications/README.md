# Notification services

This directory contains the recipient-scoped notification domain port. `notification.service.js` validates safe projections, read receipts, idempotent event publication and opt-in web-push subscriptions. It does not own Mongo schemas, provider credentials, or application route registration; P01/P34 supply those integration ports.
