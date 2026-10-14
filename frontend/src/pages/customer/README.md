# Customer pages

This folder contains Customer-owned profile, service-address, and pet screens. Each page uses the shared P04 controls and a domain adapter from `src/services`; API ownership and role authorization remain server responsibilities.

P14 adds `CustomerProfilePage` for the Customer's display name and masked verified contact channels. Route registration is owned by P34, so adding a page here does not make it reachable until the integrator mounts it.

Customer-facing pages that manage a Customer's own Paw World Care data belong here. The pet list is WBS-014; pet details and editing belong to WBS-015.

`PetListPage` is intentionally not registered in `AppRoutes`. P34 owns route registration and session/CSRF wiring. Its default detail links point to `/account/pets/:petId`; P34 may supply the `detailsPath` prop when integrating the final route. The page uses the same-origin API client through `services/pet-api.js` and has no product mock or fallback data.

**UI status: PROVISIONAL.** It uses the P04 token and component contract; no P15-specific Figma frame was supplied or inspected.

**Integration status: INTEGRATION_PENDING.** The P01/P14/P50 work is not all on `origin/develop`, and end-to-end route/provider verification is pending. This branch includes an injected service and unit tests, but no Pet schema, controller, route registration, or live session/CSRF wiring. Before wiring a live provider, confirm the server's list envelope with P01; the adapter currently accepts either `data: PetView[]` or `data: { items: PetView[], nextCursor }` and rejects other shapes instead of presenting them as an empty list. Mutations require the existing in-memory CSRF adapter and return a real server acknowledgement before the UI reports success.
