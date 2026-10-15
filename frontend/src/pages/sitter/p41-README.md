# P41 sitter settlement page

`WeeklySettlementPage.jsx` owns weekly request selection, ledger bucket display,
history and pending/error/retry UX. `weekly-settlement.css` uses P04 shared tokens.
P34 supplies the authenticated API adapter and registers this page inside the
sitter role layout. No runtime route is added here. Default adapter explicitly
reports INTEGRATION_PENDING. See [handoff](../../../../doc/deployment/p41-n05-handoff.md).
