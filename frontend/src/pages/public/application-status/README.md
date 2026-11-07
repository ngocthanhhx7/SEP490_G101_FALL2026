# Application status page

This folder owns the public applicant status view and responsive styles. AppRoutes registers `/sitter/application-status` with the guest POST adapter in `services/application-status-api.js`. The page also accepts an injected API for tests, keeps credentials only in component memory and renders only the narrow verified status projection. The application submission receipt links here without putting its code in the URL.

The screen uses P04 controls and provisional tokens. No final Figma acceptance is claimed. Runtime security and deployment requirements are recorded in `doc/deployment/p46-handoff.md`.

Verified rejected results link back to /register?role=sitter only when canReapply
is true. The registration intake and submission recheck eligibility independently.

ApplicantWorkspacePage now owns the default route. It resolves the session first, then loads /applications/me without receipt/OTP, with PENDING-only optimistic edits and retained private document IDs. Guest legacy verification remains collapsed. Login checks owned application for the customer landing; normal account routes remain available. No private data is stored in browser storage.
