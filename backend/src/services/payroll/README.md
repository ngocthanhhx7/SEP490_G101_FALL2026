# Employment contracts and payroll

`commission-source.service.js` excludes unresolved case/refund booking credits
from commission, carries unclaimed released credits to a later period and checks
statement sources again at approval/payment. Complaint and completion writers
touch the same employee guard as payroll decisions. Base/allowance and immutable
paid statements are preserved. `VOID_UNPAID` requires Admin reason and an explicit
no-payment attestation before releasing claims from an approved unpaid statement.
See the [storage profile and hold plan](../../../../doc/database/employee-storage-profile-2026-11-08.md).

`employment-document.service.js` owns encrypted immutable application contracts,
Admin issue/sign attestations and transactional activation into EmploymentContract.
It receives the existing contact crypto port; no new secret/environment variable.
New contract saves accept only `Nam`, `Nữ`, or `Khác` for gender (Unicode NFC,
case and surrounding spaces normalized). Invalid values return HTTP 422,
`VALIDATION_FAILED`, `error.fields.gender: INVALID_GENDER` in the HTTP envelope. Legacy unsigned
documents with an invalid gender must be corrected in a new revision before
issue/sign; encrypted historical terms and hashes are never rewritten.
Signed/activated historical documents remain readable and printable unchanged.
`payroll-draft.service.js` derives contractual calendars, fixed salary/allowance and
verified service-credit previews, retaining explicit attendance/statutory evidence.
`payroll.service.js` rechecks the source hash inside preparation and retains
approval/payment/adjustment state machines. Care hours are not attendance.

See [legal scope and acceptance](../../../../doc/testing/employment-contract-payroll-2026-11-05.md).

Minimum-hours v2 documents have no fixed weekdays. Full-month automatic salary uses the agreed monthly base/allowance regardless of availability; partial months or unpaid exceptions require verified advanced attendance. The 52/12 normalized ratio cancels for full-month pay and never prices unpaid time. Legacy signed fixed calendars remain readable and unchanged.

`employment-prefill.service.js` supplies allowlisted applicant particulars and the current Admin profile/verified contacts for editable draft hints. Company legal identity/authority is never inferred from an Admin name. Hints are available only through the private Admin contract read; a saved draft always wins and immutable signed terms are unchanged. Missing historical originals stay missing with an explicit warning.

Admin `overview` aggregates persisted statement states and pending advance counts. Awaiting-payment VND includes only APPROVED statements; PAID and PREPARED amounts are excluded. Unsafe integer reports fail closed. Admin history joins bounded display names without changing immutable statement names or the owner projection.
