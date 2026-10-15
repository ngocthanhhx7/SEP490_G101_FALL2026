# P29 incident services

This folder owns WBS-040/041/042 incident reporting, list projections, and operational resolution. The service is export-only until P34 supplies the Visit/Case repository, session wiring, private-media provider, and route registration.

`createIncidentService` requires a transactional repository port (`runForVisitActor`, `runForCase`, `runIncidentTransaction`, or `runTransaction`). The adapter must scope the visit/case to the authenticated actor, perform the version/idempotency checks atomically, persist audit/outbox records, and never mutate a visit to completed or closed as a side effect of reporting an incident.

Evidence references are private media IDs. The service does not expose public upload URLs or infer medical diagnoses. Emergency or critical reports carry a `PENDING_REVIEW` financial hold marker only; any amount, release, refund, or earning decision remains a P51/P32 Admin decision.

Integration status: `INTEGRATION_PENDING` until P01/P34 maps these ports to the canonical Case/Visit schema, private media capabilities, Staff operational scope, notification delivery, and real database transactions.
