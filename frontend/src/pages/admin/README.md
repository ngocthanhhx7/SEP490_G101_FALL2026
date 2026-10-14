# Admin pages

P17 adds the service catalog editor, service price history, and system settings screen in this folder. Service, policy, price, and settings changes create effective-dated versions, record the Admin actor, and show success only after the API acknowledges a write. Staff can read published policy, price, and configuration information; Admin can change these versions.

The service page depends on the P17 catalog API. P34 must register the React route and compose the P17 price and catalog visibility ports. Until then, the page is a component ready for integration, not a reachable production route.

Use P04 shared controls and tokens. This page is provisional because no P17 Figma frame was supplied; it uses the existing Paw World Care fonts and color tokens and must be compared with the approved frame when available.
