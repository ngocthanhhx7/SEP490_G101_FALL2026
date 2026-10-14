# P13 — Public home and service catalog handoff

**Scope:** WBS-008 Home Page, WBS-009 Service List, WBS-010 Service Details, WBS-011 Service Areas and Policies; UC-06 through UC-09.

**Status:** IMPLEMENTED / INTEGRATION_PENDING. The public screens, adapters and browser routes are implemented against the published DTO contracts available to this session. Live catalog integration and physical browser/mobile visual validation have not been verified.

## Ownership and worktree

- Assigned code contributor/commit author: Phạm Thành Chung.
- Assigned integration test owner/reviewer: Đoàn Tiến Đạt.
- Final merge owner: Nguyễn Ngọc Thành.
- Branch: `feature/wbs-008-home-page`, targeting `develop` through [PR #42](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/42).
- The branch includes the `origin/develop` head `c8c8765` through sync commit `2e2e34b`.
- P13 implementation commit: `5f89353`; latest branch head at this handoff revision: `2e2e34b`.
- Commit author/committer and the contributor's GitHub push account were verified for Phạm Thành Chung / @Chunggrizzy11. The assigned reviewer is Đoàn Tiến Đạt / @doantd11; Nguyễn Ngọc Thành / @ngocthanhhx7 is the assigned merger.

## Screens and route proposal for P34

| Screen | Proposed route | Data |
| --- | --- | --- |
| Home | / | GET /api/v1/services |
| Service list | /services | GET /api/v1/services |
| Service details | /services/:serviceId | Find the current published service in GET /api/v1/services |
| Service areas and policies | /service-areas | GET /api/v1/service-areas and published policy values included in GET /api/v1/services |

P13 registers these routes under `PublicSiteLayout` in `frontend/src/routes/AppRoutes.jsx` and loads `public-pages.css` from the browser entry in `frontend/src/app/main.jsx`. The route tree also preserves the current `develop` account, Admin, registration, sitter application and policy routes; P34 owns that shared integration. Untracked pet image folders from the original local worktree have unverified source/license and are not used or included.

## Contract and integration limits

- P01 defines public GET /services, GET /service-areas and versioned policy reads in the API contract at ../api/p01-api-permission-contract-v1.md.
- P17's current public catalog implementation returns available and services; each published service includes its name, description, scope, species, exact VND amount, unitLabel and published policy version/text. The P17 branch is not merged into this worktree's develop base, so the adapter shape is not a live integration result.
- The service-area response payload is not yet defined in the shared API contract. The UI adapter currently expects { available, areas: [{ id, name, description? }] }; P18/P34 must confirm or adapt this DTO before the route is considered integrated.
- Public pages do not invent fallback services, prices, policy text, areas or customer reviews. A missing/invalid catalog price or DTO produces an error state.
- Policy summaries come from each service's published catalog policy. General policy history/version navigation remains with P45.
- No company support phone/email was present in the approved sources. The footer directs visitors to services/sign-in without publishing invented contact details.

## Design and assets

- Reference: user-provided screenshot for the Figma frame 280-7416, 1280px design viewport.
- Figma status: PROVISIONAL. The supplied screenshot was used as the visual reference; no Figma connector returned frame data or verified pixel matching.
- Responsive CSS includes the 360px layout, keyboard focus states, skip navigation and reduced-motion handling. Physical mobile, screen-reader and browser visual checks remain unrun.
- Uses the tracked cat photographs image 649.png, image 650.png, image 651.png, the approved horizontal logo, P04 font files and existing pets.svg. No new photos were added.
- Untracked frontend/public/assets/dog/ and frontend/public/assets/home/ folders in this worktree have unverified source/license and are not used or staged.

## Files

- frontend/src/layouts/PublicSiteLayout.jsx
- frontend/src/components/public/README.md
- frontend/src/components/public/PublicHeader.jsx
- frontend/src/components/public/PublicFooter.jsx
- frontend/src/pages/public/HomePage.jsx
- frontend/src/pages/public/ServiceListPage.jsx
- frontend/src/pages/public/ServiceDetailsPage.jsx
- frontend/src/pages/public/ServiceAreasPage.jsx
- frontend/src/pages/public/PublicCatalog.jsx
- frontend/src/pages/public/public-catalog-adapter.js
- frontend/src/pages/public/public-pages.css
- frontend/tests/integration/PublicHome.test.jsx
- frontend/tests/integration/PublicServicePages.test.jsx
- frontend/tests/unit/public-catalog-adapter.test.js

## Checks

- npm ci: passed (frontend, 2026-10-14; zero reported vulnerabilities).
- npm run lint: passed (frontend, 2026-10-14).
- npm test -- --runInBand: passed, 30 suites / 268 tests on the tree synced with `develop` at `c8c8765` (frontend, 2026-10-14).
- npm run build: passed (frontend, 2026-10-14).
- Referenced asset existence and `git diff --check`: passed (2026-10-14).
- Physical mobile, screen-reader and browser visual validation: pending.
- No live P17 catalog, P18 service-area API, policy version history, booking, provider, database, end-to-end or deployment integration was verified.
