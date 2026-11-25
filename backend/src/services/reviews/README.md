# Reviews service

`mongo-customer-review.repository.js` now supplies the Customer direction when
finance sources and employee scheduling are enabled. It requires a whole completed
booking, current completed visit, immutable employee service credit and completion
event before writing a SUBMITTED review and one sourced `aivisitoutcomes` record
in a transaction. Current ownership, actor state, source versions, future timestamps
and retry conflicts are checked. Ratings are not automatically published. Existing
imported outcomes require reconciliation rather than overwrite. No training export
is enabled; point-in-time feature retention/correction rules remain unresolved.

P30 owns the Customer-to-Sitter visit rating command. The service validates the
completed or Staff-closed visit, Customer ownership, one-rating-per-sitter-per-booking,
idempotency and optimistic version checks. It returns a role-scoped projection;
moderation and Sitter-facing projections remain P47 concerns.

GBR-48 requires the full booking to be terminal and each review to be submitted
within seven days of its authoritative completion timestamp. The Customer
adapter rechecks these conditions in the write transaction and guards against
legacy per-visit reviews of the same sitter, preserving their historical IDs.
The review schema adds a partial unique booking/sitter/direction index for new
Customer records; no historical reviews are overwritten.

The Sitter direction is implemented by `sitter-review.service.js`. It only
accepts an assigned `COMPLETED` or `STAFF_CLOSED` visit, writes a distinct
`SITTER_TO_CUSTOMER` review, and requires the injected SITTER-FEEDBACK policy
port before accepting a rating. P34 still owns runtime route/provider wiring.

The domain repository remains injected. The Customer Mongo adapter above supplies
Visit/Review/replay/audit/outbox; Sitter policy wiring remains separate. Isolated
Mongo tests do not establish actual Customer satisfaction collected on production.
