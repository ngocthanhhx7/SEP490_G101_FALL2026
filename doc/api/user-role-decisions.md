# User role decisions

`POST /api/v1/users/:id/role-decisions` requires an active Admin session,
same-origin CSRF and `{ roles, reason, expectedVersion }`. Roles contains exactly
one of CUSTOMER, PET_SITTER, STAFF and ADMIN. Empty, duplicate or mixed role arrays
return422. The array field is retained for API compatibility. Reason is 3-1000 characters.
Success returns `{ userId, roles, version }` with HTTP 200.

The service rechecks the acting Admin in the transaction and serializes changes
against concurrent removal/locking of that Admin. Self role changes return 409
`SELF_ROLE_CHANGE_FORBIDDEN`; another active Admin must act. This also prevents
two active Admins concurrently demoting each other and leaving no active Admin.
Stale target versions return 409 `VERSION_CONFLICT` without applying the change.
Unknown/synthetic accounts return 404; invalid/no-op role sets return 422.

PET_SITTER membership must be preserved: granting/removing it returns 409
`SITTER_ROLE_MANAGED`. Application review grants employee access; existing Sitter
status decisions suspend/reinstate eligibility. Administrative role editing does
not create employment contracts, capabilities, shifts or remove care assignments.
An existing Sitter cannot receive an additional or replacement role here. Its
dialog is read-only and links to application/status management. Signed application
approval replaces CUSTOMER with PET_SITTER; suspension keeps the single account
role and changes personnel eligibility separately.

Every successful change increments target authEpoch/version, revokes all target
sessions and writes USER_ROLES_CHANGED with actor, reason and old/new role arrays
atomically. The acting Admin's version increments as a concurrency guard without
revoking its session. No contact or financial data changes. Existing collection
names and lock/unlock endpoints are preserved.

The menu and detail panel open a shared single-choice radio dialog. It requires a reason and
confirmation, refreshes list/detail/analytics only after acknowledgement, and
requires reload after ambiguous responses rather than automatically resubmitting.
This command uses optimistic concurrency, not durable idempotent replay.

Session and route guards reject mixed-role identities rather than choosing a
privileged primary role. Existing multi-role users require the guarded operator
[migration/cutover](../architecture/single-account-role-2026-11-09.md); historical
audit snapshots and unrelated domain records are preserved.
