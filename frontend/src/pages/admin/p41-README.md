# P41 Admin request review

`AdminSettlementsPage.jsx` lists settlement requests, decisions and manual transfer
evidence recording. `admin-settlements.css` uses P04 tokens and responsive cards.
`AppRoutes` registers `/admin/settlements` inside the protected Admin layout and
navigation, using the authenticated same-origin API with session CSRF. The standalone
component's default adapter is pending; the real route supplies its adapter. P28 owns
WBS-N07 payroll aggregate reports. No bank/provider API is called by this page.
