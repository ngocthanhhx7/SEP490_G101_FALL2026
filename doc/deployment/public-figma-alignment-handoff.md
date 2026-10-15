# Public site alignment and care-project content

Owner: Phạm Thành Chung (follow-up WBS-008). Reviewer: Đoàn Tiến Đạt. Merger: Nguyễn Ngọc Thành. Branch: feature/wbs-008-figma-public-alignment; target develop.

## Design and content

Source: https://www.figma.com/design/MJ2YjJIKiQK9oEX7ulKFjC/SEP490_G101_FALL2026 — header 278:33, footer 277:7308, Home 280:7416, About 2:2724. Contact uses the supplied help-page and two-column form screenshots as composition references. Other brands' contact information is not copied.

The five header labels supersede embedded legacy shopping navigation. Guests see sign-in/register buttons; authenticated visitors use the existing P48 account menu/logout. Search opens the published service catalog. About and Contact are public /about and /contact routes linked from the shell. Home's About action opens /about. The fourth footer column links to /policies, /policies/terms and /policies/privacy; newsletter signup and its API have been removed at the user's request.

About preserves the cat collage, green values band, lilac goals band, five paw illustrations and two-column care section. Copy describes at-home dog/cat care, not food/Meal Kit retail, nutrition advice, donations or unverified partnerships. The current five members are labelled as the project team rather than company founders. Home community illustrations remain explicitly illustrative and concern care rather than food sales. Published catalog data/prices remain authoritative; static illustrations do not create bookable offers. Social marks await official URLs.

Contact includes Vietnamese search/category filters, expandable support answers, relevant policy/service links and an email form. It collects name, reply email, optional phone, topic, message and explicit consent to use these details to respond. It does not create or cancel bookings or submit refunds.

## Contact email configuration

Set CONTACT_INBOX_EMAIL in the backend's local/deployment environment to the confirmed project mailbox. Configure the existing EMAIL_ENABLED=true, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM and timeout/retry settings. No actual mailbox or secret is checked into Git. Reference screenshots do not establish a Paw World project inbox, so none is guessed.

POST /api/v1/contact/messages validates the six fields, consent, lengths and allowed topics; rejects extra recipient/header fields; checks origin; limits to three attempts/IP/hour. It sends a SYSTEM command through the existing escaped SMTP template to the server-configured recipient only. No automatic reply, attachment, MongoDB record or browser storage is created. Existing SMTP TLS, bounded retry and safe logging rules apply. Missing inbox/provider returns 503. A 202 means SMTP acceptance, not guaranteed mailbox delivery; ambiguous outcomes tell the visitor to check before resending and input remains on failure. No live email or SMS was sent during validation.

Vite proxies /api to http://127.0.0.1:3000 by default; PUBLIC_DEV_API_TARGET may override this server-side development target. Production requires same-origin API routing. Backend Jest patterns avoid Windows hidden-worktree path expansion issues.

## Assets and validation

Exported Figma photos/icons and licensed fonts are local. Nine Home photos use lossless WebP with decoded RGBA equality. About adds two small original PNGs and five SVG paws preserving source dimensions. Source screenshots and local configuration remain ignored.

Initial Home/shell validation: frontend 407 tests, backend 538 tests; both lints, frontend build and whitespace checks passed. Final expanded checks and desktop/mobile browser verification are recorded in the PR review. No live customer data or delivery is used by tests.

Final expanded validation: frontend 64 suites / 412 tests and backend 59 suites / 547 tests passed; both lint checks and frontend production build passed. Contact adapter checks use a synthetic provider only. Desktop/mobile layout and FAQ search were inspected in the browser.
