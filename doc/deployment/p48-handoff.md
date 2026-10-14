# P48 — Session handoff

14/10/2026, Asia/Saigon. WBS-N11: Role layouts and pinned avatar menu. Assigned contributor/feature owner: Phạm Thành Chung. Assigned reviewer: Đoàn Tiến Đạt. Final merger: Nguyễn Ngọc Thành. These assignments do not record a review, approval, or merge.

Branch: feature/wbs-n11-role-layouts-and-pinned-avatar-menu, based on the fetched develop head 28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f. Delivered commits are 066799f688021c7690200849c080f5d567f2d556, 5b1d383602efeede27816521be883d18d3216a0b, 391fe7cb1f037d11e831cf1582dd12f03c69542e, baa2e1f4dd60f6ba06107a6ab94dd83d0858e265, and 35828f853ed38f05965373a4facdda127f1ef424. The branch is pushed and PR #37 is open against develop: https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/37. Requested reviewer: Đoàn Tiến Đạt (doantd11). Status: PR_OPEN; review and leader merge are pending.

Git identity evidence: commit author and committer are Phạm Thành Chung <chungthanhpham2112@gmail.com>; push account and PR creator are Chunggrizzy11. Reviewer account is doantd11; merger account is ngocthanhhx7.

## Delivered

- Shared Customer, Pet Sitter, Staff, and Admin dashboard layouts with responsive header, mobile navigation drawer, sidebar, skip link, route focus, and explicit loading/pending/error/forbidden/empty states.
- Accessible avatar trigger with initials derived from the real session display name; no avatar image or identity is fabricated.
- Hover/focus opening, click pin/unpin, outside-pointer and Escape dismissal, route-change dismissal, and focus restoration on Escape.
- Role-specific account and notification labels. The account link uses the existing /account route. Notifications stay disabled until a real destination is supplied; password-change navigation was not added.
- Folder responsibilities and a separate synthetic manual preview are documented; the preview is not a production route.

## Decisions and integration gates

- The supplied visual references show the public marketing header/footer. No dashboard-specific Figma frame was provided, so the dashboard shell follows the current P04 brand logo, fonts, and provisional tokens; final visual acceptance remains open.
- P04 tokens and components are already present on the base branch. No shared P04 file was changed.
- P34 owns route registration. The new layouts accept real navigation destinations and show an empty state until the corresponding routes are supplied. No route file was changed.
- P08 session/logout integration is pending on the base branch. The layouts use the existing session context, and the logout control stays disabled until it supplies a real logout callback. No API or session contract was invented.
- Client role checks are a user-experience gate only; server authorization remains authoritative.

## Validation

| Check | Result |
| --- | --- |
| npm ci | Completed from the existing lockfile; 0 vulnerabilities reported |
| npm test -- --runInBand | PASS: 11 suites, 121 tests |
| npm run lint | PASS |
| npm run build | PASS: Vite production build |
| npm audit | PASS: 0 vulnerabilities |
| Browser viewport review | PASS: previously recorded Playwright 1.64.1 with Edge at CSS viewports 360x900 and 1280x900; header, avatar trigger, and open panel inspected. The later drawer change is covered by unit tests; a fresh browser screenshot of the drawer was not available in this environment |

The automated UI tests cover hover-to-panel movement, unpinned leave, pin/unpin, Escape/focus return, outside click, route navigation, touch click behavior, logout success/failure, role gating, pending and empty states, session-derived initials, and the mobile drawer toggle, inert closed state, backdrop dismissal, and focus return. The Playwright screenshots use the isolated preview query that opens the menu; screenshot files were kept outside the repository. Tests and preview use synthetic in-memory session DTOs and do not prove backend authentication, API authorization, provider integration, or a physical touch-device experience.
