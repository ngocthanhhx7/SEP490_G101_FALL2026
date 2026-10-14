# Admin pages

P10 owns the account directory and its account detail panel in this folder. The user list uses server filters, signed cursor pagination and masked verified contacts; lock decisions require an explicit reason and display success only after the API acknowledges the new state.

The page requires an authenticated `ADMIN` session and the `/api/v1/users` API. Its header avatar opens on hover, keyboard focus or activation and links to the signed-in user's `/account` page and logout action. `SessionProvider` delegates logout and CSRF access to the injected session adapter. OTP login and adapter provisioning remain P06 integration work.

P17 contributes three Admin pages in separate WBS branches: the service catalog editor (WBS-019), service price history (WBS-020), and system settings (WBS-021). Each page adds effective-dated records with actor audit; write success appears only after the API acknowledges the request. Staff can read published policy, price, and configuration information; Admin can change these versions.

The service page depends on the P17 catalog API. P34 must register the React route and compose the P17 price and catalog visibility ports. Until then, the page is a component ready for integration, not a reachable production route.

Use P04 shared controls and tokens. This page is provisional because no P17 Figma frame was supplied; it uses the existing Paw World Care fonts and color tokens and must be compared with the approved frame when available.
