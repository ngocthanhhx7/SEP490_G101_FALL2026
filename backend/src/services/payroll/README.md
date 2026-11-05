# Employment contracts and payroll

`employment-document.service.js` owns encrypted immutable application contracts,
Admin issue/sign attestations and transactional activation into EmploymentContract.
It receives the existing contact crypto port; no new secret/environment variable.
`payroll-draft.service.js` derives contractual calendars, fixed salary/allowance and
verified service-credit previews, retaining explicit attendance/statutory evidence.
`payroll.service.js` rechecks the source hash inside preparation and retains
approval/payment/adjustment state machines. Care hours are not attendance.

See [legal scope and acceptance](../../../../doc/testing/employment-contract-payroll-2026-11-05.md).

Minimum-hours v2 documents have no fixed weekdays. Full-month automatic salary uses the agreed monthly base/allowance regardless of availability; partial months or unpaid exceptions require verified advanced attendance. The 52/12 normalized ratio cancels for full-month pay and never prices unpaid time. Legacy signed fixed calendars remain readable and unchanged.

`employment-prefill.service.js` supplies allowlisted applicant particulars and the current Admin profile/verified contacts for editable draft hints. Company legal identity/authority is never inferred from an Admin name. Hints are available only through the private Admin contract read; a saved draft always wins and immutable signed terms are unchanged. Missing historical originals stay missing with an explicit warning.
