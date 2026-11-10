# Employee Scheduling

System bookings may carry a MATCH candidate order into dispatch. Only employees
passing current authoritative eligibility are ordered by that advice; directed
bookings prioritize the chosen employee. Automatic dispatch can rank other eligible employees if the initial preference is unavailable, declined, expired, or withdrawn. A customer-confirmed reschedule keeps its existing sitter constraint.

Assigned care routes compose `care/assigned-care.service.js` separately from the
bounded invitation and assignment DTOs. Offers never include full care profiles,
emergency contacts or private entry notes. Dispatch still rechecks authoritative
eligibility for a customer-selected employee coming from a recommendation.

`employee-schedule.repository.js` adapts the existing availability and work-area policies to
Mongo transactions. Shared versions, effective revisions, signed employment contracts and
employee guards protect work already assigned. `schedule-policy.service.js` owns recurring
window coverage, overnight handling, operational area ancestry and occupied contract minutes.

`employee-dispatch.service.js` uses the existing invitation domain service. Its restart-safe
worker offers one eligible employee at a time or the entire group tied on the
highest remaining raw ranking score. It waits for all responses in the current
group before sending another. It requires acceptance and rechecks payment,
contract, approved capabilities, leave,
registered area/time, overlaps, ordinary work hours and travel evidence. Candidate scanning
is bounded to 100 registered employees with four concurrent checks and bounded provider requests.
Automatic invitations require a declared daily origin, outward/return route evidence,
and enough travel time. Approved MATCH advice is retained; otherwise route ETA and
workload order eligible employees, including newcomers without invented ratings.
Without ranking scores, the existing deterministic order supplies one employee at
a time. Automatic and explicitly addressed Staff offers use two hours, or 30 minutes
when the visit starts in at most 24 hours, capped by the visit start. The first
acceptance atomically revokes other offers.
Only exhausted/unavailable invitations escalate to Staff/Admin, once per review episode.
Staff cannot initiate invitations before escalation. Checkout creates its own care plan;
the worker also finalizes compatible legacy orders still awaiting the former manual step.

`visit-withdrawal.service.js` applies the server-side 12-hour boundary. Early withdrawal
returns the visit to dispatch and sets the existing handover guard. Late withdrawal
preserves the assignment and appears in the Staff queue. The service records one event
per committed command. Handover confirmation is tracked separately.
Advisory ranking cannot change eligibility, prices or assignment state.

`schedule-proposal.service.js` uses the existing customer confirmation domain service.
Staff proposals do not change operational times until the owning customer confirms. This
atomic command retains employee/price/duration, rechecks eligibility and creates an invitation.
A boarding shift cannot be moved alone; changing the whole stay requires review/requote.

`scheduling-storage.service.js` provisions additive collections/indexes through the guarded
development migration or the explicit release `scripts/deployment/ensure-indexes.js` command.
Runtime startup does not create indexes or delete existing collections.
See [API and policy](../../../../doc/api/employee-scheduling-checkout.md).

`visit-travel.service.js` scopes travel to the assigned employee, owning customer and Staff/Admin
during an active visit window. Session stop, monotonic observations, accuracy/freshness validation,
TTL latest-only storage and transaction guards protect updates. Travel does not complete care,
attendance or finance. Explicit ETA uses the configured route adapter. Dispatch orders eligible
candidates by available adjacent-route evidence and workload before an optional advisory ranker.

Dispatch recovery exposes bounded Staff/Admin candidate previews for an alternative
start time, with aggregate rejection reasons and names only for eligible candidates.
City-wide bookings do not match district-only employee registrations. A Staff
proposal may refine a HOME visit from a parent area to its direct child at the
same saved pin. The owning customer sees and confirms that area with the new time.
System bookings may nominate an eligible employee after escalation; directed
bookings retain their requested employee. Both proposal creation and confirmation
recheck eligibility, and system recovery offers retain daily-origin route checks.
Past shifts cannot receive invitations. Immutable checkout/price/address snapshots
remain unchanged; only the consented operational time and area are updated.
Customer confirmation also pins the nominated employee as the operational requested
sitter. The worker cannot replenish that consented choice with other employees;
acceptance is still required and original checkout snapshots remain unchanged.
Owner-scoped proposal reads additionally resolve the nominated sitter's display
name with an allowlisted projection; contact and application details are not exposed.

With AI enabled, automatic dispatch composes the advisory operational ranker.
Only an exact permutation of authoritative eligible IDs is accepted. Incomplete,
invalid or timed-out advice preserves deterministic ordering. A private selected
feature snapshot is copied from the offer to the visit only on acceptance.

`dispatch-workspace.service.js` supplies a read-only Vietnam-day projection: all-day counts and at most 50 chronologically sorted visits with allowlisted display names. ASSIGNED visits more than 15 minutes late without check-in are flagged for inspection, not automatically closed or deemed absent. Queue display names are enriched separately; the worker query, invitation eligibility and financial writes are unchanged.

`calendar-read.service.js` reads current/capability off dates plus effective
revision baseline/transitions in one read-only snapshot session, using at most four
data commands (three for a single day). It groups same-day revisions by their
latest version with existing indexes; no guard or scheduling writes move here.

Current-time MANUAL previews use the same eligibility as explicit manual invitations, expose bounded Staff-only per-person blocking reasons and sort by weekly workload. Automatic/alternative-time previews still require daily-origin route evidence. `sitter-origin.service.js` owns employee-only day-origin declarations with shared capability CAS, employee guards and audited idempotency. See [onboarding design](../../../../doc/testing/dispatch-onboarding-2026-11-09.md).
