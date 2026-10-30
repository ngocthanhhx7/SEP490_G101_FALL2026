# Employee Scheduling

System bookings may carry a MATCH candidate order into dispatch. Only employees
passing current authoritative eligibility are ordered by that advice; directed
bookings retain the chosen employee and no ranker can replace that choice.

Assigned care routes compose `care/assigned-care.service.js` separately from the
bounded invitation and assignment DTOs. Offers never include full care profiles,
emergency contacts or private entry notes. Dispatch still rechecks authoritative
eligibility for a customer-selected employee coming from a recommendation.

`employee-schedule.repository.js` adapts the existing availability and work-area policies to
Mongo transactions. Shared versions, effective revisions, signed employment contracts and
employee guards protect work already assigned. `schedule-policy.service.js` owns recurring
window coverage, overnight handling, operational area ancestry and occupied contract minutes.

`employee-dispatch.service.js` uses the existing invitation domain service. Its restart-safe
worker sends persisted invitations, requires acceptance before assignment, preserves the
customer-selected employee and rechecks payment, contract, approved capabilities, leave,
registered area/time, overlaps, ordinary work hours and travel evidence. Candidate scanning
has a ten-second evaluation budget, plus the current provider request's bounded deadline.
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
