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
`area` (operational code), `employmentType` (FULL_TIME/PART_TIME/MISSING),
`profileState` (APPROVED/SUBMITTED/REJECTED/MISSING), `source` (ALL/REAL/DEMO).
Reports and activity accept `days=7|30|90`, default30, using Vietnam calendar days
through the current day. List/activity accept `limit=1..50`, default20, and signed
`cursor`. Cursors bind actor, filters and target; changing filters resets pagination.
Invalid filters return422; inaccessible/non-sitter targets return404 after the role gate.

Counts cover all matching users with PET_SITTER role, including unpublished profiles
and missing configuration. Legacy synthetic sentinels are excluded; `fixtureKey`
identifies sample records. Real and Demo totals are always separate. Active means
active account and operational status, not proof of availability for a particular job.
Current contracts follow scheduling's latest effective date/version selection.
That selected revision must be signed and unexpired; expired or unsigned newer
revisions cannot silently fall back to an older contract.
Reports count visits by scheduled start in the period and exclude SUPERSEDED; an
unassigned system visit is not attributed to a sitter. No revenue or quality score
is derived from these counts. Missing visit storage is reported as unavailable.

Details expose only operational data. No contact ciphertext, identity keys,
document/storage references, salary amounts, private travel origins or customer
care data are serialized. Only Admin receives the application link/status permission
and the last20 application/status audit events. Published CUSTOMER_TO_SITTER ratings
alone produce the optional rating count/average; comments are never exposed here.
All reads use bounded snapshot queries. Existing collection names are preserved.

## Staff directory (UC-74)

`GET /api/v1/sitter-management?view=staffList` requires Staff or Admin. It
restricts results to active accounts with an active sitter status. The Staff
page sends `status=ACTIVE`, `limit=20` and the chosen `sort`. Calls without
`view`, including the Admin list, retain the existing defaults and DTO.

- `sort=rating|lateCheckIns|withdrawals`, default `rating`. Values sort
  descending, unknown values last, followed by name and ID for ties.
  `withdrawals` is reserved for the follow-up and returns
  `422 VALIDATION_FAILED` while its source is unavailable.
- `search` matches a literal substring of the name, displayed employee code
  or verified phone. Vietnamese local and international mobile formats are
  equivalent. Phones and their ciphertext stay on the server.
- `employmentType`, `area`, `profileState`, `source`, `limit` and `cursor`
  retain their existing validation. The signed Staff cursor is bound to actor,
  filters, sort and the as-of time used for the 30-day window.
- `tabCounts` contains `all`, `partTime` and `fullTime` for the active population,
  before search or other filters. An active sitter without a current contract
  contributes to `all` only. `total` reflects the filtered result.
- Rows include the current contract's `employeeCode` as `code`, or the
  previously displayed six-character ID suffix. `workingWindows` shows the
  effective part-time revision. `rating` is the mean of published customer
  ratings. `lateCheckIns` counts actual check-ins more than five minutes after
  the scheduled start, from `asOf - 30 days` through `asOf`.
- `withdrawalsAvailable: false` and `withdrawals: null` indicate the missing
  UC-82 source. `approvedLeave: null` and `shift: null` indicate the missing
  approved-leave and Admin shift sources. These nulls do not represent zero
  or an empty schedule. The separate reports endpoint retains its own period.

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
