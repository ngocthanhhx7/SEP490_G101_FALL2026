# Sitter pages

This folder owns Sitter-facing availability settings and related page modules. `SitterAvailabilityPage` edits recurring local working-hour intervals and renders safe request states. Work-area and day-off modules are separate components so each P18 work item can be reviewed independently.

P18 components use the P04 controls and accept API ports as props. They do not register routes, decide permissions, own shared DTO/schema, or provide persistence. P34 owns route/API adapter wiring; P01 owns the Availability schema and DTO. Until those integrations are available, fixture-driven component tests do not establish a live Sitter flow.