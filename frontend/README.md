# Frontend

P03 / WBS-N16 adds the React foundation. Runtime follows [P01 ADR](../doc/architecture/p01-runtime-adr-v1.md): Node 24.22.1, npm 11.19.1, React/react-dom 19.3.0, Vite 8.3.4, plugin-react 6.1.2; JavaScript ESM/JSX. Exact versions and transitive dependencies are locked in package-lock.json.

From `frontend/`:

```bash
npm ci
npm run dev -- --host 127.0.0.1
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1
npm audit
```

These commands were exercised locally on Windows with the ADR runtime. Stop dev/preview before `npm ci` on Windows: the running process can lock the native bundler dependency. Production needs SPA fallback to index.html for frontend routes and a separate /api/v1 upstream; Vite preview is a local build check. No deployment or CI workflow is configured by P03.

## Responsibilities

`demo-ai/` là trang HTML/JS quan sát AI độc lập chỉ phục vụ bởi backend/scripts/demo-ai.js trên loopback3011; không nằm trong bundle sản phẩm. Xem [bộ tài khoản và tình huống demo](../doc/testing/ai-demo-accounts.md).

| Path | Responsibility |
| --- | --- |
| src/app | Entry, root error boundary, providers and P03/P04 shared CSS integration |
| src/routes | Root registration, P13 public routes, P10 Admin-only account route and RequireSession UX gate; P34 owns the shared integration routes |
| src/layouts | P13 public page shell plus the foundation landmark layout; P48 supplies final role shells/avatar |
| src/pages/public | P13 public home, service list/details/areas, P07 Customer registration, P16 Sitter application form, WBS-002 sign-in and P45 public policy pages |
| src/pages/admin | P10 account directory and redacted details, P16 application list/review and Sitter status controls; P34 still owns Admin route registration |
| src/pages/account | Signed-in user's own session identity and WBS-004 account settings; verified contact edits remain owner-scoped, masked and OTP-protected; P34 owns route registration |
| src/pages/public/policies | P45 approved-only policy index/article UI, stable version routes, context links and consent policy references; the real App mounts the route/provider, while P01/P17 own shared DTO and policy lifecycle integration |
| src/contexts | In-memory session adapter state; no persisted credentials |
| src/services | Same-origin HTTP client, `/me` session DTO adapter, P16 application adapters, owner-only private-image upload/read adapter and explicit pending adapter |
| src/hooks | Cancellable read resource lifecycle for page consumers |
| src/components/public | P13 public navigation and footer for guest pages; no authenticated role menu or commerce controls |
| src/components/ui, src/styles | P04 brand tokens/fonts and native shared controls; root adoption through P34 |
| public/assets, public/fonts | Existing brand resources preserved; logo, Nunito Regular and Crayon Regular used |
| tests/unit | HTTP errors, CSRF, timeout, cancellation and resource races |
| tests/integration | Synthetic adapter UI/router tests; no real backend or provider |
| tests/fixtures | Synthetic test-only policy drafts; application code must not import these fixtures |
| tests/e2e | Reserved; no end-to-end test or claim yet |

The private-image adapter requires the caller to provide and retain an
`Idempotency-Key` for the complete payload. A retry after an unknown response
must call `upload(file, { idempotencyKey })` with the same key; a new image
command must use a new key. The adapter keeps its timeout and caller abort
signal through JSON/blob body consumption, cancels the response stream on
interruption, and dispatches the shared `pwc:session-invalidated` event once
for a 401 unless a consumer injects its own handler. No public object URL is
created.

## Integration ports

`App({ sessionAdapter })` accepts a stable adapter whose `resolve({ signal })` returns `{ status: 'guest' }`, `{ status: 'authenticated', user: { id, displayName, roles } }` or `{ status: 'pending' }`. `createApiSessionAdapter()` maps the same-origin `/api/v1/me` DTO and treats only HTTP 401 as guest. Roles are CUSTOMER, PET_SITTER, STAFF, ADMIN. The production entry supplies the `/me` adapter, and P07's screen calls `refresh()` after registration so the cookie-backed session is re-read. There is no fake login or localStorage token. Use `useSession().invalidate` for 401 and `useSession().logout` for CSRF-protected logout; the injected adapter supplies its in-memory CSRF token through `getCsrfToken()`. Stale resolves cannot restore an invalidated session.

`createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs })` calls only `/api/v1` paths at the current origin, with same-origin cookies, no-store and redirect rejection. It validates the v1 success envelope, keeps error code/status/fieldErrors/decisionIds, invalidates on 401 including non-JSON failures, supports 204, distinguishes abort/timeout/network errors and labels 202 pending. Unsafe methods require an in-memory CSRF token from the real server adapter; X-CSRF-Token header name needs backend agreement. Commands pass a stable `idempotencyKey` and optionally `expectedVersion`. No automatic mutation retries: a lost acknowledgement requires reconciliation through the module's operation contract, not a new operation key. Cross-site auth requires a P01 ADR amendment first.

`useApiResource(load)` requires a stable loader and exposes loading/empty/success/pending/forbidden/error plus retry. It aborts obsolete requests, clears previous private data on retry and ignores late responses. Use for reads; domain pages own rendering and command reconciliation. No financial decision, deadline or resource authorization is inferred in frontend.

