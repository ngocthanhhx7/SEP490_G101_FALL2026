# P06 WBS-005 — Role-Based Authorization handoff

**Work item:** WBS-005, UC-05
**Branch:** `feature/wbs-005-role-based-authorization`
**Owner/commit author:** Nguyễn Hữu Anh Nhật (`nhat`)
**Reviewer:** Phạm Thành Chung (`chung`)
**Merge owner:** Nguyễn Ngọc Thành (`thanh`)
**Base:** `develop` at `28bf288` when this branch was created.

## Delivered

- `requireSession` validates active, non-synthetic sessions, expiry and the four P01 roles. It copies only user/session identifiers, state, roles and expiry into `req.auth`.
- `requireRoles` enforces Customer, Pet Sitter, Staff and Admin gates. Admin inherits Staff only.
- `requireCsrf` requires an authenticated session, an exact same-origin (or configured allowed origin) `Origin`, and a session-verified `X-CSRF-Token`.
- `createAuthorizationService` requires a resource loader, explicit actor/action/resource policies and an audit writer. Missing policy denies; audit failure returns 503. A policy can conceal owner mismatch as `404 RESOURCE_NOT_FOUND`.
- `requireResourceAuthorization` attaches only an authorized resource for the route handler. The caller remains responsible for safe response projection and mutation allowlists.

## Checks

Run in `backend/` with the locked package set:

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed; 0 reported vulnerabilities |
| `npm run lint` | Passed |
| `npm run test:unit` | Passed, 4 suites / 78 tests |

The unit suite covers role inheritance/denial, session expiry/state/role filtering, resource ownership concealment, invalid action/resource, required audit behavior, CSRF origin/token/session failures and middleware responses. It uses controlled test ports and does not claim MongoDB route integration.

## Integration gates

- P34 must inject the P06 session service as the `session` port and compose `requireSession(sessionService)` plus `requireCsrf(sessionService)` for unsafe authenticated routes. P02's default session port is deliberately unauthenticated and has no CSRF verifier.
- Each domain route must supply explicit actor/action/resource/context policy, load resources through an authorized repository boundary, apply field allowlists and safe serializers, and persist audit decisions. Hiding a frontend button is not authorization.
- The service does not define product-wide role policies or register business routes. Authenticated `/me` and account-lock routes remain owned by their feature packages.
- Frontend route guards remain UX only; the P03 session adapter and P08 screens still need P34 integration.

**Figma:** not inspected; this work item has no screen changes.
**Delivery/provider inputs:** none used by this work item.
**State:** implementation checks passed; PR/review/merge are separate workflow states.
