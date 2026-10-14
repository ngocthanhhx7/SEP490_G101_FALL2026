# Public policies

P45 owns the approved-only public policy index/article UI, stable version links and reusable policy links for related journeys.

## Integration

- `publicPolicyRouteElements` exports React Router elements for `/policies`, `/policies/:slug` and `/policies/:slug/:version`. P34 must import this fragment into its public `<Routes>` tree before the wildcard route. Keep it outside `RequireSession` so guests can open pages and deep links.
- `PolicyContextLinks` accepts `registration`, `booking`, `account` or `sitterApplication` and links to explicit `/draft-v1` placeholder URLs while no approved versions exist. These paths display a publication-pending state without showing draft copy.
- P45 links registration consent to Terms, Privacy and OTP placeholders. Booking, account and sitter application screens are not available on this baseline; P34 or their page owners must add `PolicyContextLinks` when those screens are integrated. Registration consent cannot be treated as complete until the approved Terms and Privacy versions are available.

## Content and status

`policy-catalog.js` is an approved-only public catalog and is empty until P17 provides approved active versions. The 12 synthetic draft articles are isolated in `frontend/tests/fixtures/policy-draft-catalog.js`; public application code does not import that fixture. Draft routes display only a generic unpublished state, and unrecognized slugs/versions display the in-app not-found state. The fixture is not the P17 Admin policy manager or a P01 DTO/API. Unresolved fees, legal language, coverage, deadlines and provider behavior remain pending approval.

The UI follows the P04 token/component contract, but no P45 Figma frame was supplied or inspected; treat layout as provisional. See [content scope and integration gates](../../../../../doc/requirements/p45-public-policy-content-v1.md).
