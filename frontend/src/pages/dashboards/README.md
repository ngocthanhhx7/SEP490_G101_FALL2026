# P28 pages

`OperationalDashboard` now composes Admin/Staff/Sitter overview analytics, queue
metrics and bounded visit pages with date filters. Customer retains a public
site/account composition without operational charts. Both representations use
the existing authoritative projection adapters and session ownership boundaries.

ProjectionPage renders bounded, private, read-only DTOs with P04 tokens and controls.
Role-specific entry pages use session authorization and reset reads on account changes.
`useApiResource` cancels obsolete reads and handles loading/pending/forbidden/error.
Success with no rows renders empty while preserving real count metrics. Page cursors
are sent back unchanged. Errors clear private rows; no browser persistence or fixtures
are imported into application code. API adapters use same-origin `/api/v1` cookies.

P34 must mount entry pages inside P48 RoleDashboardLayout (header, sidebar/drawer,
avatar). Route registration and navigation are intentionally a separate integration
change. Suggested paths: `/customer/dashboard`, `/sitter/dashboard`, `/staff/dashboard`,
`/admin/dashboard`, `/sitter/earnings`, `/sitter/profile`, `/customer/sitters`, `/admin/payroll`.
The sitter list does not claim availability or auto-create a booking. Payroll is Admin
only and all financial commands remain in P41. Visuals are PROVISIONAL without Figma.
