# P28 handoff — role dashboards, sitter profiles and earnings

Date: 15 October 2026, Asia/Saigon. Status: **IMPLEMENTED / INTEGRATION_PENDING**.
PR/merge state must be checked on GitHub; this document does not assert approval or merge.

Scope: WBS-047/054/057/058/067/068/069/N07. UC-20/21/22/23/30/39/46/66,
EXT-SETTLEMENT / EXT-UX and provisional UC-N06 payroll. Source: P28 brief, current
P01 API permissions, P51 v1 financial contract and P04/P48 brand/layout exports.
Private implementation prompts and team credential/role maps remain local.
No Drive reports or diagrams were modified or copied into the repository.

The eight role/page entry points, source projection services, runtime HTTP routers,
and same-origin API adapters are implemented. The runtime now includes a durable
P41-backed Admin payroll read adapter when Mongo/auth configuration is available;
it fails closed until settlement request/user source rows satisfy the DTO contract.
Ownership is derived from authenticated
sessions and checked again for personal visit/earning/profile records. Admin inherits
Staff dashboard access but cannot read personal sitter/customer endpoints without that
actual role. Staff cannot read payroll. Financial reads require an authoritative,
policy-versioned snapshot with no unresolved decisions. No synthetic data is imported
by application modules; missing adapters stay pending rather than producing fake zeros.

The shared read/renderer boundary is introduced with WBS-047; each remaining WBS has its
own service/router/page/adapter/test commit. The branches form a dependency stack rooted
at develop c95e54ef9667f3036b325f8918c8c12283c0ab26. A combined draft PR is appropriate
because all entry pages consume the shared boundary. Commits preserve the assigned
contributors: Chung (047/057/067/068), Thành (054/069/N07), Nhật (058). The consolidated
PR requires an independent reviewer outside all three contributors; Hải is the first
eligible fallback in the local role policy. Thành remains the final merger after gates.
Authorship and publication identities are verified using the local helper per action.

## Checks actually run

| Check | Actual result |
| --- | --- |
| Backend npm run lint | PASS after runtime registry, settlement enum and identifier-contract changes |
| Backend npm test -- --selectProjects unit --testMatch '**/tests/unit/**/*.test.js' | 57 suites, 511 tests PASS (including P28) |
| Backend npm test -- --selectProjects integration --testMatch '**/tests/integration/p28-*.test.js' | 2 suites, 11 tests PASS; real Express, synthetic sessions, no DB/provider |
| Frontend npm run lint | PASS |
| Frontend npm test | 67 suites, 437 tests PASS (the NotificationsPage fix from PR #73 is present in the current base) |
| P28 frontend tests within that run | 3 suites, 24 tests PASS |
| Frontend npm run build | PASS for existing runtime entry; role routes are now composed in `AppRoutes.jsx` |
| Browser fixture | Four role dashboards, earnings and payroll rendered in 360px iframe; client/scroll widths both 345px after vertical scrollbar, no horizontal overflow |
| P48 drawer in fixture | Open button works; Escape closes and restores focus to trigger |

Jest's configured `<rootDir>` testMatch gets an escaped `.codex` path in this managed
Windows worktree and finds zero backend tests without the explicit relative glob shown
above. No passWithNoTests, shared config change or skipped assertion was used.
The frontend full-suite run was executed on the current PR head after the PR #73
NotificationsPage fix was synchronized into the base. No frontend test failure is
being carried as an open gate for this head.

Negative coverage includes Guest/expired/wrong-role reads, Staff payroll denial,
foreign-owner rows, projection scope mismatch, unknown ownership query filters, invalid
dates/limits/cursors, pending financial decisions, fractional/negative/unbalanced ledger
amounts, missing transfer evidence, canceled visits, filter/pagination reset, stale read
races, sign-out cleanup and Vietnam Sunday-to-Monday timestamp rendering. P28 has only
GET endpoints; mutation idempotency/reservation races remain the responsibility of P41.
Production cursor signature/DB index/atomic snapshot performance still needs adapter tests.

## UI and remaining gates

UI is **PROVISIONAL**: no current Figma frame was supplied or read. Reuses P04 tokens,
Nunito/Crayon assets, controls and P48 layout. Fixture files in frontend/tests/manual are
synthetic and deliberately outside application routes/build entry. To inspect: run the
frontend dev script and open `/tests/manual/p28-preview.html`; query `role` and `page`
select fixture cases. Physical touch-device checks, all-page desktop visual comparison
and production end-to-end checks were not performed.

No real Mongo/ledger/provider flow was verified. The payroll adapter has unit coverage
for its aggregation projection, literal search, scope-bound cursor and fail-closed
source validation, but no live P41 collection was available in this worktree. P41's persistent repository, P27 care
projection, P30 rating moderation and P20/P24 operational read adapters need composition.
FIN-07 eligibility/commission and post-payout details remain open; P28 does not resolve
them. The runtime read module mounts all eight paths and the frontend role navigation
points to their pages, but missing repositories still return pending. P34/P01 must
supply the persistent source composition described in the [integration proposal](../api/p28-read-projections.md).
No shared manifest, model, global token or concurrent workspace edits are overwritten.

Full task acceptance, APPROVE and merge remain blocked by these integration/decision
gates. Preserve the draft until they are resolved;
then rerun the relevant suites, inspect the final diff/head and request an independent
review on that exact SHA. No CI result or approval is inferred from local checks.
