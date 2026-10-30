# Earning Source Mapping v1

Implementation: `backend/src/services/settlements/mongo-earning-sources.repository.js`.
This consumes the P01 primary collections; it does not create a second Booking or
accept imported earning snapshots from a browser. Missing or ambiguous facts stay
pending. The adapter is implemented; primary writer integration remains required.

| Collection | Required trusted fields |
| --- | --- |
| bookings | ObjectId `_id`, `visitIds`, `originalVisitCount`, `paymentMode`, `state`, BSON `completedAt`, integer `version` |
| visits | ObjectId `_id/bookingId/sitterId`, `state`, `completedAt`, integer `version`, immutable `snapshots.serviceBasisVnd`, `evidenceRefs[{kind,mediaId}]` |
| privateimages | Owner-matching READY check-in/out IDs, digest and bounded byte length |
| payments | One VERIFIED receipt per booking, `intentId/provider/providerEventId/verifiedAt`, `receiptMoney{amountVnd,currency}`, integer version |
| taxassessments | One CONFIRMED assessment per booking, explicit `totalTaxVnd`, `confirmedBy/confirmedAt/evidenceReference`, integer version |
| cases | `visitId/state`; OPEN and UNDER_REVIEW hold the whole affected booking accrual |
| refunds | `bookingId/state`; PROPOSED, APPROVED, TRANSFER_PENDING and FAILED remain unresolved |

All visits must be COMPLETED with READY owned check-in/out images; cancelled or
Staff-closed visits do not qualify. Multi-visit booking payment mode must be
PREPAY. Receipt service money reconciles exactly to visit price snapshots; tax
apportionment follows the approved allocation version and persists in the earning
source hash. Missing T, multiple receipts/assessments or unexplained money
differences require reconciliation. No tax rate is chosen here.

Allocation policy `PWC-VISIT-SNAPSHOT-ALLOCATION-2026-10-30-v2` first splits
the WHOLE booking T: sitter cost is floor(T/2), platform cost is the remainder.
Allocate T and the sitter cost by visit price using exact largest remainders and
stable visit-id ties; each visit's platform cost is the difference. Aggregate
these costs per sitter and snapshot both with the allocation policy version.
For prices 100,000/200,000 and T = 10,000 VND, sitter costs are 1,667/3,333;
platform costs are 1,666/3,334. Each side bears exactly 5,000 for the booking.
Never independently halve each sitter's allocated T or recalculate old snapshots.

## Required Writer Hooks

The primary completion writer must call `recognizeCompletion` for each distinct
sitter with the SAME committing transaction immediately after whole-booking
completion. This establishes the weekly ordinal before delayed receipt/assessment.
After verified payment/assessment writes commit, call `accrue` by booking/sitter
identifiers. Both operations replay their immutable results.

Every completion/payment/assessment/case/refund mutation must conditionally touch
the same Booking row, checking/incrementing its version or finance guard inside
the same transaction. Accrual touches that row too, preventing snapshot write
skew. Existing Earning holds must additionally call transactional `lockEarning`;
audited final conclusions use `unlockEarning`. Paid adjustments remain separate.
Inserting a Case/Refund row alone is insufficient. These hooks are not yet wired
to primary producer APIs in the current baseline, so the runtime resolver remains
closed. Mongo fixture checks of this adapter are not live business acceptance.
