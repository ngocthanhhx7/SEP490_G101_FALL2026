# Reviews service

P30 owns the Customer-to-Sitter visit rating command. The service validates the
completed or Staff-closed visit, Customer ownership, one-rating-per-visit,
idempotency and optimistic version checks. It returns a role-scoped projection;
moderation and Sitter-facing projections remain P47 concerns.

The Sitter direction is implemented by `sitter-review.service.js`. It only
accepts an assigned `COMPLETED` or `STAFF_CLOSED` visit, writes a distinct
`SITTER_TO_CUSTOMER` review, and requires the injected SITTER-FEEDBACK policy
port before accepting a rating. P34 still owns runtime route/provider wiring.

The repository is injected so P34/P01 can provide the real Visit, Review,
idempotency, audit and outbox implementations. Unit fixtures do not prove live
database integration.
