# Service workflow: audit and additive storage plan

Baseline: develop `692c2521e0e693451c4b0180f274b98ee068efe4`, main/live `8c53c0c2a4f896f287ddac50d943760a430371b2`. Read-only EC2 inspection on 18 November 2026: readiness 200, green 3001, 85 collections, 15 services, 5 visits, zero workflow snapshots. Existing indexes inspected on services, serviceversions, visits, privateimages, caremediabindings and scheduling command/event stores. No production mutation. Implementation was subsequently integrated with reviewed develop `d76e5e548c3c6094c4e5f22081c4cc02dab57b39` (booking changes); rescheduling preserves workflow snapshots/results and serializes on the same Visit version.

| Capability         | Baseline source                                                         | Gap / integration                                                                     |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Admin catalog      | frontend/src/pages/admin/ServiceWorkspacePage.jsx:124                   | Extend contextual service dialog with builder                                         |
| Checkout snapshots | backend/src/services/booking-proposals/booking-checkout.service.js:168  | Two generic tasks; capture published workflow at checkout                             |
| Boarding           | backend/src/services/booking-proposals/boarding-care-plan.service.js:23 | Each <=8-hour shift keeps workflow snapshot, separate task state                      |
| Check-in/check-out | backend/src/services/settlements/booking-finance-source.service.js:136  | Keep existing state/time/payment/handover/financial commands; add workflow gates      |
| Media              | backend/src/services/private-image.service.js:49                        | Reuse decoded private JPG/PNG upload, READY state and digest, stable retry            |
| Ownership          | backend/src/services/care/visit-evidence-access.service.js:5            | Extend only bound workflow evidence with customer visibility and assigned/staff scope |
| Report             | backend/src/services/booking-proposals/booking-details.service.js:76    | Add role-filtered workflow progress, never internal notes for customer                |
| Exceptions         | backend/src/services/employee-scheduling/visit-closure.service.js:121   | Keep staff-close and actual evidence verification separate from checklist completion  |

## Ownership and footprint

Service owns one bounded draft, revision and current published snapshot. New `serviceworkflowversions` stores immutable publish/retire records; history is 1:many, independently paginated, so embedding an ever-growing version array is rejected. Existing serviceversions are catalog/pricing-facing immutable contracts with different uniqueness/effective dates; changing them would couple care publication to catalog pricing. No separate template, task, execution, evidence, command or audit collection. Visit embeds the immutable workflow snapshot and bounded task results. Existing privateimages hold storage metadata; caremediabindings reuse their primary-media uniqueness and unique visit/kind index with namespaced workflow kinds. Existing employeeschedulecommands/events support durable actor/resource-scoped replay and operational care audit. No TTL/uniqueness/legacy collection rename or index removal.

## Bounds, queries and compatibility

At most 24 steps, 4 slots/step, 3 photos/slot, 10 pets and 240 expanded tasks/evidence per Visit; 64 KiB definition. History uses serviceId equality then revision descending, limit 21, exclusive revision cursor. New unique `{serviceId:1, revision:-1}` supports history and publication uniqueness. Other reads use existing primary IDs and bounded `$in` queries. Every write uses transaction, actor authorization, expectedVersion and stable idempotency key; Visit version also serializes reassignment/cancellation. Template commands never import financial services or change financial fields. Checklist progress alone cannot finalize a Visit or produce payroll.

No snapshot means explicit LEGACY; retain old check-in/checklist/check-out behavior, never load today's template. New visits without a published definition are also explicit LEGACY until an Admin publishes. Draft examples do not silently enable services. Boarding template applies per care shift, not whole-stay treatment/checkout. Applicability permits only enumerated species/location membership, no executable expressions. Safety-critical steps and phase photos cannot be skipped. Server receive timestamps are not verified capture/GPS/EXIF claims.

## Staged rollout / recovery

1. Inspect native metadata and backup production; restore backup into isolated database and verify hashes/counts before any approved live operation.
2. Run operator provisioning in dry-run; inspect existing collection options/indexes, fail on incompatible state. New storage only, no data rewrite. Apply only after operational approval. No startup migration/backfill.
3. Ship additive code with empty workflow fields; legacy behavior remains. Create only editable development DRAFT examples for the exact 13 catalog codes. Review actual business steps before publishing. Publish is an explicit authorized Admin action.
4. Rehearse V1/V2 snapshot immutability, multi-pet slot isolation, same-key retry/concurrent CAS, private ownership, blocked tasks, staff-close and booking/financial regressions on synthetic isolated Mongo replica set and HTTP.
5. Before release inspect final SHA/CI/review, R2 quota and real media acceptance. Deploy only reviewed main using existing backup/restore and blue-green procedure; this task's prompt does not authorize production deployment or migration.
6. Roll back via previous reviewed release before first publish. After publishing/snapshot creation, stop new publication and retain additive storage; do not run older code that ignores workflow checkout gates for new snapshots. Prefer forward fix or reviewed compatibility release. Never delete execution/history, restore over live data, or invent completed evidence. Physical cleanup requires separate approval.

Open operational decisions: production retention/deletion of bound evidence and template business approval. Preserve existing retention; no new automatic deletion. Upload failures retain existing PENDING/quota and same upload key. Unbound READY objects remain quota-accounted; no destructive orphan cleaner is introduced without retention approval.

## Incident integration extension

The existing IncidentService/router/pages had no runtime Case repository. The additive adapter uses existing `cases`, employee command/event records and private bound evidence; no new Incident collection. Cases retain existing ObjectId identity, bookingId lookup index and integer CAS version. References exposed by the old service remain strings. Reports/decisions serialize on Visit version, booking finance guard and existing employee hold guards, so concurrent checkout cannot ignore an opened incident. Existing financial hold selectors are preserved. Reports do not charge, refund or transfer money. Resolution leaves the financial hold pending; only an explicit Admin CLOSED decision with NO_FINANCIAL_ACTION and a reason can remove that incident's hold. Other financial decisions return FINANCIAL_REVIEW_REQUIRED and remain held for the existing reconciliation path. Normal workflow/template saves never call this adapter.

Visit-specific incident reads use existing bookingId index; global pagination uses `_id` with a 3-second deadline and joins authoritative Visit/Booking scope before limiting. No unsupported index or latency claim. Case timeline is bounded to 100 entries; subsequent mutation refuses for operational review instead of truncating audit history. Extra incident/media reads and financial hold regressions must pass before release.
