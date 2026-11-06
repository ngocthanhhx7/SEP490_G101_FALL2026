# Proposed domain schema contracts

These design contracts cover remaining SRS workflows. They are not claims of deployed collections, migrations, policy approval or runtime acceptance. Tables retain the school columns.

## EmergencyContact

proposed emergencycontacts; UC-12 / care safety. Private contact. Owner-authorized, explicit user-provided relationship; no inferred identity. Keep separately encrypted from public sitter profile.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| ownerId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| name | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| phoneCiphertext | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| relationship | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | ACTIVE / ARCHIVED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| updatedAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## DayOffRequest

proposed dayoffrequests; UC-79. Approval writes date exclusions and replacement/handover events transactionally. Near-term withdrawal follows Staff decision; no automatic salary reduction. Dates use Asia/Ho_Chi_Minh.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| sitterId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| startLocalDate | YYYY-MM-DD | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| endLocalDate | YYYY-MM-DD | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| reason | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | SUBMITTED / APPROVED / REJECTED / WITHDRAWN | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| availabilityVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| affectedVisitVersions | {visitId,version}[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| decisionBy | ObjectId / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| decisionReason | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| commandKey | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| decidedAt | Date / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## BookingChangeRequest

proposed bookingchangerequests; UC-84 / UC-85. Time-only change preserves price snapshot. Request/decision/expiry use approved versioned cutoffs and occupancy recheck; unresolved policy is not replaced by guessed constants.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| bookingId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| visitId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| customerId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| oldSlot | {startAt:Date,endAt:Date} | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| requestedSlot | {startAt:Date,endAt:Date} | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| sourceVisitVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| policyVersion | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | PENDING / APPROVED / REJECTED / EXPIRED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| decisionBy | ObjectId / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| decisionReason | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| expiresAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| decidedAt | Date / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## IncidentCaseExtension

proposed extension of existing cases; UC-47 / UC-48. Reuse case aggregate and audited financial locks. Staff proposes evidenced outcome; approved Admin decision is a separate reference. Do not assume incident route has current runtime acceptance.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| kind | INCIDENT | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| visitId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| bookingId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| reportedBy | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| category | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| description | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| evidenceRefs | PrivateMediaRef[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | OPEN / UNDER_REVIEW / RESOLVED / CLOSED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| followUpActions | {actorId,at,note,evidenceRefs}[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| financialHold | Boolean | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| proposedFinancialDecisionRef | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| finalDecisionRef | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| closedAt | Date / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## GoodsReceipt

proposed goodsreceipts; UC-70. All quantities integer >=0; accepted+rejected=received per line. Record even all-rejected delivery; increment only accepted stock, deduplicate command/ledger. PR158 is not treated as merged runtime.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| supplierId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| receivedBy | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| receivedAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| lines | {productId,receivedQty,acceptedQty,rejectedQty,rejectionReason}[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | RECORDED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| stockLedgerRefs | String[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| idempotencyKey | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| payloadFingerprint | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## StockLedgerEntry

proposed stockledgerentries; UC-70 / UC-71 / UC-95. Append-only event/source identity. Current product/order snapshots remain authoritative until reviewed migration. Ledger must be committed with guarded stock update; never rewrite an old receipt.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| productId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| kind | RECEIPT / SALE / RETURN / ADJUSTMENT | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| deltaOnHand | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| deltaHeld | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| sourceRef | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| sourceVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| actorId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| reason | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| beforeVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| afterVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| recordedAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## StockAdjustment

proposed stockadjustments; UC-95. Admin only; decrease cannot exceed sellable quantity, stock cannot go below zero. Atomic version/quantity guard plus immutable reason/audit; no change to earlier receipts.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| productId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| quantityDelta | Integer !=0 | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| reasonCode | DAMAGED / LOST / INTERNAL_USE / RECEIPT_CORRECTION | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| reason | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| actorId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| expectedStockVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| ledgerRef | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | APPLIED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| idempotencyKey | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## GroomingVisitExtension

proposed embedded visit.grooming; UC-58 / UC-59 / UC-60 / UC-91. Reuse Booking/Visit instead of duplicate booking system. Qualified employee on shift; explicit consent for approved surcharge; final receipt evidence before hand-back. No unapproved surcharge rate is specified.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| receivedAt | Date / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| receivedBy | ObjectId / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| arrivalCondition | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| arrivalEvidenceRefs | PrivateMediaRef[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| declaredCareSnapshotRef | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| surchargeProposal | {policyVersion,amountVnd,reason} / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| customerConsentRef | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| assignedSitterId | ObjectId / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| workState | BOOKED / RECEIVED / IN_PROGRESS / READY / STOPPED / HANDED_BACK / CANCELLED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| stopReason | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| readyAt | Date / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| handedBackAt | Date / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| paymentReceiptRef | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## ProductFaultyClaim

proposed productfaultyclaims; UC-92 / UC-93. Owner/order/deadline/evidence check; Admin approves same-product exchange or external refund. Faulty goods are never restocked; new replacement stock is decremented once. Change-of-mind return is excluded.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| orderId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| customerId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| lines | {productId,quantity,reason}[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| evidenceRefs | PrivateMediaRef[] | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| claimPolicyVersion | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | SUBMITTED / UNDER_REVIEW / APPROVED_EXCHANGE / APPROVED_REFUND / REJECTED / RESOLVED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| staffReview | {actorId,at,note} / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| adminDecision | {actorId,at,reason,decision} / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| replacementOrderRef | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| refundRef | String / null | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| version | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## AccessNoteAudit

proposed accessnoteaudits; UC-90. Record actor/time/resource/decision, never note text, key code or address secrets. Current assigned-care reader does not itself establish this audit event.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| visitId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| actorId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| assignmentVersion | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| careSnapshotHash | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| action | READ_GRANTED / READ_DENIED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| reasonCode | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| occurredAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| correlationId | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |

## CustomerTierAssessment

proposed customertierassessments; SRS GBR-42 / JOB-05. Disabled until approved tier names/thresholds/discounts and source rules exist. Only verified paid source joins; no arbitrary rates or fabricated profile DTO tier.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| customerId | ObjectId | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| policyVersion | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| periodStart | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| periodEnd | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| verifiedSpendVnd | Integer | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| receiptSourceHash | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| assessedTier | String | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| discountEligibility | Boolean | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| state | DRAFT / APPROVED / SUPERSEDED | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
| createdAt | Date | Proposed versioned service contract; conditional fields follow state | DESIGN_PENDING_RUNTIME; no data or migration created |
