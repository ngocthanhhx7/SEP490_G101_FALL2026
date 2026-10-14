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
| src/app | Entry, root error boundary, providers and provisional structural CSS |
| src/routes | Root registration, P13 public routes and RequireSession UX gate; P34 confirms live integration |
| src/layouts | Public page shell and skip link; P48 supplies final authenticated role shells/avatar |
| src/pages/public | P13 public home, service list/details/areas; P07 registration and P08 sign-in; catalog/area API integration remains pending |
| src/contexts | In-memory session adapter state; no persisted credentials |
| src/services | Same-origin HTTP client and session adapter port |
| src/hooks | Cancellable read resource lifecycle for page consumers |
| src/components/public | Public navigation/footer for guest pages; no authenticated role menu or commerce controls |
| src/components/ui, src/styles | P04 brand tokens/fonts and native shared controls; root adoption through P34 |
| public/assets, public/fonts | Existing brand resources preserved; logo, Nunito Regular and Crayon Regular used |
| tests/unit | HTTP errors, CSRF, timeout, cancellation and resource races |
| tests/integration | Synthetic adapter UI/router tests; no real backend or provider |
| tests/e2e | Reserved; no end-to-end test or claim yet |

## Integration ports

`App({ sessionAdapter })` accepts a stable adapter whose `resolve({ signal })` returns `{ status: 'guest' }`, `{ status: 'authenticated', user: { displayName, role } }` or `{ status: 'pending' }`. Adapter roles are CUSTOMER, PET_SITTER, STAFF, ADMIN (internal view model, not an amendment of server DTOs). Default is explicitly pending. P06/P08/P34 must map `/me` responses to this view model, wire cookie session expiry/revocation and supply logout/CSRF flows. There is no fake login or localStorage token. Use `useSession().invalidate` for 401/logout and `refresh` after verified login; stale resolves cannot restore an invalidated session.

`createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs })` calls only `/api/v1` paths at the current origin, with same-origin cookies, no-store and redirect rejection. It validates the v1 success envelope, keeps error code/status/fieldErrors/decisionIds, invalidates on 401 including non-JSON failures, supports 204, distinguishes abort/timeout/network errors and labels 202 pending. Unsafe methods require an in-memory CSRF token from the real server adapter; X-CSRF-Token header name needs backend agreement. Commands pass a stable `idempotencyKey` and optionally `expectedVersion`. No automatic mutation retries: a lost acknowledgement requires reconciliation through the module's operation contract, not a new operation key. Cross-site auth requires a P01 ADR amendment first.

`useApiResource(load)` requires a stable loader and exposes loading/empty/success/pending/forbidden/error plus retry. It aborts obsolete requests, clears previous private data on retry and ignores late responses. Use for reads; domain pages own rendering and command reconciliation. No financial decision, deadline or resource authorization is inferred in frontend.

Routes `/`, `/sign-in` and unknown routes stay public. `/account` is a protected placeholder. RequireSession supports role configuration with Admin inheriting the Staff UX gate. Backend must enforce actual permissions, ownership, session validity and private field projection for every direct API call.

## Validation and limits

Jest 30.5.2 with React Testing Library 16.3.3 and jsdom; Babel 7.29.7 transforms ESM/JSX tests. ESLint 10.12.0 checks syntax and selected correctness rules (not a type checker). A scoped override makes @istanbuljs/load-nyc-config use js-yaml 4.3.2 instead of vulnerable sprintf-js transitives; its yaml.load interface and YAML config loading were checked. No npm audit fix --force or runtime downgrade.

See [P03 handoff](../doc/ui-ux/p03-frontend-foundation-handoff.md) for actual checks and gates. UI is PROVISIONAL, Figma not supplied. Auth/OTP/CSRF/backend integration is INTEGRATION_PENDING. Public catalog, full policies, role dashboards, shared design system and PWA belong to later packages. No secrets or frontend environment variables are required; do not put server/provider credentials in browser configuration.

## Brand components

P04 adds [tokens and usage](../doc/ui-ux/p04-brand-design-system.md), shared UI components and a separate manual fixture. The P03 root entry is unchanged; P34 receives the proposed CSS integration patch. The fixture is not a production route or provider check.
