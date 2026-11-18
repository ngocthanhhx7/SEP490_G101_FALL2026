# Service Workflow acceptance — 18 November 2026

Scope: issue #381, feature/service-care-workflow. Owner assigned Thành author and Chung review. Baseline develop `692c2521e0e693451c4b0180f274b98ee068efe4`; implementation integrated reviewed develop `d76e5e548c3c6094c4e5f22081c4cc02dab57b39`. GitHub review/CI must bind to the final PR SHA; this document is test evidence, not an approval or production release.

## Verified implementation

| Acceptance | Evidence actually exercised |
| --- | --- |
| AC-01 Admin builder | Native Mongo draft/validate/publish/replay/history and HTTP Admin/session/CSRF; Chromium builder publish and keyboard ordering |
| AC-02 immutable versions | Actual checkout confirms V1; later publication V2 is used only for new booking; old snapshot retained; retirement and boarding shift preservation |
| AC-03 named photos | Left/right slots independently counted; one media reference cannot fill both; failed completion rolls back binding |
| AC-04 check-in | Wrong assignment/early time/missing workflow refused; existing timing, payment and handover regressions retained |
| AC-05 task persistence | Native persisted task/result and refresh; real PNG decode/upload/read via isolated HTTP media adapter |
| AC-06 check-out | Generic checklist cannot bypass versioned Visit; missing tasks/slots rejected; full workflow plus original departure command completes through existing payroll gate |
| AC-07 multiple pets | Separate per-pet task keys; wrong pet and cross-pet photo reference reuse refused |
| AC-08 concurrency/retry | Same-key concurrent writes produce one event/result; competing expectedVersion saves have one winner; Chromium aborts response after committed task and explicit retry succeeds without duplicate upload/task |
| AC-09 reassignment | Former sitter loses mutation scope; handover/acknowledgement gate; replacement continues while retaining previous uploader/photo/audit |
| AC-10 privacy | Other Customer/Sitter cannot access Visit; hidden tasks absent from Customer projection; media requires immutable binding/digest and visibility; HTTP other Customer photo 404 |
| AC-11 incident | Existing IncidentService backed by cases; report/replay, Staff review, blocked-task notification/board/reasoned retry; open incident gates care; explicit Admin no-impact closure, no payment/refund writes |
| AC-12 legacy | Missing snapshot returns LEGACY; publishing later does not retroactively attach it; original check-in/checklist behavior retained |
| AC-13 storage failure | PENDING/invalid MIME/unowned evidence refused without version/binding commit; stable upload/command retry; existing private-image provider failures covered by repository regressions |
| AC-14 isolation | Template/task commands leave booking money, price policies/payment/tax/payroll stores unchanged; only original finalization issues existing service credit; booking-change preserves workflow/results |
| AC-15 responsive | Chromium 1440, 390, 320 px: Admin/Sitter/Customer plus Staff blocked retry and incident report/review; keyboard reorder, no horizontal overflow or page JS errors |

Additional regressions cover duplicate/unsafe definitions, Unicode byte-size bound, history final-page termination, router auth not intercepting public/provider routes, incident resolution replay after server clock advances, cancellation and actor/body tampering. Phase/generic arrival/departure photos remain distinct references under the existing check-in/out contract.

## Runs and limits

- Architecture checker, backend lint, frontend lint and frontend build passed. Vite retains the existing large-bundle warning; no bundle splitting is claimed.
- Initial complete backend run: 196 suites, 2,056 tests passed, one old execution DTO allowlist failed because the new workflow field was absent from its expectation. Corrected that expectation and reran the affected suites. Initial complete frontend run similarly found one old reason-filter expectation; corrected and reran.
- Complete frontend rerun before latest develop integration: 174 suites / 1,348 tests passed. Integrated regression after develop synchronization: 8 backend suites / 212 tests and 5 frontend suites / 88 tests passed. Final pagination delta: 8 workflow frontend tests passed. PR CI is the final complete integrated-source gate; do not label the initial failing runs as all-green.
- Native MongoDB 8.0.34 isolated replica sets provide transactions/CAS. Development provisioning test proves dry-run creates no collection, apply is additive/idempotent, and non-dev apply refuses without creating storage. Native history explain uses the unique service/revision index without COLLSCAN or in-memory SORT. No legacy backfill is performed.
- Production read-only metadata: reviewed main `8c53c0c2a4f896f287ddac50d943760a430371b2`, green 3001, readiness 200, 85 collections and no workflow snapshots. Cases already has booking_source_lookup; bounded Visit-specific incident explain uses it (zero matching current records); no production latency/throughput improvement is claimed.
- Actual R2 read-only check verified two existing private objects, 5,457,861 total bytes with MIME/length/SHA-256 agreement. Production uploads and business writes: zero. Env hash stayed unchanged. Browser media writes used a synthetic in-memory provider only, not production R2.

## Required release gates

Review final source/CI, approve workflow business content, plan private-image quota/retention capacity, then obtain operational approval for production history provisioning and rollout. Follow [API](../api/service-workflows.md) and [storage/rollback plan](../database/service-workflow-plan.md). The 13 editable development examples remain DRAFT proposals; they were not inserted or published in production. No production migration/deployment, fabricated clinical verification, real shop execution/payment acceptance or training claim.

Local detailed JSON/logs and screenshots are ignored task evidence under the author worktree .codex, not public customer data. The primary checkout's existing .env, edited backend/.env.example, stashes and other worktrees are preserved.
