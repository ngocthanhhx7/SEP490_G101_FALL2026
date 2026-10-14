# Application status page

This folder owns the public applicant status view and responsive styles. AppRoutes registers `/sitter/application-status` with the guest POST adapter in `services/application-status-api.js`. The page also accepts an injected API for tests, keeps credentials only in component memory and renders only the narrow verified status projection. The application submission receipt links here without putting its code in the URL.

The screen uses P04 controls and provisional tokens. No final Figma acceptance is claimed. Runtime security and deployment requirements are recorded in `doc/deployment/p46-handoff.md`.
