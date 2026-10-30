# Staff Workspace

`ComplaintManagementPage` (WBS-050) lists role-scoped complaints and records
Staff review/resolution commands with expected versions. It never exposes
Customer-private media as a public URL and leaves final closure to the Admin
decision endpoint. P34 owns route registration and the live session/API wiring.

`SitterManagementPage.jsx` presents the operational table and source-labelled
reports for Staff/Admin. `SitterManagementDetailPage.jsx` presents application
summary, public profile, capabilities, current contract terms, registered schedule,
paged work history and Admin management history. Shared transport and DTO validation
live in `services/sitter-management-api.js`; pure labels live in
`utils/sitter-management-format.js`.

Admin-only application documents and personal information remain in the existing
application review page. Status commands reuse its versioned audited backend API.
`EmployeeDispatchPage.jsx` can receive a selected sitter from the route composition;
invitation creation still rechecks authoritative eligibility, payment and the
Customer's directed choice. No page assigns work by itself.
