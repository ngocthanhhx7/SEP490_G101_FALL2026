# P03 — Frontend foundation handoff

Date: 14/10/2026, Asia/Saigon. WBS-N16, cross-cut foundation (no new UC). Assigned contributor/author/committer and Git owner: Đoàn Tiến Đạt (doantd11), agent-assisted. Assigned reviewer: Phạm Thành Chung (Chunggrizzy11); final merger: Nguyễn Ngọc Thành (ngocthanhhx7). Assignment is not itself approval.

Branch: feature/wbs-n16-frontend-foundation. Checkout: SEP490_G101_FALL2026-p03. Base: ec991b0, develop after P01 PR #7 merged. Original checkout and its uncommitted README remain unchanged. Publication/review/merge SHAs are recorded by the GitHub PR; this document describes the implementation evidence, not an approval or merge claim.

## Contracts and decisions

Inputs: P03 brief, master/role/execution/source/scope/revised plan, requirements delta and brand instructions; [P01 runtime ADR](../architecture/p01-runtime-adr-v1.md), [P01 API/permission v1](../api/p01-api-permission-contract-v1.md). Local prompt library stays ignored; no Drive reports copied. No new provider/Figma research or change to P01 schemas/financial decisions.

Runtime and test versions are pinned in [frontend manifest](../../frontend/package.json) and lockfile. Node24.21.0/npm11.19.0 match ADR. React19.3.0/Vite8.3.4/plugin6.1.2 with ESM/JSX. Jest/jsdom/babel-jest30.5.2, Babel7.29.7, RTL16.3.3/jest-dom7.0.1, ESLint10.12.0, react-router-dom7.18.4 are foundation choices. Scoped js-yaml4.3.2 override removes vulnerable sprintf-js transitives from test tooling; YAML config loading tested against the actual consumer. Native optional install-script warnings did not prevent install/tests/build; no permissions or allowScripts settings changed.

## Delivered and ownership

Entry/root/error recovery; basic public layout/skip link/focus; routes /, /sign-in, /account and not-found; fail-closed session/role UX gate; injectable session port; cancellable resource hook; same-origin cookie/CSRF API client with v1 envelopes, status/error handling, 202 pending, timeout/abort and explicit idempotency/version inputs. See [frontend README](../../frontend/README.md) for exports/commands/adapter expectations.

Foundation creates manifest/root registration once, consistent with execution-map P03/P34 ownership. P34 owns subsequent registration/provider/manifest integration. Structural CSS is scoped in src/app/foundation.css and marked PROVISIONAL; P04 supplies shared tokens/components/global styling, P48 final header/sidebar/avatar. Public asset files are unchanged. No commerce/password UI, synthetic production data, fake auth/payment or secret/environment values.

## Actual checks

| Check | Result |
| --- | --- |
| npm ci on Windows | PASS after stopping dev server; first attempt EPERM native bundler lock, recovered without elevated permissions |
| npm test | PASS: 3 suites, 37 tests; synthetic client/session/DTO adapters |
| npm run lint | PASS: configured ESLint correctness rules; no TypeScript check |
| npm run build | PASS: Vite production build, 32 modules; generated dist ignored |
| npm audit | PASS: 0 vulnerabilities after scoped test dependency override |
| YAML override compatibility | PASS: actual loadNycConfig reads temporary .nycrc.yaml with all/include settings |
| npm run dev / npm run preview | Both started on loopback; production /account SPA fallback HTTP200 |
| UI browser 360×800 | Home and account pending: scrollWidth360 at viewport360; logo loaded, keyboard Enter navigates account, main focus follows route; semantic click works with 44px link targets |
| Assets | Logo SVG, Nunito Regular TTF and Crayon OTF HTTP200, nonempty; existing public resources preserved |
| Paths/links/whitespace/secrets | Relative documentation links and staged diff checked before commit; no provider/server secrets |

HTTP negatives: unsafe URLs/traversal, CSRF missing, 401 even HTML,403/409/422/503, malformed success; timeout after mutation never retries; abort distinct from network failure. UI adapter cases: public without resolved session, guest redirect, authenticated access, retry, pending, Staff/Admin inheritance, deny Customer/Sitter/unknown role. Race cases: late session resolve after invalidation and late read after loader replacement cannot restore obsolete state/data. Resource hook exposes loading/empty/success/pending/forbidden/error for page rendering. Error boundary does not display stack details.

Screenshots: [home360](p03-evidence/home-360.png), [account360 pending](p03-evidence/account-360.png). Browser inspection was on local code/build, not a Figma frame. Physical touch device, screen-reader walkthrough and all future domain screens have not been verified.

## Gates and next owners

Foundation local checks VERIFIED; real integration INTEGRATION_PENDING; UI PROVISIONAL. The default session adapter explicitly reports pending, and /sign-in is an OTP integration placeholder. No real authentication, logout, OTP delivery, backend permissions, database/provider or end-to-end claim. No CI check configured by this package.

- P06/P08/P34: map server /me DTO to adapter view model; cookie/expiry/authEpoch revocation, CSRF bootstrap/header agreement, onUnauthorized invalidation and verified logout/login. Server remains authoritative for roles/ownership/private projection.
- P04/P48: final brand system, Figma frames and role layouts/menu interactions. Structural styling is provisional, no pixel-match claim.
- P13/P45 and domain owners: public catalog/policies and pages, render resource lifecycle states; do not present proposed financial policies as effective.
- P34/deployment: SPA fallback with separate /api/v1 upstream; same-site cookie/Origin/CSRF enforcement. Cross-site hosting needs auth ADR amendment. Review direct API authorization after backend exists.
- Commands after ambiguous acknowledgement: reconcile using domain operation contract and reuse logical idempotency key; never mark accepted/paid merely because UI returned or provider is unavailable.

No monetary rule/deadline is implemented by this foundation; relevant FIN decisions remain owned by P01/P51/domain packages. PWA caching is deferred to P43; private data is not stored in localStorage or a service-worker cache here.
