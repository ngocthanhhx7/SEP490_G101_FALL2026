# Admin user roles

## Implemented

- Row menu and account details open the same role dialog. Multiple roles,
  reason, before/after confirmation and acknowledged refresh are integrated.
- Admin may assign/remove Customer, Staff and Admin roles on another account.
  Existing Pet Sitter membership is retained, with a link to application review
  for employee access/status. No contracts or assignments are invented/removed.
- Backend transaction rechecks the acting Admin, version-checks the target,
  revokes sessions, increments authEpoch and audits old/new roles with reason.
  Acting Admin writes serialize concurrent mutual demotions; self changes fail.
- Ambiguous network/response results require reload before another command.
  No automatic retry or premature success is reported.

## Checks

Browser checks with intercepted synthetic Admin/user API responses passed at
1440, 390 and 320 px: row menu, editable role choices, protected Pet Sitter
membership, reason, confirmation before write, refresh and uncertain-result
reload. Screenshots inspected; compact confirmation keeps mobile actions clear.
Fixture checks do not modify real user roles or prove authenticated production
mutation acceptance.

Integration coverage exercises guest/Staff/Customer/CSRF denial, valid role
changes, old-session rejection/new-session permission, audit, enum/reason/no-op
validation, self restriction, preserved Pet Sitter access, stale/concurrent
commands, mutual Admin demotion and transaction rollback when audit fails.
Configured full-suite, lint/build and CI results are recorded in the PR.

API semantics: [User Role Decisions](../api/user-role-decisions.md).
