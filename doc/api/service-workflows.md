# Service workflows and care execution

Workflow routes mount under `/api/v1` with the existing authenticated finance-source runtime (`FINANCE_SOURCES_ENABLED=true`). No extra provider or environment flag is introduced. Care phases are independent of Visit and payment states. The existing private JPG/PNG API remains the upload/read transport; the workflow API accepts only verified READY media references, never URLs, bytes, actor IDs or capture-time assertions.

## Admin in existing Services workspace

Open **Dịch vụ và giá → service row → Quy trình thực hiện**. Edit the bounded draft, move steps with keyboard-accessible Up/Down controls, configure named photo slots and per-pet/per-visit scope, preview, save, validate and explicitly publish. History can be copied into a new draft. Published definitions are immutable. Retirement only affects new bookings. Publication becomes effective immediately at its server transaction; future scheduling and arbitrary executable conditions are unsupported.

| Method/path                                        | Contract                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET `/services/admin/:id/workflow?before=revision` | Admin, current draft/published and 20 history rows; exclusive nextCursor                       |
| PUT `/services/admin/:id/workflow/draft`           | Admin + CSRF + Idempotency-Key; expectedVersion, definition                                    |
| POST `/services/admin/:id/workflow/validation`     | Admin + CSRF + key; expectedVersion; validates saved draft without publishing                  |
| POST `/services/admin/:id/workflow/publications`   | Admin + CSRF + key; expectedVersion; immutable publication                                     |
| POST `/services/admin/:id/workflow/retirements`    | Admin + CSRF + key; expectedVersion; retain history                                            |
| GET `/visits/:id/workflow`                         | Current assigned Sitter, owning Customer, Staff/Admin; role-filtered projection                |
| PATCH `/visits/:id/workflow/tasks`                 | Current active assigned Sitter + CSRF + key; task command below                                |
| POST `/visits/:id/workflow/reviews`                | Staff/Admin + CSRF + key; expectedVersion, taskKey, reason; return blocked task for retry only |

Template expectedVersion is the Service's workflow revision, independent of catalog price/service versions. Draft save, publish and retire each increment it. Visit expectedVersion is the existing Visit version, shared with assignment/cancellation/check-in/out and incident writers. Replays return the saved acknowledgement; changed payload under the same key is refused. Authorization is checked before replay. Unknown results keep the original key, payload and upload reference for explicit retry.

## Definition

`{title, steps}`; ordered array, <=24 steps, <=64 KiB serialized definition. Each step has stable `stepId`, title, instructions, phase (`CHECK_IN`, `EXECUTION`, `CHECK_OUT`), scope (`PER_VISIT`, `PER_PET`), inputType (`PHOTO`, `NOTE`, `CONFIRMATION`, `CHECKLIST`, `STRUCTURED`), required/canSkip/safetyCritical/customerVisible booleans, species/locations arrays, fields and photoSlots. Empty applicability means all supported values. Supported catalog locations include HOME, FACILITY and OUTDOOR; SHOP/TRANSPORT are available for explicitly configured contexts. Publish validates every currently supported species/location branch. Checkout rechecks coverage for its saved pet/location context.

Photo slots: stable photoSlotId, title, instructions, minPhotos (0..3), maxPhotos (1..3), minimum <= maximum; <=4 slots/step. Photo steps need a positive minimum. Safety-critical steps must be required. Phase tasks and required-photo tasks cannot be skipped. Structured fields (<=8) have stable fieldId, label, TEXT/NUMBER, required, numeric min/max; runtime text <=500 characters. Unknown keys are refused.

## Execution and existing Visit commands

