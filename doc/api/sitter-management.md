# Sitter Management

Staff and Admin use `/admin/sitters` or `/staff/sitters`, with details at
`/:userId`. Customer `/sitters` retains the approved public profile projection.

## Read API

All endpoints require an active authenticated Staff/Admin session and return
`Cache-Control: private, no-store` and `Vary: Cookie`.

| Endpoint | Projection |
| --- | --- |
| `GET /api/v1/sitter-management` | Cursor page, filtered total, area labels |
| `GET /api/v1/sitter-management/reports` | Current population counts, area distribution, period visit states |
| `GET /api/v1/sitter-management/:userId` | Operational profile, application summary, capabilities, current contracts, schedule and permitted audit |
| `GET /api/v1/sitter-management/:userId/activity` | Cursor page of assigned visits in the period; no customer address/contact/care notes |

List and reports filters: `search` (literal name), `status` (ACTIVE/SUSPENDED/MISSING),
`area` (operational code), `employmentType` (FULL_TIME/PART_TIME/MISSING/AMBIGUOUS),
`profileState` (APPROVED/SUBMITTED/REJECTED/MISSING), `source` (ALL/REAL/DEMO).
Reports and activity accept `days=7|30|90`, default30, using Vietnam calendar days
through the current day. List/activity accept `limit=1..50`, default20, and signed
`cursor`. Cursors bind actor, filters and target; changing filters resets pagination.
Invalid filters return422; inaccessible/non-sitter targets return404 after the role gate.

Counts cover all matching users with PET_SITTER role, including unpublished profiles
and missing configuration. Legacy synthetic sentinels are excluded; `fixtureKey`
identifies sample records. Real and Demo totals are always separate. Active means
active account and operational status, not proof of availability for a particular job.
Current contracts must be signed and effective now; overlapping contracts are flagged.
Reports count visits by scheduled start in the period and exclude SUPERSEDED; an
unassigned system visit is not attributed to a sitter. No revenue or quality score
is derived from these counts. Missing visit storage is reported as unavailable.

Details expose only operational data. No contact ciphertext, identity keys,
document/storage references, salary amounts, private travel origins or customer
care data are serialized. Only Admin receives the application link/status permission
and the last20 application/status audit events. Published CUSTOMER_TO_SITTER ratings
alone produce the optional rating count/average; comments are never exposed here.
All reads use bounded snapshot queries. Existing collection names are preserved.

## Commands And Navigation

Admin suspension/reinstatement reuses
`POST /api/v1/applications/:applicationId/sitter-status`: CSRF, reason,
expected status version, stable idempotency key and transactional audit remain
mandatory. An uncertain response freezes the payload for an identical retry.
Application documents stay behind the existing Admin application view and media gates.

Pending public profile review supports `?userId=` on its existing Staff queue,
with target-bound cursor context. Review still rejects self-review and stale versions.
Dispatch links retain the selected sitter in `?sitterId=` and send it as the existing
invitation command's optional `sitterId`. The backend rechecks eligibility and
occupancy, approved care plan, verified payment and directed-customer restriction;
neither the directory nor an AI score reserves or assigns a slot.

AI threshold60 remains unchanged. No verified outcome, rating, employment claim,
payment or assignment is fabricated by this module.
