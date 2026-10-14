# Admin pages

P17 contributes three Admin pages in separate WBS branches: the service catalog editor (WBS-019), service price history (WBS-020), and system settings (WBS-021). Each page adds effective-dated records with actor audit; write success appears only after the API acknowledges the request. Staff can read published policy, price, and configuration information; Admin can change these versions.

The service page depends on the P17 catalog API. P34 must register the React route and compose the P17 price and catalog visibility ports. Until then, the page is a component ready for integration, not a reachable production route.

Use P04 shared controls and tokens. This page is provisional because no P17 Figma frame was supplied; it uses the existing Paw World Care fonts and color tokens and must be compared with the approved frame when available.
