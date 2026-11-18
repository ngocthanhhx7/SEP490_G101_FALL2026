# Incident pages (P29)

`IncidentReportPage` records an incident for a visit and makes the urgency, observations, private evidence references, and server acknowledgement explicit. `IncidentListPage` and `IncidentDetailsPage` consume role-scoped Case projections; Staff/Admin can record resolution while involved Customer/Sitter views never receive private Staff notes or financial decision data.

The pages use injected adapters and are ready for P34 route registration. They are `PROVISIONAL` and `INTEGRATION_PENDING` until the real session, Case/Visit repository, private-media capability, notifications, and approved Figma frame are wired.

The finance-source runtime now wires the existing incident business service/router to the native cases adapter; AppRoutes registers role-guarded report/list/detail pages with session CSRF transport. Report/resolve preserve exact retry keys/payloads; Staff resolution and explicit Admin no-impact closure do not execute financial transfers. See [workflow integration](../../../../doc/api/service-workflows.md). Earlier INTEGRATION_PENDING statements above describe the pre-adapter baseline, not proof of production acceptance.
