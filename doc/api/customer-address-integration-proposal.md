# Customer addresses and home access — provisional integration proposal

**Status: PROVISIONAL / INTEGRATION_PENDING.** This proposal records assumptions needed by the WBS-013 service and page. It does not amend the P01 API or database contracts and does not claim an endpoint or persistent repository is integrated. P01 owns DTO/schema decisions; P34 owns route registration and the repository integration.

## Proposed Customer commands

All routes use the `/api/v1` envelope and same-origin session/CSRF rules.

| Route | Actor | Provisional behavior |
| --- | --- | --- |
| `GET /addresses?limit=20&cursor=…` | Customer owner | Return active owner addresses in a bounded, stable keyset page. |
| `POST /addresses` | Customer owner | Create an address with `label`, public `location`, and separate `privateAccessNotes`; accept `Idempotency-Key`. The first active address becomes default. |
| `PATCH /addresses/{id}` | Customer owner | Allowlist label/location/private notes/default changes; require `expectedVersion`; use `confirmOpenBookingImpact` only after a server conflict decision. |
| `POST /addresses/{id}/archives` | Customer owner | Soft archive an active address; require version and booking-impact confirmation where applicable. Archived addresses cannot become default or be used for a new booking. |
| `GET /visits/{id}/access-notes` | Assigned sitter | Return only that visit's private access-note snapshot during the approved access window and after required handover. |

The proposal extends the current address DTO with `label`, active/archive state, default flag, timestamps and a cursor page envelope. Those fields and archive semantics require P01 approval before provider integration.

## Required repository and snapshot guarantees

- Every address lookup and mutation includes the authenticated `customerId`; never accept an owner ID from the request body.
- The persistence adapter implements each address command and its idempotency record in one transaction. Compare `expectedVersion` atomically and return conflict on a stale write.
- Active-address default changes are serialized per owner. Archiving clears the archived address's default flag in the same transaction; any replacement-default policy must be decided by P01.
- Booking creation and address edits/archive must share an atomicity rule so an open booking cannot be added between the impact check and mutation without being included in the confirmation decision.
- Booking and visit snapshots copy the public address and private access notes at confirmation. Later address edits/archive do not mutate historical snapshots.
- Snapshot lookup for sitter access proves the current assignment. Replacements require confirmed handover. Access starts at `startAt - 60 minutes` and closes at checkout or a state/assignment revocation.
- Address pages use stable keyset ordering and server-enforced limits; no unbounded owner collection reads.

## Current implementation boundary

The WBS-013 backend service is an injected repository-port module with unit and HTTP-module tests. The route module is not registered in the application, and no Address model or repository exists in this branch. The Customer page and API adapter are therefore not reachable through the integrated app until P01 finalizes the contract and P34 supplies the repository and route wiring. Figma was not provided; visual layout follows the shared P04 controls and remains provisional.
