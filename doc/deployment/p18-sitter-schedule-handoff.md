# P18 - Sitter work schedule, service areas, and days off

Date: 2026-10-14. Scope: UC-33, UC-34, UC-N02 / EXT-AREA; WBS-022, WBS-023, and WBS-N02.

This handoff records the implementation state and its integration gates. It does not claim that the Paw World Care application is runnable or that fixture tests prove a live flow.

## Ownership and checkouts

| Work item | Assigned contributor / feature branch | Reviewer | Checkout | Base |
| --- | --- | --- | --- | --- |
| WBS-022 Working Hours Calendar | Pham Thanh Chung / `feature/wbs-022-working-hours-calendar` | Doan Tien Dat | `SEP490_G101_FALL2026-p18-wbs-022` | `28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f` (`origin/develop`) |
| WBS-023 Day Off Request | Doan Tien Dat / `feature/wbs-023-day-off-request` | Dang Van Hai | `SEP490_G101_FALL2026-p18-wbs-023` | `28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f` (`origin/develop`) |
| WBS-N02 Sitter work areas | Pham Thanh Chung / `feature/wbs-n02-sitter-work-areas` | Doan Tien Dat | `SEP490_G101_FALL2026-p18-wbs-n02` | `28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f` (`origin/develop`) |

The original checkout was already dirty on `feature/wbs-006-user-list`; it was preserved and not used for P18 changes. No WBS contributor is inferred from reviewer or merge assignments.

## Delivered

- **WBS-022:** `SitterAvailabilityPage` shows a bounded 31-local-day availability preview and edits at most 14 recurring local-time windows plus an effective date. The backend service validates Asia/Saigon local dates/times, rejects overlaps including overnight and week-boundary cases, limits calendar reads to 31 dates, uses `expectedVersion` and idempotency, and requires an injected P01 eligibility guard plus bounded confirmed-visit conflict lookup. Conflict responses disclose only a count and keep the saved schedule and assignments unchanged. Idempotent replay is resolved before rechecking the current-date cutoff. Owner projection uses P01 names (`workingWindows`, `dayOffDates`, `areas`, `expectedVersion`) and omits customer and sitter identifiers.
- **WBS-023:** `DayOffRequestPanel` submits inclusive Vietnam calendar-date ranges with the current `expectedVersion` and a stable idempotency key. Requests remain `PENDING`; they do not change Availability or confirmed visits. The service serializes owner-scoped submissions through an injected transaction port, rejects stale versions, overlapping active requests, and dates already approved in Availability, limits confirmed-visit conflict reads to 101 results, and returns only a bounded count to the Sitter. Idempotent replay is resolved before rechecking the current-date cutoff.
- **WBS-N02:** `SitterWorkAreasPanel` selects up to 20 allowlisted city/district codes; it never accepts an address or coordinates. The service emits the P01 `expectedVersion` and `areas` shape, validates the catalog and selected codes, and forwards the operation key and session identity to the atomic persistence port. The port contract requires P01 EligibilityGuard, actor/owner revalidation, idempotency, a compare-and-set, and a typed Staff-review conflict without deleting assignments.
- All three UI modules use P04 controls, labels, fieldsets or native form controls, responsive styles, and explicit loading/empty/error/forbidden/pending states where applicable. They accept injected API ports and do not register routes. See the [P01 API contract](../api/p01-api-permission-contract-v1.md), [P01 domain contract](../architecture/p01-domain-contract-v1.md), and [P04 handoff](../ui-ux/p04-handoff.md).

## Checks

All commands below were run in each feature worktree on 2026-10-14. Tests use repository fixtures and injected persistence ports. The Vite builds passed for the existing 34-module application entry; because P34 has not registered the P18 pages, those builds do not include the new panels. No live MongoDB, backend route, browser/device, end-to-end, or provider check is claimed.

## Integration gates

- P16 is a direct dependency but is not integrated in the `develop` base used here. No P16 eligibility provider is available; the P18 write ports require an adapter that rechecks active approved Sitter status and session `authEpoch` inside the serialized transaction.
- P01 owns the Availability schema/DTO and P34 owns route registration and runtime/API wiring. The canonical Availability field names are used, but the shared P01 runtime implementation and P34 routes are absent from this base. `effectiveFrom`, the DayOffRequest resource/history projection and approval lifecycle need P01/P34 contract integration before claiming a live flow. P01 currently lists `GET/PATCH /me/availability` and `POST /me/day-off-requests`; it does not specify a day-off request history route.
- The injected work-area persistence port and the Staff review workflow for confirmed-visit conflicts have no concrete runtime adapter here. The UI reports the conflict without implying that an assignment was changed.
- No matching P18 Figma frame was available in the P04 inputs. Styling is provisional and follows existing P04 tokens; no pixel match is claimed.
- P18 date-only values use `Asia/Ho_Chi_Minh`; `Asia/Saigon` is accepted as an input alias. Weekly windows are stored as local wall times. A concrete scheduling adapter must convert each service-date occurrence to UTC and participate in the same P01 eligibility guard as assignment mutations.

**State:** module code and local checks are verified only after the final table below is filled. Route, persistence, P01/P16/P34, Figma, and real-flow checks remain `INTEGRATION_PENDING`. PR/review/merge state must be updated from GitHub evidence; a local test result does not establish those milestones.

## Final local checks

| Work item | Frontend tests / lint / build | Backend tests / lint |
| --- | --- | --- |
| WBS-022 | `npm test`: 10 suites / 112 tests PASS; `npm run lint` PASS; `npm run build` PASS (existing 34-module entry) | `npm test`: 15 suites / 158 tests PASS; `npm run lint` PASS |
| WBS-023 | `npm test`: 10 suites / 114 tests PASS; `npm run lint` PASS; `npm run build` PASS (existing 34-module entry) | `npm test`: 15 suites / 163 tests PASS; `npm run lint` PASS |
| WBS-N02 | `npm test`: 10 suites / 119 tests PASS; `npm run lint` PASS; `npm run build` PASS (existing 34-module entry) | `npm test`: 15 suites / 165 tests PASS; `npm run lint` PASS |

Git provenance and PR links are added after the assigned contributor accounts publish these branches. Review and merge state must be read from the current PR, not inferred from local checks.
