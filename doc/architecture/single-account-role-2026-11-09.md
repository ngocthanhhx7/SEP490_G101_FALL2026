# One role per account

Owner decision2026-11-09: each account has exactly one role. Pet Sitter access
remains managed by approved applications and verified employment documents; the
owner explicitly selected that workflow. Sitter suspension/reinstatement remains
a separate personnel status, not an automatic Customer role change.

## Storage and API compatibility

Keep users._id, the physical users collection, indexes and existing roles array
field. It contains exactly one of CUSTOMER/PET_SITTER/STAFF/SALE_STAFF/ADMIN. Existing API
envelopes and role-decision payload keys remain; a roles array with zero, two or
duplicate roles becomes422. Native validation and Mongoose both enforce this
constraint. Historical audit previousRoles snapshots retain their original data.

Login/session and frontend route guards reject multi-role identities. ADMIN may
still use operations authorized for STAFF under the existing permission policy;
the stored role and displayed label remain ADMIN only. The sales order guard
explicitly admits ADMIN and SALE_STAFF. Sale Staff OTP sessions last 12 hours. Customer self-registration
creates CUSTOMER; approval replaces it with PET_SITTER in the same contract/
status/decision transaction and increments authEpoch. Admin role changes keep
actor serialization, self-change rejection, target version CAS, required reason,
transactional audit and session revocation. Pet Sitter cannot be added/removed
through this generic screen. Its radio group is read-only with the personnel link.

## Existing account migration

An operator-only command defaults to aggregate/preimage inspection, no writes.
It retains singleton roles. Duplicate copies of one supported role may collapse;
CUSTOMER plus exactly one distinct operational role keeps that operational role,
matching the existing frontend primary-role/customer-access behavior. Multiple
distinct operational roles, unknown roles, missing counters or unsupported native
validators block the entire plan rather than selecting by privilege priority.

Apply requires exact database/manifest digest and drained writers. Durable private
preimages/journal precede one transaction of user role/authEpoch/version changes
and revocation of those users' sessions. It never deletes users or rewrites
applications, contracts, pets, bookings, financial facts or historical audits.
Then it installs only the reviewed role validator with collMod; DDL is not part
of the transaction and unknown acknowledgement must be reconciled from metadata.
No index/TTL/provider/environment policy changes are part of this migration.

### Sale Staff validator upgrade

With the previous strict four-role validator, inspection requires all rows to
match that contract. The apply command upgrades the enum with `collMod` using the
reviewed digest and journal. This path leaves users, sessions and indexes intact.
Custom validators outside the supported contract require separate review.

A restore to the previous validator stops while a `SALE_STAFF` account exists.
Keep the current release active until those accounts are reconciled via audited
Admin decisions, then take a fresh dry run for the restore digest.

## Verification, cutover and rollback

Cover radio replacement/confirmation/reload, forged multi-role payloads and
responses, session invalidation, signed-contract approval/replay, protected Sitter
roles, self/demoted Admin, two-Admin races, target CAS and transactional rollback.
Test native invalid writes, ambiguous/stale manifests, journal/commit/DDL failures
and preservation of unrelated/post-apply records on an isolated replica set.

Independent final-SHA review and required CI precede deployment. Fresh backup and
replica restore must rehearse the reviewed command against actual metadata.
Drain writers before migration/DDL, activate the reviewed main release, assert the
role contract at deployment, then verify all users are single-role, session/auth
behavior, frontend build hash and unrelated BSON/index/validator invariants.

Retain source rollback. Restoring the previous users validator requires its exact
journal and preserves current user data; it does not restore old whole-user/DB
snapshots or automatically reintroduce multiple roles. An older application
approval writer adds a second role, so source rollback needs that explicit
metadata compatibility step and a forward recovery plan. No provider sends or
real financial operations are used for acceptance.
