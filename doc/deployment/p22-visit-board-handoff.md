# P22 / WBS-029 Visit Board handoff

15/10/2026 · UC-35 View Unassigned Visits / UC-37 View All Bookings / UC-38 Monitor Today's Visits; workbook aliases UC-36/38/39. EXT-NOSITTER follows user delta; no finance decision or shared schema is silently changed.

Assigned contributor/author/committer/push/PR: Nguyễn Hữu Anh Nhật (anhnhat432). Assigned independent reviewer: Phạm Thành Chung (Chunggrizzy11); merger Nguyễn Ngọc Thành (ngocthanhhx7). Accounts are verified through the local helper before publication; assignment is not proof of approval. Git/PR records hold the final SHA and actual review/merge states.

Branch feature/wbs-029-visit-board; worktree D:/WW/SEP490_G101_FALL2026-p22; base6c8fc7aef2e1201b7be93bc74aaf66cc25ad9391. P21 PR47/48 and P04 PR11 are merged. At the starting inventory P20 has no merged PR and exists only as local untracked read-module preparation; no predecessor changes are copied or committed under P22 author. Existing files in the primary checkout remain untouched.

## Delivered independently

- Scoped board service with bounded time/area/type/state/cursor query and allowlisted projections; roles, grant revocation, ownership and snapshots rechecked on guarded writes.
- No-sitter remedy content/time/Customer response, separate pending state, explicit slot confirmation and atomic audit/outbox ports; no automatic offer/assignment or resolved booking from a proposal.
- Manual assignment uses fresh P21 hard-gate evaluation inside transaction callback, Visit CAS, payment/directed confirmation and pending-Customer-remedy gates.
- Exported session/role/CSRF HTTP router, no global registration; Staff/Admin UI with Vietnam date/time filters, pagination, detail/response panel, proposal/manual assignment and loading/empty/error/forbidden/pending states.
- [P01/P34 repository, contract and route proposal](../api/p22-visit-board-integration-proposal.md). No app/runtime/manifest/lockfile/token/shared-schema changes. Source uses P04 controls and tokens.

## Checks and limits

Final checks in this worktree: clean npm ci --ignore-scripts for both components; npm run lint for both; full backend npm test439tests/41suites PASS (50P22 tests); full frontend npm test348tests/44suites PASS (19P22 tests); frontend npm run build PASS; npm audit in both components0vulnerabilities. Isolated backend integration suites use their own Mongo, not Atlas/customer data. P22 repository tests use a synthetic serial/rollback transaction port; one winner proves callback/CAS orchestration only, not cross-process Mongo guard correctness. HTTP tests mount the exported router with synthetic authentication, not the runtime session composition.

Negative cases cover server scope, role denial, expiry/revocation, typed bounded filters, malformed civil dates/cursors/IDs/payloads, no private projection leaks, stale versions, missing explicit Customer confirmation, idempotency replay/conflict, pending remedy blocking manual assignment, payment/directed gates, ineligible/occupied Sitter, start deadline during eligibility read, guarded synthetic race and audit rollback. Warnings: backend ESM VM Modules experimental; clean install deprecated glob/whatwg-encoding from existing pinned dependencies. No unrelated dependency update is introduced. Staged UTF-8/LF/local-link/env/generated-file and whitespace audit is required before commit; results are recorded in PR evidence.

Browser preview used local-only synthetic fixtures in ignored .codex files, real P04 CSS/fonts and an iframe viewport360px. Rendered document width345px after scrollbar equaled scrollWidth345px, so no horizontal overflow. Keyboard Tab from the visit action focused the Customer message input with a visible focus ring; shared controls are at least44px targets. Nunito and FC DK Cool Crayon loaded from existing assets. No Figma P22 frame was supplied: UI PROVISIONAL, not VERIFIED_FIGMA. Browser fixture is not production API/auth/provider evidence and is not included in the commit.

## Blocking integration dependencies

IMPLEMENTED / VERIFIED for independent service, HTTP and UI tests; INTEGRATION_PENDING for P20 read module, production repository/guards/outbox, P01 contract approval and P34 route/shell wiring. The P22 branch can be published for concrete review, but predecessor/repository gates must not be bypassed to claim the full flow verified or merge a blocked delivery. No approval is inferred from tests. Customer-side remedy read/confirm UI belongs to P20/P42; P22 supplies the Customer response service/HTTP boundary and Staff read panel, without adding pages outside its responsibility.

Real notifications/email/SMS, staff-area grant storage, Mongo contention with Offer acceptance/suspension, Atlas and actual Customer selection remain unverified. P34 must implement common guards, indexes and repository contracts; P33 owns reliable notification delivery. P51/P25 own money/cutoff decisions for schedule changes. Missing decisions return a gate via validateAlternativeSlots/confirmAlternativeSlot. Do not use fixture policy defaults in production.

Sources read: pasted master/P22 task and local role map/review-merge rules; AGENTS/README/CONTRIBUTING/source-code-management; revised UC/WBS plan, user delta/source register/scope/execution map/handoff and HouseBuddy static query observations; P01 domain/API v1; P21 dispatch/proposal/job handoff and code; P04 shared components/fonts/tokens. No external benchmark/model/provider or Drive source update is claimed. Exact integration obligations and safe projections are in the linked proposal.
