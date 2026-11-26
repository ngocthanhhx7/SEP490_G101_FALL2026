# Employee Scheduling

`visit-reminders.service.js` connects the reminder policy to real visits and
in-app notifications for JOB-01 / GBR-47. Runtime starts it every 15 minutes when
employee scheduling is enabled. Assigned future visits receive separate 120/30
minute reminders for Customer and Pet Sitter. Schedule/start/version/assignee are
rechecked in the notification transaction. Customer markers and notification IDs
follow the visit/start/lead time. Sitter markers and IDs also bind the recipient,
assignedAt and assignmentVersion, so replacing a sitter at the same time notifies
the new assignment without repeating the customer's reminder. Acceptance and
Staff reassignment increment assignmentVersion; unrelated visit writes do not.
Existing visits default to assignment version zero. Legacy per-start customer
markers remain valid, and original sitter deliveries are adopted from existing
notifications when they predate any new assignment. Markers and notifications
commit together, preventing duplicates across retries and server instances.
The Mongo query joins and filters active bookings with a customer before its
100-visit limit. Orphaned/inactive visits cannot block later valid reminders,
including after worker recreation; no process-local cursor is required.
The notification transaction still rechecks the booking and assignment.
`visit-reminder.policy.js` holds the existing pure deadline/job policy; the old
jobs import path remains a compatibility re-export.

Availability windows may explicitly register `workLocation: SHOP`; legacy/omitted
location remains HOME. `grooming-occupancy.service.js` reads bounded native shop
reservations without registering optional models while Grooming is disabled.
Window removal, HOME assignment, capability reduction and contract changes share
employee guards and preserve already reserved shop work. See the
[Grooming reservation contract](../../../../doc/api/grooming-reservations.md).
`needs-action.service.js` and `visit-board-query.service.js` provide the Staff/Admin
board with database-side filtering, exact counts and signed keyset pagination at
a fixed reference time. Both tabs can continue beyond50/500 visits. Search does
not truncate matching people. Reads have explicit execution deadlines; metadata
and contact lookup stay separate. Dispatch detail is addressed by visit ID rather
than relying on the first queue page. UC-41 adds the pending handover deadline to
Needs action and uses an exact visit filter on the All tab for the Staff notification.

`late-check-in-alert.service.js` implements JOB-07 / GBR-14. Runtime runs it every
5 minutes: each assigned visit of the Vietnam day without check-in 15 minutes after
its start sends one in-app notification to Staff, linking to that visit. The
`lateCheckInAlert` marker on the visit is saved with the notification, so a failed
save is retried and a rescheduled visit can be alerted again.

A visit released by withdrawal or suspension ends with new offers or a Needs action
entry: when automatic dispatch is off, and when an offer to a released visit is
refused for any reason other than a concurrent change, `dispatchReview` records it.

`withdrawal-review.service.js` handles pending late withdrawals. Staff/Admin must
provide a reason to reject or release. A release serializes with employee/visit
writers, preserves price and customer-directed selection, revokes stale offers,
and returns the visit to dispatch. It also works for suspended employees without
granting eligibility. Events, command replay and role-specific notifications use
existing stores; no new collection or financial decision is introduced.

`visit-completion-monitor.service.js` sends restart-safe ending/overdue reminders
and escalates missing checkout to Staff/Admin. `visit-closure.service.js` separates
operational close from Admin verification of actual service evidence. The shared
`booking-terminal.service.js` serializes parent completion with normal checkout;
it never invents checkout timestamps, free charges or refunds. Verified actual
facts feed the existing payroll source and reconciliation holds.
See [completion review contract](../../../../doc/api/visit-completion-review.md).

System bookings may carry a MATCH candidate order into dispatch. Only employees
passing current authoritative eligibility are ordered by that advice; directed
bookings retain the chosen employee. If that employee withdraws early, declines, expires or becomes ineligible, Staff may propose a replacement, but no alternative invitation is sent until the owning customer explicitly confirms. Previewing alternatives does not grant invitation permission.

