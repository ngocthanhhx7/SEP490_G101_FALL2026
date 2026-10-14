# Frontend

P03 / WBS-N16 adds the React foundation. Runtime follows [P01 ADR](../doc/architecture/p01-runtime-adr-v1.md): Node 24.21.0, npm 11.19.0, React/react-dom 19.3.0, Vite 8.3.4, plugin-react 6.1.2; JavaScript ESM/JSX. Exact versions and transitive dependencies are locked in package-lock.json.

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

| Path | Responsibility |
| --- | --- |
| src/app | Entry, root error boundary, providers and P03/P04 shared CSS integration |
| src/routes | Root registration and RequireSession UX gate; server remains authoritative for access |
| src/layouts | Basic landmark layout, skip link and route focus; P48 supplies final role shells/avatar |
| src/pages/public | Foundation landing and P07 Customer registration screen; P34 still owns public route registration |
| src/pages/account | WBS-004 self account settings and verified contact enrollment; values are owner-scoped/masked and mutations need OTP; P34 owns route registration |
| src/contexts | In-memory session adapter state; no persisted credentials |
| src/services | Same-origin HTTP client, `/me` session DTO adapter and explicit pending adapter |
| src/hooks | Cancellable read resource lifecycle for page consumers |
| src/components/ui, src/styles | P04 brand tokens/fonts and native shared controls; root adoption through P34 |
| public/assets, public/fonts | Existing brand resources preserved; logo, Nunito Regular and Crayon Regular used |
| tests/unit | HTTP errors, CSRF, timeout, cancellation and resource races |
| tests/integration | Synthetic adapter UI/router tests; no real backend or provider |
| tests/e2e | Reserved; no end-to-end test or claim yet |

## Integration ports

`App({ sessionAdapter })` accepts a stable adapter whose `resolve({ signal })` returns `{ status: 'guest' }`, `{ status: 'authenticated', user: { id, displayName, roles } }` or `{ status: 'pending' }`. `createApiSessionAdapter()` maps the same-origin `/api/v1/me` DTO and treats only HTTP 401 as guest. Roles are CUSTOMER, PET_SITTER, STAFF, ADMIN. P34-A supplies the `/me` adapter, but the app still defaults to pending until OTP login and CSRF handoff are wired. P07's screen calls `refresh()` after registration; route registration and cookie-backed app session wiring remain pending. There is no fake login or localStorage token. Use `useSession().invalidate` for 401/logout; stale resolves cannot restore an invalidated session.

`createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs })` calls only `/api/v1` paths at the current origin, with same-origin cookies, no-store and redirect rejection. It validates the v1 success envelope, keeps error code/status/fieldErrors/decisionIds, invalidates on 401 including non-JSON failures, supports 204, distinguishes abort/timeout/network errors and labels 202 pending. Unsafe methods require an in-memory CSRF token from the real server adapter; X-CSRF-Token header name needs backend agreement. Commands pass a stable `idempotencyKey` and optionally `expectedVersion`. No automatic mutation retries: a lost acknowledgement requires reconciliation through the module's operation contract, not a new operation key. Cross-site auth requires a P01 ADR amendment first.

`useApiResource(load)` requires a stable loader and exposes loading/empty/success/pending/forbidden/error plus retry. It aborts obsolete requests, clears previous private data on retry and ignores late responses. Use for reads; domain pages own rendering and command reconciliation. No financial decision, deadline or resource authorization is inferred in frontend.

Routes `/`, `/sign-in` and unknown routes stay public. `/account` is a protected placeholder. RequireSession supports role configuration with Admin inheriting the Staff UX gate. Backend must enforce actual permissions, ownership, session validity and private field projection for every direct API call.

## Validation and limits

Jest 30.5.2 with React Testing Library 16.3.3 and jsdom; Babel 7.29.7 transforms ESM/JSX tests. ESLint 10.12.0 checks syntax and selected correctness rules (not a type checker). A scoped override makes @istanbuljs/load-nyc-config use js-yaml 4.3.2 instead of vulnerable sprintf-js transitives; its yaml.load interface and YAML config loading were checked. No npm audit fix --force or runtime downgrade.

See [P03 handoff](../doc/ui-ux/p03-frontend-foundation-handoff.md), [P34-A integration status](../doc/testing/p34-a-integration-status.md) and [P07 handoff](../doc/deployment/p07-customer-registration-handoff.md). P03 foundation UI remains provisional; P07 adapts the supplied registration reference to a responsive screen. The P07 page is not yet registered in the application route tree, and the `/me` adapter is not connected to the app provider. OTP login, CSRF recovery/logout and live provider integration remain pending. Public catalog, full policies, role dashboards and PWA belong to later packages. No secrets or frontend environment variables are required; do not put server/provider credentials in browser configuration.

## Brand components

P04 adds [tokens and usage](../doc/ui-ux/p04-brand-design-system.md), shared UI components and a separate manual fixture. The P03 root entry imports P04 styles; the fixture is not a production route or provider check.
