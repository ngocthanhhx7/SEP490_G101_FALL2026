# Admin pages

`UserRolesDialog` adds versioned, reasoned role decisions from the User row menu
and detail panel. It confirms before submission, reconciles uncertain responses
through reload and refreshes list/detail after acknowledgement. Admins cannot
change their own roles. Pet Sitter access stays in application/status review.

`ServiceWorkspacePage` is the composed `/admin/services` route: searchable,
filtered, sorted and paginated catalog table with current effective prices.
Service edits/archive, price history, combo revisions and policy publication
open contextual dialogs. `/admin/service-prices` redirects here. Legacy editors
remain compatibility components. Catalog pagination currently runs over the
existing admin catalog response; User pagination remains server cursor based.
`AdminUsersPage embedded` omits its standalone chrome inside the shared shell.

P10 owns the account directory and its account detail panel in this folder. The user list uses server filters, signed cursor pagination and masked verified contacts; lock decisions require an explicit reason and display success only after the API acknowledges the new state.

The page requires an authenticated `ADMIN` session and the `/api/v1/users` API. Its header avatar opens on hover, keyboard focus or activation and links to the signed-in user's `/account` page and logout action. `SessionProvider` delegates logout and CSRF access to the injected session adapter. OTP login and adapter provisioning remain P06 integration work.

P17 contributes three Admin pages in separate WBS branches: the service catalog editor (WBS-019), service price history (WBS-020), and system settings (WBS-021). Each page adds effective-dated records with actor audit; write success appears only after the API acknowledges the request. Staff can read published policy, price, and configuration information; Admin can change these versions.

The integrated service workspace uses the P17 catalog/price APIs and is registered
in AppRoutes. Legacy standalone editors remain for compatibility. Shared P04
controls/tokens and the public brand establish its visual conventions; the
workspace plan records the current design references and acceptance criteria.

P22 owns `StaffVisitBoardPage.jsx` and `staff-visit-board.css`: a Staff/Admin operational board with Vietnam calendar filters, bounded cursor pages, a visit detail panel, no-sitter slot proposals and guarded manual assignment commands. It uses the shared P04 controls and the session/API client; Customer/Sitter do not fetch this board. Pending Customer choice and unknown network outcomes remain pending. P34 owns registration in the P48 shell and the real repository wiring. The page is PROVISIONAL without a supplied P22 Figma frame. See [P22 integration handoff](../../../../doc/deployment/p22-visit-board-handoff.md).

`ApplicationDocumentDialog` previews authenticated document blobs in the Admin
workspace, cancels stale reads and revokes object URLs. Provider errors render a
notice/retry rather than an external XML response. Application review actions
follow PENDING -> UNDER_REVIEW -> INTERVIEW -> APPROVED/REJECTED; final decisions
are available only in INTERVIEW and rechecked by the backend. The progress strip
uses recorded audit timestamps, never inferred completion of missing stages.
Email queue state is visible separately from the application state.
