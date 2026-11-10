# Staff Workspace

`ComplaintManagementPage` (WBS-050) lists role-scoped complaints and records
Staff review/resolution commands with expected versions. It never exposes
Customer-private media as a public URL and leaves final closure to the Admin
decision endpoint. P34 owns route registration and the live session/API wiring.

`SitterManagementPage.jsx` presents the UC-74 Staff directory and the existing
Admin operational list. Staff list metrics use a rolling 30-day window, with
the report period controlled separately. `SitterManagementDetailPage.jsx` presents application
summary, public profile, capabilities, current contract terms, registered schedule,
paged work history and Admin management history. Shared transport and DTO validation
live in `services/sitter-management-api.js`; pure labels live in
`utils/sitter-management-format.js`.

Admin-only application documents and personal information remain in the existing
application review page. Status commands reuse its versioned audited backend API.
`EmployeeDispatchPage.jsx` can receive a selected sitter from the route composition;
invitation creation still rechecks authoritative eligibility, payment and the
Customer's directed choice. No page assigns work by itself.

`DispatchRecoveryPanel` owns alternative-time candidate previews and customer
proposal presentation after escalation. `DispatchDiagnostics` shows aggregate
eligibility failures. Transport remains in `services/employee-scheduling-api.js`;
labels are pure helpers in `utils/dispatch-format.js`. Unknown proposal responses
freeze inputs and reuse the original payload/key. No expired shift is retried.

Dispatch now separates a bounded intervention table, the Vietnam-day visit table and paged travel monitoring. Detail dialogs preserve eligibility and customer-consent recovery. Public profile moderation uses server state filters/cursors, current-profile counts and a focused review dialog; it never exposes applicant documents. Unknown decisions retain the original payload/key and freeze edits.

`DispatchSitterPicker` checks current-time manual candidates, explains blocked profiles and sends an invitation for the selected employee. `SitterCapabilityForm` records verified skills from the capability tab with a reason and stable operation key. Neither component creates assignments or outcomes.

Dispatch details use an opt-in wide two-column layout, compact native-radio candidate rows and a collapsible blocked group. No eligibility or invitation contract changes are made by presentation.
