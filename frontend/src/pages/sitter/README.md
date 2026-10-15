# Sitter pages

This folder owns Sitter-facing availability settings and related page modules. `SitterAvailabilityPage` edits recurring local working-hour intervals and renders safe request states. Work-area and day-off modules are separate components so each P18 work item can be reviewed independently.

P18 components use the P04 controls and accept API ports as props. They do not register routes, decide permissions, own shared DTO/schema, or provide persistence. P34 owns route/API adapter wiring; P01 owns the Availability schema and DTO. Until those integrations are available, fixture-driven component tests do not establish a live Sitter flow.

- P24 adds `SitterAssignmentsPage.jsx` and `SitterVisitDetailsPage.jsx` with bounded offer/visit projections, deadline decisions, private-note window messaging, and operational withdrawal feedback. Their API adapter is `src/services/sitter-operations-api.js`.
- The pages intentionally accept an injected adapter and do not register routes here. P34 must connect the adapter to the authenticated runtime and add `/sitter/assignments` and `/sitter/visits/:visitId` routes.
- Offer and visit detail projections do not include addresses, contact data, payment data, or private access notes. Access notes are fetched only through the explicit window-authorized endpoint. `INTEGRATION_PENDING`: route registration, Mongo repository, scheduler/provider wiring and handover command remain external dependencies.
