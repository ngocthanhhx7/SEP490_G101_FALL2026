# Incident pages (P29)

`IncidentReportPage` records an incident for a visit and makes the urgency, observations, private evidence references, and server acknowledgement explicit. `IncidentListPage` and `IncidentDetailsPage` consume role-scoped Case projections; Staff/Admin can record resolution while involved Customer/Sitter views never receive private Staff notes or financial decision data.

The pages use injected adapters and are ready for P34 route registration. They are `PROVISIONAL` and `INTEGRATION_PENDING` until the real session, Case/Visit repository, private-media capability, notifications, and approved Figma frame are wired.