P16's Guest form accepts PDF/JPG/PNG files up to 5 MB each in the browser, but its default upload adapter is unavailable and the form stays disabled until private-media integration is supplied. These checks are usability feedback; the server-side upload provider must validate the actual bytes. Admin status mutations require a real in-memory CSRF token. Sitter suspension is a separate operational status; P21 must enforce it before offer creation. P34 owns remaining route registration for other page packages; P45 public policy routes are mounted by the real App.

Routes `/`, `/services`, `/services/:serviceId`, `/service-areas`, `/sign-in`, `/register`, `/sitter/apply`, `/policies` and policy deep links stay public. `/account` is protected and shows the signed-in user's own session projection. `/admin/users` requires ADMIN and uses `/api/v1/users`. RequireSession supports role configuration with Admin inheriting the Staff UX gate. P13 catalog and service-area reads use public adapters; live P17/P18 API integration remains pending. Backend must enforce actual permissions, ownership, session validity and private field projection for every direct API call.

## Validation and limits

Jest 30.5.2 with React Testing Library 16.3.3 and jsdom; Babel 7.29.7 transforms ESM/JSX tests. ESLint 10.12.0 checks syntax and selected correctness rules (not a type checker). A scoped override makes @istanbuljs/load-nyc-config use js-yaml 4.3.2 instead of vulnerable sprintf-js transitives; its yaml.load interface and YAML config loading were checked. No npm audit fix --force or runtime downgrade.

See [P03 handoff](../doc/ui-ux/p03-frontend-foundation-handoff.md), [P13 handoff](../doc/ui-ux/p13-public-pages-handoff.md), [P34-A integration status](../doc/testing/p34-a-integration-status.md) and [P07 handoff](../doc/deployment/p07-customer-registration-handoff.md). P03 foundation UI remains provisional; P07 adapts the supplied registration reference to a responsive screen at `/register`. P13 public routes use the catalog adapters and explicitly pending states; P34 registers the P07 page and merged Admin/service/application/address/availability pages with role guards. The browser entry injects the `/me` adapter, while OTP login, CSRF recovery/logout and live provider integration remain subject to their backend/provider gates. Full policy history, role dashboards and PWA belong to later packages. No secrets or frontend environment variables are required; do not put server/provider credentials in browser configuration.

## Brand components

P04 adds [tokens and usage](../doc/ui-ux/p04-brand-design-system.md), shared UI components and a separate manual fixture. The P03 root entry imports P04 styles; the fixture is not a production route or provider check.

## Public policy integration

`App` accepts `publicPolicyRouteElements`, `registrationPolicies` and `loadPublicPolicies`. P45 passes its exported React Router fragment through the first prop; the fragment is rendered inside the real public route tree before the wildcard. The browser entry point loads the same-origin `/api/v1/public/public-policies` source. When that source is unavailable or empty, policy index/article/version URLs display an unpublished state rather than accepting draft copy. No test fixture is imported by application code.

`registrationPolicies` is an optional read-only UI projection from the approved server source: `{ slug, versionId, status: 'APPROVED', approvedAt, effectiveAt, expiresAt? }`. The browser entry point obtains it from the public endpoint; both `terms` and `privacy` need unique current versions. Draft/future/expired/invalid/ambiguous metadata fails closed. The default empty source disables consent, OTP dispatch and registration submit. Submission sends the selected version IDs, and the server rechecks validity and stores immutable consent receipts in the registration transaction. UI gates are not server authorization. Synthetic metadata is used solely in tests.

The `/sitter/availability` page remains explicitly pending without its real API adapter; mounting a route does not prove backend/provider integration. P34 is an iterative integration task; this policy/route mini-gate is not final project acceptance.

P34 now hosts the merged P48 role shell for account and registered Admin/Customer/Sitter pages. Sidebar links point only to registered routes; public pages keep FoundationLayout. The shared shell does not grant server permissions or invent notification destinations.


## Đăng ký email và phiên ghi nhớ

Xem [luồng đăng ký, chính sách được duyệt và giới hạn tiếp nhận hồ sơ](../doc/testing/p34-registration-email-and-session.md). Đăng ký dùng OTP email; đăng nhập hỗ trợ OTP email và SMS cho liên hệ đã xác minh. SMS cần provider phía server được cấu hình và bật. Xem [kiểm tra giao diện và luồng đăng nhập](../doc/testing/login-email-sms-refresh.md). Tùy chọn ghi nhớ dành cho Customer/Pet Sitter tối đa 30 ngày; đăng xuất thu hồi phiên phía server.

## Đăng ký và hồ sơ ứng tuyển

Form khách hàng và Pet Sitter tham khảo bố cục hai cột của ảnh HouseBuddy, giữ nhận diện PawWorld. OTP email tạo tài khoản trước; form Pet Sitter dùng email đã xác minh, nhóm dịch vụ từ catalog, vùng làm việc, kinh nghiệm và ảnh giấy tờ JPG/PNG. API hồ sơ được nối với private-images và session/CSRF; trạng thái/receipt khôi phục từ server theo owner. Xem [luồng và kiểm tra](../doc/testing/registration-sitter-flow.md). PDF chưa được pipeline ảnh hỗ trợ.
