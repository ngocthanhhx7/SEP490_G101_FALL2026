This folder contains Customer-owned profile, service-address, pet, and unpaid-booking screens. Each page uses shared P04 controls and a domain adapter from `src/services`; API ownership and role authorization remain server responsibilities.

`CustomerUnpaidBookingsPage` renders the server-projected unpaid-booking list and starts a payment-intent command for multi-visit prepayment through an injected API adapter. Single-visit postpay bills need a separate P01/P34 command. The page does not infer payment success from query parameters or browser return URLs, and fails closed when server clock metadata is unavailable.

P14 registers `CustomerProfilePage` at `/account/profile` behind the Customer role guard. It uses the runtime session/CSRF adapter and `/api/v1/me/profile` for display-name updates and masked verified contacts. The backend derives ownership from the current session; version conflicts require reloading before retrying.

Customer-facing pages that manage a Customer's own Paw World Care data belong here. The pet list is WBS-014; pet details and editing belong to WBS-015.

`PetListPage` is intentionally not registered in `AppRoutes`. P34 owns route registration and session/CSRF wiring. Its default detail links point to `/account/pets/:petId`; P34 may supply the `detailsPath` prop when integrating the final route. The page uses the same-origin API client through `services/pet-api.js` and has no product mock or fallback data.

**UI status: PROVISIONAL.** It uses the P04 token and component contract; no P15-specific Figma frame was supplied or inspected.

**Integration status: INTEGRATION_PENDING.** The P01/P14/P50 work is not all on `origin/develop`, and end-to-end route/provider verification is pending. This branch includes injected services and unit tests, but no Pet schema, controller, route registration, or live session/CSRF wiring. Before wiring a live provider, confirm the server's list envelope with P01; the adapter currently accepts either `data: PetView[]` or `data: { items: PetView[], nextCursor }` and rejects other shapes instead of presenting them as an empty list. Mutations require the existing in-memory CSRF adapter and return a real server acknowledgement before the UI reports success.
