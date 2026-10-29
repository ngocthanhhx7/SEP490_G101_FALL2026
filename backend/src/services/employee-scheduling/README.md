# Employee Scheduling

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

`scheduling-storage.service.js` provisions additive collections/indexes only through the
guarded development migration. Runtime does not create indexes or delete existing collections.
See [API and policy](../../../../doc/api/employee-scheduling-checkout.md).
