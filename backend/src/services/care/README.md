# Care instructions and handover

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
