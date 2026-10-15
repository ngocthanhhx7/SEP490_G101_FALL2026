# Public header, footer and Home alignment

Owner: Phạm Thành Chung (follow-up WBS-008). Reviewer: Đoàn Tiến Đạt. Merger: Nguyễn Ngọc Thành. Feature branch: feature/wbs-008-figma-public-alignment; target develop.

Figma source: https://www.figma.com/design/MJ2YjJIKiQK9oEX7ulKFjC/SEP490_G101_FALL2026 — header 278:33, footer 277:7308, Home 280:7416. User explicitly replaces the guest avatar with sign-in/register buttons. Dedicated header labels supersede the old shopping navigation embedded in Home. No shopping/cart feature is added.

Implemented real interactions: guest auth links, signed-in P48 hover/pinned menu/logout, responsive navigation, catalog search via URL, Home section anchors, current public policy links and newsletter request receipt. Actual service data/prices continue to come from published catalog; illustrations are not unlisted bookable services. The supplied community copy is marked illustrative. Social marks have no invented external profiles; official URLs remain to be supplied.

Newsletter POST /api/v1/newsletter/subscriptions accepts email only, enforces same-origin/rate limiting (five/IP/hour), and stores an encrypted canonical contact with keyed lookup, unique deduplication and REQUESTED state. It neither creates a user nor verifies mailbox ownership nor sends marketing email. AUTH_ENABLED and contact crypto keys are required; otherwise it fails closed with 503. Before deployment run `node --env-file=.env scripts/migrations/newsletter-indexes.js` from backend to provision the unique index. Tests use an isolated MongoDB replica set, never live customer data or delivery.

Vite proxies /api to http://127.0.0.1:3000 by default; PUBLIC_DEV_API_TARGET can override this server-side development target. Production must keep the existing same-origin API routing. Backend Jest patterns now avoid Windows hidden-worktree path expansion issues so tests are discovered under .codex worktrees.

Visual checks: local Figma photos/icons, font families, card/section layout, 320/390/1280px viewports, no horizontal overflow, 30 visible image callsites loaded without missing files at the checked page state. Nine photos use lossless WebP with decoded pixel equality; source screenshots stay local. All supported runtime assets are local with font OFL notices.

Validation: frontend 63 suites / 407 tests; backend 59 suites / 538 tests; both ESLint checks and frontend production build passed. Public shell/Home/catalog focused rerun: 12 tests passed after final hash-navigation hardening. Visual search submission preserved the query in /services?q=; mobile 390px overflow check was false. No live email/SMS delivery was triggered.
