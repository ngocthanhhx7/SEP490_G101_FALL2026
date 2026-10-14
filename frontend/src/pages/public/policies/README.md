# Public policies

P45 owns the public policy catalog, draft pages, stable version links and reusable policy links for related journeys.

## Integration

- `publicPolicyRouteElements` exports React Router elements for `/policies`, `/policies/:slug` and `/policies/:slug/:version`. P34 must import this fragment into its public `<Routes>` tree before the wildcard route. Keep it outside `RequireSession` so guests can open pages and deep links.
- `PolicyContextLinks` accepts `registration`, `booking`, `account` or `sitterApplication` and links to fixed `/v1` URLs. A screen owner can render the relevant context links without copying slugs.
- P45 links registration consent to the fixed Terms and Privacy versions. Booking, account and sitter application screens are not available on this baseline; P34 or their page owners must add `PolicyContextLinks` when those screens are integrated.

## Content and status

`policy-catalog.js` is a synthetic, static draft fixture. Every entry carries purpose, version, proposed date, non-effective status and source notes. It is not the P17 Admin policy manager or a P01 DTO/API, and must not be presented as live centrally managed content. Unresolved fees, legal language, coverage, deadlines and provider behavior remain explicitly pending.

The UI follows the P04 token/component contract, but no P45 Figma frame was supplied or inspected; treat layout as provisional. See [content scope and integration gates](../../../../../doc/requirements/p45-public-policy-content-v1.md).
