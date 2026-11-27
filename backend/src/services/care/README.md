# Care instructions and handover

`assigned-care.service.js` reads immutable checkout care snapshots for the
current active assigned employee. It stores an acknowledgement bound to employee
and snapshot hash; private access notes require that acknowledgement, an active
booking/assignment, confirmed replacement handover and the existing one-hour
window. It does not rebuild legacy visits from mutable owner profiles. Owner
declarations remain unverified medical information. This read/acknowledgement
runtime does not replace the legacy instruction-revision adapter below.

`visit-handover.service.js` owns UC-41 for the assigned replacement. It reads the
checkout care snapshot and prior visit summaries, and records handover and care
acknowledgements in one versioned, idempotent scheduling transaction.
`visit-handover-policy.service.js` owns the shared flag/reset and urgent-replacement
rules. Entry-note authorization stays in the existing private route.

This folder owns the P26 business boundaries for WBS-035 and WBS-036:

- `care-instructions.service.js` validates Customer instruction revisions, the
  server-side two-hour cutoff, versioned Sitter acknowledgements, and the
  one-hour access-note window.
- `handover.service.js` confirms a replacement assignment only after the
  replacement has acknowledged the current instruction version.

Both services require a `runForVisitActor` repository port. The adapter must
perform ownership checks, CAS, idempotency, audit/outbox writes, access
capability revocation and handover persistence in one transaction. P01 owns the
Visit/Assignment DTO and persistence schema; P34 owns route registration and
runtime composition. Until those adapters are supplied, the module is
`INTEGRATION_PENDING`; unit doubles do not prove a live API or MongoDB flow.

Private home access notes are never part of a broad booking projection. The
adapter must return them only to the assigned sitter in the server-authorized
window and after a required handover.

`visit-evidence-access.service.js` permits the owning Customer to read a private photo only when the media binding, visit evidence reference, image owner/digest/kind and booking ownership agree. Existing image-owner access remains; unbound uploads, applicant documents and other Customers/Admin/Staff receive no new access. All lookups use existing primary IDs and bounded timeouts.

Service Workflow owns bounded Service draft/publication and immutable per-Visit tasks. `service-workflow.service.js` handles Admin publication/history; `workflow-snapshot.service.js` captures and projects immutable definitions; `visit-workflow.service.js` owns CAS task writes, named-slot binding, phase gates and reasoned Staff retry. It reuses employee commands/events and care media; only immutable version history has its own store. See [API](../../../../doc/api/service-workflows.md) and [storage plan](../../../../doc/database/service-workflow-plan.md).

Bulk care-instruction updates carry the selected visit's version and the exact
IDs/versions of the later visits shown to the customer. A changed target or
crossed two-hour cutoff requires a fresh view and confirmation before writes.

For a visit with a published workflow, the execution checklist contains only
customer-added tasks. Checkout verifies their required items along with the
published workflow gates.
