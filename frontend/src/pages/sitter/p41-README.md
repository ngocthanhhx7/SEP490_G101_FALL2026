# P41 sitter settlement page

`WeeklySettlementPage.jsx` owns weekly request selection, ledger bucket display,
history and pending/error/retry UX. `weekly-settlement.css` uses P04 shared tokens.
`AppRoutes` registers `/sitter/settlements` in the protected sitter role layout and
navigation, with the same-origin API client and session CSRF token. The component's
standalone default adapter reports INTEGRATION_PENDING; the actual route supplies
the authenticated adapter. Open financial policy IDs disable writes. See
[handoff](../../../../doc/deployment/p41-n05-handoff.md).

## Public Profile

`SitterPublicProfilePage` owns the separate public bio/work-area submission form.
Staff/Admin use `SitterProfileReviewsPage` to review the versioned queue. Both use
the shared authenticated transport and preserve command keys after uncertain
responses. Identity changes remount the route and clear prior drafts.
