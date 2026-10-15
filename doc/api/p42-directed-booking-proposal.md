# P42 directed booking proposal API

The route is exported for P34 composition under `/api/v1`. All endpoints use
the authenticated Customer session and private no-store responses.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/visits/:visitId/directed-proposals/availability?sitterId=...` | Read server-filtered slots and availability version |
| POST | `/visits/:visitId/directed-proposals` | Persist a pending Customer proposal |
| POST | `/bookings/:bookingId/visits/:visitId/proposals` | Same command with an explicit booking id |
| GET | `/directed-proposals/:proposalId` | Read the Customer-owned proposal |
| POST | `/directed-proposals/:proposalId/confirm` | Confirm one slot and atomically create a pending sitter offer |

Unsafe commands require `X-CSRF-Token` and an `Idempotency-Key` header. The
create body contains only `sitterId` and `slots`; booking, pet, price and
payment snapshots come from the server context. The confirm body contains
`expectedVersion` and `selectedSlot`.

Confirmation does not mean sitter acceptance or assignment. The repository
must recheck availability and version in one atomic operation. For a
multi-visit booking, the payment state must be `PAID` or `VERIFIED` before the
offer command is allowed. Provider, database and runtime route registration
remain integration work.
