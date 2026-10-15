# P33 handoff — WBS-051 Notification Center

## Scope

- UC-65 notification list is recipient scoped to the authenticated user and role.
- Read receipts are idempotent and private; deep links are relative paths and must be authorized again by the destination.
- Event creation uses a stable idempotency key and a repository port for durable uniqueness. The service does not claim a provider delivered email, SMS, or push.
- Web push registration is opt-in and fail-closed when the browser/provider does not support it. In-app notifications remain authoritative.

## Files

- `backend/src/services/notifications/notification.service.js`
- `backend/src/services/notifications/README.md`
- `backend/src/routes/notification.routes.js` (export-only; P34 owns registration)
- `frontend/src/services/notifications-api.js`
- `frontend/src/pages/notifications/NotificationsPage.jsx`
- `frontend/src/pages/notifications/notifications.css`
- `frontend/src/pages/notifications/README.md`

## Integration gates

P01/P34 still need to map the repository ports, schema/indexes, session registration, route registration, and provider delivery/outbox. Fixture adapters do not prove live delivery. No health/medical/document/access-code data is accepted in notification metadata or deep links.