Assigned care routes compose `care/assigned-care.service.js` separately from the
bounded invitation and assignment DTOs. Offers never include full care profiles,
emergency contacts or private entry notes. Dispatch still rechecks authoritative
eligibility for a customer-selected employee coming from a recommendation.

`employee-schedule.repository.js` adapts the existing availability and work-area policies to
Mongo transactions. Shared versions, effective revisions, signed employment contracts and
employee guards protect work already assigned. `schedule-policy.service.js` owns recurring
window coverage, overnight handling, operational area ancestry and occupied contract minutes.

`employee-dispatch.service.js` uses the existing invitation domain service. Its restart-safe
worker invites the first five eligible, untried employees together, including
ties at the fifth raw score. A smaller pool needs Staff review. The worker
waits until no offers remain active before sending another round. It requires acceptance and rechecks payment,
contract, approved capabilities, leave,
registered area/time, overlaps, ordinary work hours and travel evidence. Candidate scanning
is bounded to 100 registered employees with four concurrent checks and bounded provider requests.
Automatic invitations require a declared daily origin, outward/return route evidence,
and enough travel time. Approved MATCH advice is retained; otherwise route ETA and
workload order eligible employees, including newcomers without invented ratings.
Without ranking scores, the existing deterministic order supplies the batch. Automatic and explicitly addressed Staff offers use two hours, or 30 minutes
when the visit starts in at most 24 hours, capped by the visit start. The first
acceptance atomically revokes other offers.
A shortage or exhausted roster escalates to Staff/Admin, once per review episode.
Staff may also add a new eligible sitter during a pending system-selected round.
The latest automatic ranking is embedded in the visit and exposed only in Staff/Admin dispatch detail.
Checkout creates its own care plan;
the worker also finalizes compatible legacy orders still awaiting the former manual step.

`visit-withdrawal.service.js` applies the server-side 12-hour boundary. Early withdrawal
returns the visit to dispatch and sets the existing handover guard. Late withdrawal
preserves the assignment and appears in the Staff queue. The service records one event
per committed command. Handover confirmation is tracked separately.
Advisory ranking cannot change eligibility, prices or assignment state.

`schedule-proposal.service.js` uses the existing customer confirmation domain service.
Staff proposals do not change operational times until the owning customer confirms. This
atomic command retains price/duration, compares the previous nominee and visit version, and rechecks eligibility before creating one invitation for the customer-confirmed employee. Optional previousSitterId records the proposed replacement boundary without changing historical checkout snapshots.
A boarding shift cannot be moved alone; changing the whole stay requires review/requote.

`scheduling-storage.service.js` provisions additive collections/indexes through the guarded
development migration or the explicit release `scripts/deployment/ensure-indexes.js` command.
Runtime startup does not create indexes or delete existing collections.
See [API and policy](../../../../doc/api/employee-scheduling-checkout.md).

`visit-travel.service.js` scopes travel to the assigned employee, owning customer and Staff/Admin
from 30 minutes before an assigned visit until check-in or endAt. Session stop, monotonic observations,
accuracy/freshness validation,
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

Verified signed upcoming contracts allow work-area and explicitly verified capability preparation before their start date. Availability uses a contract-covered effective date; invitation/assignment continues to check contractAt against the actual visit and cannot start early. No contract dates or capability attestations are inferred.

`needs-action.service.js` builds the Staff Needs action and All visits lists (R3 10.1.1) as a read-only projection. Five reasons have a data source today: no sitter left to offer, no sitter 24 hours before the start, not checked in 30 minutes after the start, a late withdrawal under 12 hours, and not checked out 2 hours after the end. Each reason is one bounded query (at most 500 rows) and a visit appears once with every reason it has; the most urgent reason leads. Counts ignore search and filters. All visits start at 00:00 Vietnam time today in time order; searching also covers past visits, newest first, with bounded people and id lookups and a signed cursor. Nothing here writes, assigns or changes eligibility. `visit-contact.service.js` returns one visit party's verified phone number only for Staff/Admin when they press Call, reads it through the customer phone directory and records a `VisitContactViewed` event without the number. Lists never contain phone numbers.
