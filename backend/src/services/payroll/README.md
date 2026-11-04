# Employment contracts and payroll

`employment-document.service.js` owns encrypted immutable application contracts,
Admin issue/sign attestations and transactional activation into EmploymentContract.
It receives the existing contact crypto port; no new secret/environment variable.
`payroll-draft.service.js` derives contractual calendars, fixed salary/allowance and
verified service-credit previews, retaining explicit attendance/statutory evidence.
`payroll.service.js` rechecks the source hash inside preparation and retains
approval/payment/adjustment state machines. Care hours are not attendance.

See [legal scope and acceptance](../../../../doc/testing/employment-contract-payroll-2026-11-05.md).
