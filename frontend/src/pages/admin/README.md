# Admin pages

Service price history uses bounded cursor pages with first/previous/next/reload.
Service changes and acknowledged saves reset to the first page; stale history
cannot supply a write version. A version conflict refreshes without retrying POST.

Approved employee payroll offers `VOID_UNPAID` only after an explicit no-payment
attestation and reason. This preserves the old breakdown, releases source claims
server-side and lets Admin prepare salary again while disputed booking commission
remains held. Paid statements use the existing separate reconciliation workflow.

Product Management includes a separate `ProductImageManager` after saving the
product. Save pending text changes before gallery edits. Upload, replacement and
confirmed removal return the updated product version; unknown acknowledgements
require reload. Image bytes live in MongoDB and hidden photos use the Admin reader.

`UserRolesDialog` adds versioned, reasoned role decisions from the User row menu
and detail panel. It confirms before submission, reconciles uncertain responses
through reload and refreshes list/detail after acknowledgement. Admins cannot
change their own roles. Pet Sitter access stays in application/status review.
The dialog now selects one radio role, replacing membership rather than adding
checkbox roles. Pet Sitter accounts show a read-only role and link to application
management. Mixed/invalid legacy data requires reload; it never selects a role
by privilege priority. User rows and account details show a single role label.

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

`ProductOrderManagementPage` is the `/admin/product-orders` screen for Admin and Sale Staff to process shop orders:
tabs with counts (to prepare, awaiting pickup, in transit, returning, all), search by
order code, customer name or the customer's whole phone number (the phone is also shown in the order detail), and the next step for the selected order (tracking code and
hand to carrier, mark ready, record payment, hand to customer, mark delivered, mark being returned with the carrier's reason, confirm a returned order with the reason and the resellable quantity of each line). The phone shows as `0912 345 678`. The backend decides what
is allowed and moves the stock; the page shows its answer and reloads after a conflict.

`ProductManagementPage` at `/admin/products` uses a full-width paged table, explicit edit/delete actions, MongoDB overview counts and a modal editor including persisted image upload/replacement/removal. New products start hidden. Deletion requires a complete reason, current version, no stock/holds and no historical orders; blocked deletion offers hiding instead. The backend retains deletion audit and code. Unknown write replies require reload. See [product management verification](../../../../doc/testing/product-management-lifecycle-2026-11-05.md).

`SupplierManagementPage` is the `/admin/suppliers` screen (menu group "Cửa hàng"): tabs Đang hợp tác / Ngừng hợp tác / Tất cả with their counts, a paged table (name and contact person, phone, number of products, status) and a side form to add or edit one. The form checks MSG01, MSG02, MSG03 and MSG125 before it sends; the backend checks again and decides MSG116. Ngừng hợp tác asks MSG118 first, Hợp tác lại does not; both are locked while the form has changes that are not saved. The products it supplies are chosen from the catalog with `components/product/ProductPicker.jsx`, hidden products included; the list is a record and does not limit goods receipts.

`AiModelsPage.jsx` at `/admin/ai-models` reads the current AI source, model history
and unqualified source counts. It imports trainer DRAFT/evidence pairs and submits
versioned model review decisions through `services/ai-model-api.js`. It never
trains, fabricates ratings or claims aggregate counts satisfy verified data gates.
Unknown write acknowledgements lock edited inputs and retain the same body/key.

SitterApplicationReviewPage embeds contract preparation/printing/signature
verification before final approval. EmployeePayrollAdminPage defaults to a named
employee/source-derived draft; legacy explicit assessment stays in advanced
reconciliation. Contract and statement printing use a selected body-level portal.

Payroll and settlement workspaces use full-width tables, server-derived reports and focused detail dialogs. Payroll retains automatic source-based preparation and selected payslip printing; legacy/advanced forms are collapsed. Settlement filtering is explicitly limited to the current cursor page. Reports are operational counts and persisted VND totals, never bank balances or proof of transfer. Policy/source gates remain authoritative; unknown commands freeze the modal and retry the original payload/key.

AI Models includes a separate bounded source-readiness audit. It does not train from public research/demo data or automatically promote a model.