Task command: `{expectedVersion, taskKey, status, note?, skipReason?, values?, photoSlotId?, mediaId?}`. taskKey is `stepId:petObjectId` or `stepId:visit`. States: IN_PROGRESS, COMPLETED, SKIPPED, BLOCKED, NEEDS_REVIEW; pending is represented by no result. Server determines actor/time/assignment. One photo reference can fill only one slot for one Visit/Pet/task. Persisted results survive refresh/reassignment; current replacement needs accepted handover and acknowledgement of the immutable owner care snapshot before writing. Earlier required tasks in the current phase must be finished first. Check-in tasks are writable only while ASSIGNED from 30 minutes before start through end. Later phases require IN_PROGRESS; check-out tasks require previous phases complete. Server time and existing two-hour checkout grace remain authoritative.

The existing `/visits/:id/check-ins` and `/check-outs` keep their original generic arrival/departure photo and state/payment/handover gates. They additionally validate saved workflow tasks/slot counts, READY metadata, immutable media binding/digest, and absence of open incidents. They return `409 WORKFLOW_INCOMPLETE` with `error.missingTasks: [{taskKey, stepId?, petId?, reasons}]`. UI offers a direct task selector and slot counts. `/checklists` refuses versioned Visits; legacy Visits retain the original checklist contract. Saving tasks cannot complete Visit/Booking or issue payroll credits; only the existing finalization command can do so under its unchanged financial rules.

Photos use private R2 adapter through the existing private-image service: actual decoding/MIME/pixel/byte limits, PENDING/READY, owner quota and stable upload-key retry. A photo is evidence only after READY and atomic binding. Camera input is a device hint, not verified camera/GPS/EXIF. Existing provider quota remains an operational capacity gate; do not increase it or delete historical evidence silently. Unbound/pending objects remain quota-accounted pending approved retention. No automatic production cleanup or capture authenticity claim.

## Incidents, monitoring and reports

The existing IncidentService and router now use an adapter over `cases` and existing command/audit/notification stores. Existing `/incidents`, `/visits/:visitId/incidents`, `/cases/:caseId` and resolution routes retain their DTOs. Sitter opens the incident page from the current care task; report/resolve UI retains exact keys across uncertain responses. Only bound evidence belonging to the Visit is accepted. Staff review uses OPEN → UNDER_REVIEW → RESOLVED; only Admin may CLOSED with explicit NO_FINANCIAL_ACTION and a reason. A financial-impact incident stays held for the existing reconciliation process; this adapter does not calculate or execute money transfers/refunds. Internal Staff notes remain hidden from Customer/Sitter.

Blocked tasks and open incidents enter the existing Visit Board **Cần xử lý** through WORKFLOW_BLOCKED. Staff can inspect tasks/photos, follow incident links and give a reason to allow a blocked task retry after resolving open incidents. That action never creates completion or evidence. All Visits can open the care projection. Existing staff-close/reconciliation remains separate; never synthesize check-out or task photos to close an overdue Visit.

Existing booking details/report include role-filtered tasks, progress, values, notes and private photo previews. Customer sees only customerVisible tasks. Existing uploads do not become visible just because their media ID is known; binding, Visit evidence and ownership must agree. Staff has no general private-image bypass; extended access is only for bound workflow evidence. Reassignment does not remove prior uploader/audit records.

## Legacy and rollout

Missing snapshot is explicit LEGACY and never loads today's workflow. Boarding captures the definition per <=8-hour care shift, with independent task results; it does not treat a daily care shift as whole-stay checkout. `node scripts/seeds/service-workflows.js` previews the exact 13 demo service proposals. `--apply` requires an existing explicitly selected Admin, a non-production `_dev` database and provisioned history; it creates DRAFT only and skips existing definitions. No sample publication or production data is automatic.

Read the [storage/rollout plan](../database/service-workflow-plan.md) before provisioning. `scripts/migrations/service-workflow-storage.js` defaults to metadata-only dry-run and can apply only to a development database. Production migration/release requires separate operational approval, reviewed main, backup/isolated restore and provider acceptance. Rollback after first published Visit must preserve workflow enforcement; do not activate an old runtime that ignores it.
