# Role Access And Login Routing

Work item: P34-A-ROLE-ACCESS. Branch: `feature/role-access-flow`.

## Expected Access

| Session | Default destination | Storefront | Purchase | Management |
| --- | --- | --- | --- | --- |
| Guest | Sign in when a private route is requested | Public browsing | Requires login | Requires login |
| Customer | `/` | Available | Owned Customer workflow | Forbidden |
| Pet Sitter | `/sitter` | Returns to workspace | Forbidden | Assigned sitter routes |
| Staff | `/staff` | Returns to workspace | Forbidden | Staff routes |
| Admin | `/admin/dashboard` | Returns to workspace | Forbidden | Admin and Staff routes |

Operational membership takes priority over retained Customer membership. Stored
roles and existing records are preserved. Common account settings/notifications
remain available within the selected role shell. Published legal policies remain
public. This is a permission rule, not a database migration.

Login returns to an authorized internal private path, preserving its query.
External URLs, encoded paths, backslashes, traversal, unsupported destinations
and paths belonging to another role use the role default. Both OTP completion
and an existing session use this rule. Session invalidation removes the private
outlet; malformed session roles fail closed.

The backend `hasRole` helper rejects Customer permission for operational users,
including mixed role arrays. Existing route gates and resource authorization
therefore agree. The checkout domain service repeats this check before accessing
a quote or creating a booking. Admin inherits Staff, never Customer or sitter.
Ownership, CSRF, authEpoch and payment/provider checks remain required.

## Local Evidence

- Frontend full Jest: 98 suites / 636 tests passed.
- Backend full Jest: 120 suites / 1037 tests passed; this run began before the
  final checkout domain and HTTP regression additions. Focused final runs are
  recorded in the release handoff; do not treat the earlier full run as their evidence.
- Frontend/backend lint, package architecture and frontend production build passed.
  Vite reports its existing large bundle warning.
- Playwright with intercepted synthetic sessions/APIs: 15 cases at 1440, 390 and
  320 px. Login destinations, retained Customer plus operational roles, direct
  forbidden URLs, anonymous booking/admin access, absence of unauthorized page
  requests, browser exceptions and horizontal overflow were checked. Screenshots
  and results remain local in `.codex/role-access-browser/`.
- Source inspection: session authentication reloads current roles/state/authEpoch
  from the user record; the shared client invalidates session state on HTTP 401.

No live OTP, customer account, booking or payment was created. Synthetic API
responses do not establish authenticated production acceptance. Production
SSH and public HTTPS checks timed out during this work; deployment and current
VPS health must be established from fresh evidence before rollout.

## Release Transaction Regression

Combined release CI exposed an application transaction abort error: Mongoose
tried to restore the default `__v` on strict document/consent subdocuments which
do not persist that field. These subdocuments now explicitly disable that key;
the application's domain `version`, strict validation and unique indexes remain.

A deterministic integration regression throws a labelled transient Mongo error
after the submission callback writes. It returned HTTP 500 before the fix; after
the fix it returns 201 after two attempts, with one application, submission audit
and mail queue record. Intake and application mail tests passed together locally
(16 tests). The concurrent owner test still requires exactly 201/409.

The runtime mail test waits for the fake delivery signal with a 10-second
deadline, then checks shutdown commits `ACCEPTED`. Its former one-second polling
window could expire on busy hosts. No SMTP delivery or real applicant mutation
is performed by these tests. Final CI/review/deployment evidence stays in the
release handoff; the local focused result does not establish release completion.
