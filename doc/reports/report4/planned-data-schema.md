# Proposed domain schema contracts

DESIGN_PENDING_RUNTIME. Eleven proposed contracts; no deployed collection, migration, approved missing policy or live acceptance is asserted. Four school columns remain unchanged. String/array limits are proposed technical bounds, not existing runtime limits. References state stored/target identifier types; MongoDB does not enforce cross-collection foreign keys.

## EmergencyContact

proposed emergencycontacts; UC-12 / care safety. Private contact. Owner-authorized, explicit user-provided relationship; no inferred identity. Keep separately encrypted from public sitter profile.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed EmergencyContact._id; enforce role/owner and current state before persistence. |
| ownerId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed EmergencyContact.ownerId; enforce role/owner and current state before persistence.; Reference ownerId -> users._id; stored ObjectId / target ObjectId. Owned active Customer; never reuse public sitter profile contact. |
| name | String | required trimmed NFC 1..100 characters; no control characters | Proposed EmergencyContact.name; enforce role/owner and current state before persistence. |
| phoneCiphertext | String | required; select:false private projection; authenticated encryption envelope <=4096 bytes; validate normalized phone before encryption | Proposed EmergencyContact.phoneCiphertext; enforce role/owner and current state before persistence. |
| relationship | String | required trimmed NFC 1..100 characters; no control characters | Proposed EmergencyContact.relationship; enforce role/owner and current state before persistence. |
| state | ACTIVE / ARCHIVED | required; enum ACTIVE, ARCHIVED | Proposed EmergencyContact.state; enforce role/owner and current state before persistence. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| updatedAt | Date | required server UTC Date >= createdAt | Changes only with successful aggregate mutation. |

### State / transaction rules

- ACTIVE -> ARCHIVED through owned expected-version command; no global unique phone/name because a contact can be shared by owners.
- Explicit owner-entered contact and relationship only; no inferred identity. Archived entries cannot be selected for a new booking; authorized prior snapshots are immutable.

### Proposed indexes

- {"keys":{"ownerId":1,"state":1,"updatedAt":-1,"_id":-1},"options":{},"purpose":"Owner private contact list","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"ownerId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Owned active Customer; never reuse public sitter profile contact.","status":"CURRENT_SOURCE_REFERENCE"}

### Release gates

- Private-contact consent, retention/deletion and new command adapter need approved release acceptance; no public projection or bulk backfill.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","identity":"SHA256([ownerId,EMERGENCY_CONTACT_CREATE|UPDATE|ARCHIVE,resourceId-or-NEW,key])","storage":"Unique command identity, canonical fingerprint and result in same transaction; no phone/name uniqueness.","retry":"Same original key/payload after current owner authorization; different payload conflicts."}

## DayOffRequest

proposed dayoffrequests; UC-79. Approval writes date exclusions and replacement/handover events transactionally. Near-term withdrawal follows Staff decision; no automatic salary reduction. Dates use Asia/Ho_Chi_Minh.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed DayOffRequest._id; enforce role/owner and current state before persistence. |
| sitterId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed DayOffRequest.sitterId; enforce role/owner and current state before persistence.; Reference sitterId -> users._id; stored ObjectId / target ObjectId. Active PET_SITTER with valid signed contract.; Reference sitterId -> employeeavailabilities._id; stored ObjectId / target String. Explicit hex-string conversion to employeeavailabilities._id; compare availabilityVersion. |
| startLocalDate | YYYY-MM-DD | required; real Gregorian date YYYY-MM-DD; Asia/Ho_Chi_Minh | Proposed DayOffRequest.startLocalDate; enforce role/owner and current state before persistence. |
| endLocalDate | YYYY-MM-DD | required valid local date; endLocalDate >= startLocalDate; range length bounded by approved policy | Proposed DayOffRequest.endLocalDate; enforce role/owner and current state before persistence. |
| reason | String | required; trimmed NFC 1..1000 characters; no control characters | Proposed DayOffRequest.reason; enforce role/owner and current state before persistence. |
| state | SUBMITTED / APPROVED / REJECTED / WITHDRAWN | required; enum SUBMITTED, APPROVED, REJECTED, WITHDRAWN | Proposed DayOffRequest.state; enforce role/owner and current state before persistence. |
| availabilityVersion | Integer | required; safe integer 0..9007199254740991 | Proposed DayOffRequest.availabilityVersion; enforce role/owner and current state before persistence. |
| affectedVisitVersions | {visitId,version}[] | required array 0..1000 unique visitId; each {visitId:ObjectId,version:safe integer >=0}; reject overflow, never silently truncate affected visits | Proposed DayOffRequest.affectedVisitVersions; enforce role/owner and current state before persistence.; Reference affectedVisitVersions[].visitId -> visits._id; stored ObjectId / target ObjectId. Assigned sitter and captured visit version must still match at decision. |
| decisionBy | ObjectId / null | null in SUBMITTED/WITHDRAWN; required Staff/Admin ObjectId in APPROVED/REJECTED | Proposed DayOffRequest.decisionBy; enforce role/owner and current state before persistence.; Reference decisionBy -> users._id; stored ObjectId / target ObjectId. Current authorized Staff/Admin for approval/rejection; null on pending/owner withdrawal. |
| decisionReason | String / null | null before decision; 1..1000 characters required for APPROVED/REJECTED | Proposed DayOffRequest.decisionReason; enforce role/owner and current state before persistence. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| commandKey | String | required immutable; 8..128 ASCII characters matching [A-Za-z0-9._:-]+ | Initial submit identity; scope and later decision identity are specified in commandContract. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| decidedAt | Date / null | null in SUBMITTED; required server UTC for APPROVED/REJECTED/WITHDRAWN; decidedAt >= createdAt | Proposed DayOffRequest.decidedAt; enforce role/owner and current state before persistence. |
| payloadFingerprint | String | required immutable; exactly 64 lowercase hex characters; SHA-256 | Canonical typed source/payload digest; no secrets or mutable source guesses. |

### State / transaction rules

- SUBMITTED -> APPROVED | REJECTED | WITHDRAWN with current version; terminal states cannot transition again.
- APPROVE atomically updates date exclusions, availability version, affected visit handover/reassignment intents and command result; overlap/occupancy rechecked under employee guard.
- Near-term withdrawal requires authorized decision; no automatic assigned-visit cancellation or salary reduction.

### Proposed indexes

- {"keys":{"sitterId":1,"commandKey":1},"options":{"unique":true},"purpose":"Deduplicate initial submit; fingerprint must match","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"sitterId":1,"state":1,"startLocalDate":1,"endLocalDate":1},"options":{},"purpose":"Overlap review; not a date-range exclusion guarantee","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"state":1,"createdAt":1,"_id":1},"options":{},"purpose":"Bounded decision queue","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"sitterId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Active PET_SITTER with valid signed contract.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"sitterId","targetCollection":"employeeavailabilities","targetKey":"_id","storedType":"ObjectId","targetType":"String","joinRule":"Explicit hex-string conversion to employeeavailabilities._id; compare availabilityVersion.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"affectedVisitVersions[].visitId","targetCollection":"visits","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Assigned sitter and captured visit version must still match at decision.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"decisionBy","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Current authorized Staff/Admin for approval/rejection; null on pending/owner withdrawal.","status":"CURRENT_SOURCE_REFERENCE"}

### Release gates

- Approved lead time, maximum range and near-term withdrawal/handover cutoffs required; no guessed constants.
- Employee/visit concurrency, notifications and command namespace need independent acceptance.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","submitIdentity":["sitterId","commandKey"],"actionIdentity":"SHA256([actorId,operation,aggregateId,actionSpecificKey])","fingerprint":"Canonical operation/resource/expectedVersion/payload SHA256; changed payload with same identity ->409; same command may return stored allowlisted result after current authorization checks.","atomicity":"Mutation, source claims/events and immutable command result in one Mongo transaction; no external send/transfer inside it. Later decisions use separate keys.","resultStore":"Reviewed command-store operation adapter: unique _id, fingerprint, result, createdAt. New operation is not claimed wired.","retry":"Unknown HTTP acknowledgement retries original key/payload; external outcome needs authoritative reconciliation."}

## BookingChangeRequest

proposed bookingchangerequests; UC-84 / UC-85. Time-only change preserves price snapshot. Request/decision/expiry use approved versioned cutoffs and occupancy recheck; unresolved policy is not replaced by guessed constants.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed BookingChangeRequest._id; enforce role/owner and current state before persistence. |
| bookingId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed BookingChangeRequest.bookingId; enforce role/owner and current state before persistence.; Reference bookingId -> bookings._id; stored ObjectId / target ObjectId. Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator. |
| visitId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed BookingChangeRequest.visitId; enforce role/owner and current state before persistence.; Reference visitId -> visits._id; stored ObjectId / target ObjectId. Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator. |
| customerId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed BookingChangeRequest.customerId; enforce role/owner and current state before persistence.; Reference customerId -> users._id; stored ObjectId / target ObjectId. Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator. |
| oldSlot | {startAt:Date,endAt:Date} | required immutable {startAt:Date,endAt:Date}; finite UTC dates startAt < endAt; oldSlot matches sourceVisitVersion, requestedSlot satisfies approved schedule policy | Proposed BookingChangeRequest.oldSlot; enforce role/owner and current state before persistence. |
| requestedSlot | {startAt:Date,endAt:Date} | required immutable {startAt:Date,endAt:Date}; finite UTC dates startAt < endAt; oldSlot matches sourceVisitVersion, requestedSlot satisfies approved schedule policy | Proposed BookingChangeRequest.requestedSlot; enforce role/owner and current state before persistence. |
| sourceVisitVersion | Integer | required; safe integer 0..9007199254740991 | Proposed BookingChangeRequest.sourceVisitVersion; enforce role/owner and current state before persistence. |
| policyVersion | String | required immutable approved version reference 1..160 characters; fail closed if approved policy resolver is unavailable | Opaque policy reference; no rate, cutoff or policy approval is inferred. |
| state | PENDING / APPROVED / REJECTED / EXPIRED | required; enum PENDING, APPROVED, REJECTED, EXPIRED | Proposed BookingChangeRequest.state; enforce role/owner and current state before persistence. |
| decisionBy | ObjectId / null | null in PENDING/EXPIRED; required operator ObjectId in APPROVED/REJECTED | Proposed BookingChangeRequest.decisionBy; enforce role/owner and current state before persistence.; Reference decisionBy -> users._id; stored ObjectId / target ObjectId. Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator. |
| decisionReason | String / null | null in PENDING/EXPIRED; required 1..1000 characters for APPROVED/REJECTED | Proposed BookingChangeRequest.decisionReason; enforce role/owner and current state before persistence. |
| expiresAt | Date | required; createdAt < expiresAt <= requestedSlot.startAt; derive from approved versioned policy, never invented duration | Proposed BookingChangeRequest.expiresAt; enforce role/owner and current state before persistence. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| decidedAt | Date / null | null in PENDING; required server UTC in APPROVED/REJECTED/EXPIRED; >= createdAt, EXPIRED only when now >= expiresAt | Proposed BookingChangeRequest.decidedAt; enforce role/owner and current state before persistence. |
| idempotencyKey | String | required immutable; 8..128 ASCII characters matching [A-Za-z0-9._:-]+ | Initial submit identity; scope and later decision identity are specified in commandContract. |
| payloadFingerprint | String | required immutable; exactly 64 lowercase hex characters; SHA-256 | Canonical typed source/payload digest; no secrets or mutable source guesses. |

### State / transaction rules

- PENDING -> APPROVED | REJECTED | EXPIRED using request.version and sourceVisitVersion.
- APPROVE rechecks expiry, eligibility, occupancy, payment/case restrictions and current customer ownership; updates visit scheduling effects transactionally while preserving immutable price snapshot.
- Changed source visit, competing request or unavailable slot returns conflict; rejected/expired request reserves no occupancy.

### Proposed indexes

- {"keys":{"customerId":1,"idempotencyKey":1},"options":{"unique":true},"purpose":"Initial submission replay scope","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"visitId":1},"options":{"unique":true,"partialFilterExpression":{"state":"PENDING"}},"purpose":"One pending change per visit","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"state":1,"expiresAt":1,"_id":1},"options":{},"purpose":"Bounded expiry sweep","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"bookingId","targetCollection":"bookings","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"visitId","targetCollection":"visits","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"customerId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"decisionBy","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check Customer owner, visit.bookingId and current role/state; decision actor must be authorized operator.","status":"CURRENT_SOURCE_REFERENCE"}

### Release gates

- Approved change lead time, expiry and any financial/cancellation treatment are unresolved release gates; no guessed fee/cutoff.
- Review operator authority and customer/employee confirmation protocol before enabling.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","submitIdentity":["customerId","idempotencyKey"],"actionIdentity":"SHA256([actorId,operation,aggregateId,actionSpecificKey])","fingerprint":"Canonical operation/resource/expectedVersion/payload SHA256; changed payload with same identity ->409; same command may return stored allowlisted result after current authorization checks.","atomicity":"Mutation, source claims/events and immutable command result in one Mongo transaction; no external send/transfer inside it. Later decisions use separate keys.","resultStore":"Reviewed command-store operation adapter: unique _id, fingerprint, result, createdAt. New operation is not claimed wired.","retry":"Unknown HTTP acknowledgement retries original key/payload; external outcome needs authoritative reconciliation."}

## IncidentCaseExtension

proposed extension of existing cases; UC-47 / UC-48. Reuse case aggregate and audited financial locks. Staff proposes evidenced outcome; approved Admin decision is a separate reference. Do not assume incident route has current runtime acceptance.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | required; immutable; unique primary identity; trimmed NFC 1..256 characters, no control characters | Proposed IncidentCaseExtension._id; enforce role/owner and current state before persistence.; Reference _id -> cases._id; stored String / target String. Extension of existing case identity, not another incident collection. |
| kind | INCIDENT | required; constant INCIDENT | Proposed IncidentCaseExtension.kind; enforce role/owner and current state before persistence. |
| visitId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed IncidentCaseExtension.visitId; enforce role/owner and current state before persistence.; Reference visitId -> visits._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| bookingId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed IncidentCaseExtension.bookingId; enforce role/owner and current state before persistence.; Reference bookingId -> bookings._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| reportedBy | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed IncidentCaseExtension.reportedBy; enforce role/owner and current state before persistence.; Reference reportedBy -> users._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| category | String | required; enum SAFETY, HEALTH_OBSERVATION, MISSING_PET, ACCESS, PROPERTY, BEHAVIOUR, OTHER | Vocabulary aligned to incident.service.js; aggregate extension remains proposed. |
| description | String | required; trimmed NFC 1..4000 characters; no control characters | Proposed IncidentCaseExtension.description; enforce role/owner and current state before persistence. |
| evidenceRefs | PrivateMediaRef[] | required array 0..20; each {bindingId:String(1..128),contentDigest:SHA256}; private owned references, never signed URLs or public bytes | Proposed IncidentCaseExtension.evidenceRefs; enforce role/owner and current state before persistence.; Reference evidenceRefs[].bindingId -> caremediabindings._id; stored String / target String. Typed private binding and digest under visit/actor scope; durable incident retention adapter is a release gate. |
| state | OPEN / UNDER_REVIEW / RESOLVED / CLOSED | required; enum OPEN, UNDER_REVIEW, RESOLVED, CLOSED | Proposed IncidentCaseExtension.state; enforce role/owner and current state before persistence. |
| followUpActions | {actorId,at,note,evidenceRefs}[] | required append-only array 0..100; each {actorId:ObjectId,at:UTC Date,note:String(1..4000),evidenceRefs:PrivateMediaRef[0..20]}; server actor/time and owned evidence; reject overflow instead of truncating history | Proposed IncidentCaseExtension.followUpActions; enforce role/owner and current state before persistence.; Reference followUpActions[].actorId -> users._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| financialHold | Boolean | required Boolean; hold affected money until evidenced authorized release decision | Proposed IncidentCaseExtension.financialHold; enforce role/owner and current state before persistence. |
| proposedFinancialDecisionRef | String / null | nullable until state-specific requirement; trimmed NFC 1..256 characters, no control characters | Proposed IncidentCaseExtension.proposedFinancialDecisionRef; enforce role/owner and current state before persistence.; Reference proposedFinancialDecisionRef -> EXTERNAL_APPROVED_DECISION_ADAPTER.opaque audited decision ID; stored String / target String. No physical collection join claimed; resolve immutable approved decision evidence, not a transfer execution. |
| finalDecisionRef | String / null | null before authorized decision; required before clearing hold or resolving money effects; approved immutable adapter reference 1..160 | Proposed IncidentCaseExtension.finalDecisionRef; enforce role/owner and current state before persistence.; Reference finalDecisionRef -> EXTERNAL_APPROVED_DECISION_ADAPTER.opaque audited decision ID; stored String / target String. No physical collection join claimed; resolve immutable approved decision evidence, not a transfer execution. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| closedAt | Date / null | null until CLOSED; required server UTC in CLOSED; >= createdAt | Proposed IncidentCaseExtension.closedAt; enforce role/owner and current state before persistence. |

### State / transaction rules

- OPEN -> UNDER_REVIEW -> RESOLVED -> CLOSED with current version; evidence/actions append-only.
- Staff proposes evidenced outcome; Admin-authorized financial decision reference is separate.
- Closing case does not prove refund/transfer; confirmed external outcome and hold release need their own authoritative evidence.

### Proposed indexes

- {"keys":{"kind":1,"state":1,"createdAt":1,"_id":1},"options":{},"purpose":"Staff incident queue in cases","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"bookingId":1,"financialHold":1,"state":1},"options":{},"purpose":"Financial hold reader in cases","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"_id","targetCollection":"cases","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Extension of existing case identity, not another incident collection.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"visitId","targetCollection":"visits","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"bookingId","targetCollection":"bookings","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"reportedBy","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"followUpActions[].actorId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"evidenceRefs[].bindingId","targetCollection":"caremediabindings","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Typed private binding and digest under visit/actor scope; durable incident retention adapter is a release gate.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"proposedFinancialDecisionRef","targetCollection":"EXTERNAL_APPROVED_DECISION_ADAPTER","targetKey":"opaque audited decision ID","storedType":"String","targetType":"String","joinRule":"No physical collection join claimed; resolve immutable approved decision evidence, not a transfer execution.","status":"UNRESOLVED_RELEASE_GATE"}
- {"field":"finalDecisionRef","targetCollection":"EXTERNAL_APPROVED_DECISION_ADAPTER","targetKey":"opaque audited decision ID","storedType":"String","targetType":"String","joinRule":"No physical collection join claimed; resolve immutable approved decision evidence, not a transfer execution.","status":"UNRESOLVED_RELEASE_GATE"}

### Release gates

- Incident route composition, case ID compatibility, private evidence retention and immutable decision adapter require review.
- Liability/refund policy and decision authority remain approved versioned release gates; no invented amount.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","identity":"SHA256([actorId,INCIDENT_REPORT|FOLLOW_UP|RESOLVE|CLOSE,caseId,actionKey])","storage":"Reviewed existing incident adapter integration: unique identity, fingerprint/result with case and hold intent in one transaction.","retry":"Same action key/payload can replay; external refund acknowledgement must be reconciled separately."}

## GoodsReceipt

proposed goodsreceipts; UC-70. All quantities integer >=0; accepted+rejected=received per line. Record even all-rejected delivery; increment only accepted stock, deduplicate command/ledger. PR158 is not treated as merged runtime.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed GoodsReceipt._id; enforce role/owner and current state before persistence. |
| supplierId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed GoodsReceipt.supplierId; enforce role/owner and current state before persistence.; Reference supplierId -> suppliers._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| receivedBy | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed GoodsReceipt.receivedBy; enforce role/owner and current state before persistence.; Reference receivedBy -> users._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| receivedAt | Date | required verified UTC delivery time; receivedAt <= createdAt; never invent historic receiving evidence | Proposed GoodsReceipt.receivedAt; enforce role/owner and current state before persistence. |
| lines | {productId,receivedQty,acceptedQty,rejectedQty,rejectionReason}[] | required array 1..100 unique productId; productId BSON ObjectId, receivedQty positive safe integer; acceptedQty/rejectedQty nonnegative safe integers, sum equals receivedQty; rejectionReason 1..1000 required iff rejectedQty>0, otherwise null | Proposed GoodsReceipt.lines; enforce role/owner and current state before persistence.; Reference lines[].productId -> products._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| state | RECORDED | required constant RECORDED; immutable after successful recording | Proposed GoodsReceipt.state; enforce role/owner and current state before persistence. |
| stockLedgerRefs | String[] | required array 0..100 unique IDs; one ledger event per product with acceptedQty>0; no zero-delta event | Proposed GoodsReceipt.stockLedgerRefs; enforce role/owner and current state before persistence.; Reference stockLedgerRefs[] -> proposed stockledgerentries._id; stored String / target String. Exactly committed nonzero accepted RECEIPT events; empty for all-rejected delivery. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| idempotencyKey | String | required immutable; 8..128 ASCII characters matching [A-Za-z0-9._:-]+ | Initial submit identity; scope and later decision identity are specified in commandContract. |
| payloadFingerprint | String | required immutable; exactly 64 lowercase hex characters; SHA-256 | Canonical typed source/payload digest; no secrets or mutable source guesses. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |

### State / transaction rules

- Receipt, accepted stock increments, ledger IDs and command result commit in one transaction; all-rejected delivery is still recorded.
- Validate supplier/product existence and approved stopped/deleted-source handling; stable product order and version/quantity guards avoid partial/double stock.
- Correction creates StockAdjustment referencing original receipt; never edit original receiving history.

### Proposed indexes

- {"keys":{"receivedBy":1,"idempotencyKey":1},"options":{"unique":true},"purpose":"Receipt submit replay scope","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"supplierId":1,"receivedAt":-1,"_id":-1},"options":{},"purpose":"Supplier receipt history","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"receivedAt":-1,"_id":-1},"options":{},"purpose":"Bounded receiving history","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"supplierId","targetCollection":"suppliers","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"receivedBy","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"lines[].productId","targetCollection":"products","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"stockLedgerRefs[]","targetCollection":"proposed stockledgerentries","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Exactly committed nonzero accepted RECEIPT events; empty for all-rejected delivery.","status":"PROPOSED_REFERENCE"}

### Release gates

- Proposed technical line bounds and supplier-status eligibility need review; PR158 existence is not merged/runtime acceptance.
- Ledger migration/stock authority and unique indexes require independent transaction/concurrency acceptance.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","submitIdentity":["receivedBy","idempotencyKey"],"actionIdentity":"SHA256([actorId,operation,aggregateId,actionSpecificKey])","fingerprint":"Canonical operation/resource/expectedVersion/payload SHA256; changed payload with same identity ->409; same command may return stored allowlisted result after current authorization checks.","atomicity":"Mutation, source claims/events and immutable command result in one Mongo transaction; no external send/transfer inside it. Later decisions use separate keys.","resultStore":"Reviewed command-store operation adapter: unique _id, fingerprint, result, createdAt. New operation is not claimed wired.","retry":"Unknown HTTP acknowledgement retries original key/payload; external outcome needs authoritative reconciliation."}

## StockLedgerEntry

proposed stockledgerentries; UC-70 / UC-71 / UC-95. Append-only event/source identity. Current product/order snapshots remain authoritative until reviewed migration. Ledger must be committed with guarded stock update; never rewrite an old receipt.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | required immutable; SHA256([kind,sourceRef,sourceVersion,productId]) lowercase hex string; unique event identity | Proposed StockLedgerEntry._id; enforce role/owner and current state before persistence. |
| productId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed StockLedgerEntry.productId; enforce role/owner and current state before persistence.; Reference productId -> products._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| kind | RECEIPT / SALE / RETURN / ADJUSTMENT | required; enum RECEIPT, SALE, RETURN, ADJUSTMENT | Proposed StockLedgerEntry.kind; enforce role/owner and current state before persistence. |
| deltaOnHand | Integer | required signed safe integer -9007199254740991..9007199254740991; at least one delta nonzero; resulting onHand >= held >=0 | Proposed StockLedgerEntry.deltaOnHand; enforce role/owner and current state before persistence. |
| deltaHeld | Integer | required signed safe integer -9007199254740991..9007199254740991; at least one delta nonzero; resulting onHand >= held >=0 | Proposed StockLedgerEntry.deltaHeld; enforce role/owner and current state before persistence. |
| sourceRef | String | required; trimmed NFC 1..256 characters, no control characters | Proposed StockLedgerEntry.sourceRef; enforce role/owner and current state before persistence.; Reference sourceRef -> proposed goodsreceipts OR productorders OR proposed stockadjustments._id; stored String / target ObjectId serialized as String. kind discriminates RECEIPT->goodsreceipt, SALE/RETURN->productorder, ADJUSTMENT->stockadjustment; include sourceVersion/productId. |
| sourceVersion | Integer | required; safe integer 0..9007199254740991 | Proposed StockLedgerEntry.sourceVersion; enforce role/owner and current state before persistence. |
| actorId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed StockLedgerEntry.actorId; enforce role/owner and current state before persistence.; Reference actorId -> users._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| reason | String | required; trimmed NFC 1..1000 characters; no control characters | Proposed StockLedgerEntry.reason; enforce role/owner and current state before persistence. |
| beforeVersion | Integer | required; safe integer 0..9007199254740991 | Proposed StockLedgerEntry.beforeVersion; enforce role/owner and current state before persistence. |
| afterVersion | Integer | required safe integer; afterVersion = beforeVersion+1 without overflow | Proposed StockLedgerEntry.afterVersion; enforce role/owner and current state before persistence. |
| recordedAt | Date | required; finite UTC Date; service-assigned or evidenced event time | Proposed StockLedgerEntry.recordedAt; enforce role/owner and current state before persistence. |

### State / transaction rules

- Append-only; no committed event update/delete. Product/order snapshots retain authority until reviewed migration.
- RECEIPT deltaOnHand>0/deltaHeld=0; ADJUSTMENT nonzero onHand/held=0. SALE/RETURN deltas match exact guarded order transition; faulty goods never restock.
- Ledger event, guarded Product.version increment and source transition commit together; same source with changed deltas conflicts, never increments again.

### Proposed indexes

- {"keys":{"kind":1,"sourceRef":1,"sourceVersion":1,"productId":1},"options":{"unique":true},"purpose":"One stock effect per source version/product/event kind","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"productId":1,"recordedAt":1,"_id":1},"options":{},"purpose":"Append-only product audit history","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"productId","targetCollection":"products","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"actorId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"sourceRef","targetCollection":"proposed goodsreceipts OR productorders OR proposed stockadjustments","targetKey":"_id","storedType":"String","targetType":"ObjectId serialized as String","joinRule":"kind discriminates RECEIPT->goodsreceipt, SALE/RETURN->productorder, ADJUSTMENT->stockadjustment; include sourceVersion/productId.","status":"POLYMORPHIC_PROPOSED_REFERENCE"}

### Release gates

- Stock event mapping, reversal rules and migration authority require independent review.
- No TTL/retention deletion assumed for financial/stock history.

**eventIdentity**: {"fields":["kind","sourceRef","sourceVersion","productId"],"canonicalId":"SHA256 typed tuple","atomicity":"Unique source claim plus guarded product update in same transaction; collision with different effect is conflict."}

## StockAdjustment

proposed stockadjustments; UC-95. Admin only; decrease cannot exceed sellable quantity, stock cannot go below zero. Atomic version/quantity guard plus immutable reason/audit; no change to earlier receipts.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed StockAdjustment._id; enforce role/owner and current state before persistence. |
| productId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed StockAdjustment.productId; enforce role/owner and current state before persistence.; Reference productId -> products._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| quantityDelta | Integer !=0 | required nonzero signed safe integer; decrease magnitude <= current stockOnHand-quantityHeld; resulting stockOnHand >= quantityHeld >=0; positive delta only evidenced receipt correction | Proposed StockAdjustment.quantityDelta; enforce role/owner and current state before persistence. |
| reasonCode | DAMAGED / LOST / INTERNAL_USE / RECEIPT_CORRECTION | required; enum DAMAGED, LOST, INTERNAL_USE, RECEIPT_CORRECTION | Proposed StockAdjustment.reasonCode; enforce role/owner and current state before persistence. |
| reason | String | required; trimmed NFC 1..1000 characters; no control characters | Proposed StockAdjustment.reason; enforce role/owner and current state before persistence. |
| actorId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed StockAdjustment.actorId; enforce role/owner and current state before persistence.; Reference actorId -> users._id; stored ObjectId / target ObjectId. Resolve under current owner/role/state and transaction guards. |
| expectedStockVersion | Integer | required; safe integer 0..9007199254740991 | Proposed StockAdjustment.expectedStockVersion; enforce role/owner and current state before persistence. |
| ledgerRef | String | required immutable SHA256 event ID; exactly one matching ADJUSTMENT event with same product/source/version/delta | Proposed StockAdjustment.ledgerRef; enforce role/owner and current state before persistence.; Reference ledgerRef -> proposed stockledgerentries._id; stored String / target String. Resolve under current owner/role/state and transaction guards. |
| state | APPLIED | required; constant APPLIED | Proposed StockAdjustment.state; enforce role/owner and current state before persistence. |
| idempotencyKey | String | required immutable; 8..128 ASCII characters matching [A-Za-z0-9._:-]+ | Initial submit identity; scope and later decision identity are specified in commandContract. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| payloadFingerprint | String | required immutable; exactly 64 lowercase hex characters; SHA-256 | Canonical typed source/payload digest; no secrets or mutable source guesses. |
| sourceReceiptId | ObjectId / null | required ObjectId iff reasonCode=RECEIPT_CORRECTION; null for DAMAGED/LOST/INTERNAL_USE | Proposed StockAdjustment.sourceReceiptId; enforce role/owner and current state before persistence.; Reference sourceReceiptId -> proposed goodsreceipts._id; stored ObjectId / target ObjectId. Required for RECEIPT_CORRECTION and same product line; original receipt immutable. |

### State / transaction rules

- Admin-only APPLIED record; DAMAGED/LOST/INTERNAL_USE require negative delta. RECEIPT_CORRECTION requires source receipt and evidenced signed delta.
- Expected stock version, sellable predicate, adjustment, ledger and command result commit atomically; stale/insufficient stock conflicts.
- No editing historic receipts, arbitrary positive stock or automatic unexplained balance correction.

### Proposed indexes

- {"keys":{"actorId":1,"idempotencyKey":1},"options":{"unique":true},"purpose":"Initial adjustment submit scope","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"ledgerRef":1},"options":{"unique":true},"purpose":"One applied adjustment per ledger event","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"productId":1,"createdAt":-1,"_id":-1},"options":{},"purpose":"Product adjustment history","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"productId","targetCollection":"products","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"actorId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"ledgerRef","targetCollection":"proposed stockledgerentries","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Resolve under current owner/role/state and transaction guards.","status":"PROPOSED_REFERENCE"}
- {"field":"sourceReceiptId","targetCollection":"proposed goodsreceipts","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Required for RECEIPT_CORRECTION and same product line; original receipt immutable.","status":"PROPOSED_REFERENCE"}

### Release gates

- Stock correction evidence/authority and initial ledger adoption need reviewed acceptance; no migration is implemented.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","submitIdentity":["actorId","idempotencyKey"],"actionIdentity":"SHA256([actorId,operation,aggregateId,actionSpecificKey])","fingerprint":"Canonical operation/resource/expectedVersion/payload SHA256; changed payload with same identity ->409; same command may return stored allowlisted result after current authorization checks.","atomicity":"Mutation, source claims/events and immutable command result in one Mongo transaction; no external send/transfer inside it. Later decisions use separate keys.","resultStore":"Reviewed command-store operation adapter: unique _id, fingerprint, result, createdAt. New operation is not claimed wired.","retry":"Unknown HTTP acknowledgement retries original key/payload; external outcome needs authoritative reconciliation."}

## GroomingVisitExtension

proposed embedded visit.grooming; UC-58 / UC-59 / UC-60 / UC-91. Reuse Booking/Visit instead of duplicate booking system. Qualified employee on shift; explicit consent for approved surcharge; final receipt evidence before hand-back. No unapproved surcharge rate is specified.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| receivedAt | Date / null | null before reception; required verified UTC from RECEIVED onward | Proposed GroomingVisitExtension.receivedAt; enforce role/owner and current state before persistence. |
| receivedBy | ObjectId / null | null before reception; required operational User ObjectId from RECEIVED onward | Proposed GroomingVisitExtension.receivedBy; enforce role/owner and current state before persistence.; Reference receivedBy -> users._id; stored ObjectId / target ObjectId. Authorized receiving operator; assigned sitter must be qualified ACTIVE employee, on shift, occupancy rechecked. |
| arrivalCondition | String | required 1..4000 characters from RECEIVED onward; absent before actual reception; no inferred medical diagnosis | Proposed GroomingVisitExtension.arrivalCondition; enforce role/owner and current state before persistence. |
| arrivalEvidenceRefs | PrivateMediaRef[] | required array 0..20 private {bindingId,contentDigest}; validate visit ownership and immutable evidence | Proposed GroomingVisitExtension.arrivalEvidenceRefs; enforce role/owner and current state before persistence.; Reference arrivalEvidenceRefs[].bindingId -> caremediabindings._id; stored String / target String. Private binding/digest belongs to this visit; evidence writer/retention is not claimed live. |
| declaredCareSnapshotRef | String | required; exact lowercase SHA256 of parent visit.snapshots.care; immutable owner-declared snapshot identity, no invented collection | Proposed GroomingVisitExtension.declaredCareSnapshotRef; enforce role/owner and current state before persistence.; Reference declaredCareSnapshotRef -> visits.snapshots.care digest; stored String / target SHA256 String. Digest of same visit immutable owner-declared care snapshot; no foreign collection. |
| surchargeProposal | {policyVersion,amountVnd,reason} / null | nullable; if present approved policyVersion(1..160), amountVnd safe integer>0, reason(1..1000); immutable after actual consent; no guessed rate | Proposed GroomingVisitExtension.surchargeProposal; enforce role/owner and current state before persistence. |
| customerConsentRef | String / null | null if no surcharge; required before IN_PROGRESS when surcharge proposed; actual Customer approval bound to exact proposal hash | Proposed GroomingVisitExtension.customerConsentRef; enforce role/owner and current state before persistence.; Reference customerConsentRef -> EXTERNAL_APPROVED_CONSENT_ADAPTER.opaque consent evidence ID; stored String / target String. Bind actual Customer, exact proposal hash and approval time; adapter remains a release gate. |
| assignedSitterId | ObjectId / null | null before assignment; required qualified on-shift employee before IN_PROGRESS | Proposed GroomingVisitExtension.assignedSitterId; enforce role/owner and current state before persistence.; Reference assignedSitterId -> users._id; stored ObjectId / target ObjectId. Authorized receiving operator; assigned sitter must be qualified ACTIVE employee, on shift, occupancy rechecked. |
| workState | BOOKED / RECEIVED / IN_PROGRESS / READY / STOPPED / HANDED_BACK / CANCELLED | required; enum BOOKED, RECEIVED, IN_PROGRESS, READY, STOPPED, HANDED_BACK, CANCELLED | Proposed GroomingVisitExtension.workState; enforce role/owner and current state before persistence. |
| stopReason | String / null | required 1..1000 in STOPPED; otherwise null unless prior stop recorded | Proposed GroomingVisitExtension.stopReason; enforce role/owner and current state before persistence. |
| readyAt | Date / null | null until READY/HANDED_BACK; required server UTC then, >=receivedAt | Proposed GroomingVisitExtension.readyAt; enforce role/owner and current state before persistence. |
| handedBackAt | Date / null | required verified UTC only for HANDED_BACK; >=receivedAt; payment alone is not hand-back evidence | Proposed GroomingVisitExtension.handedBackAt; enforce role/owner and current state before persistence. |
| paymentReceiptRef | String / null | required before HANDED_BACK when amount due>0; verified receipt evidence only | Proposed GroomingVisitExtension.paymentReceiptRef; enforce role/owner and current state before persistence.; Reference paymentReceiptRef -> payments OR APPROVED_COUNTER_RECEIPT_ADAPTER.typed immutable receipt identity; stored String / target PAYOS ObjectId serialized OR approved CASH/VIETQR opaque String. Verified booking/visit allocation and full amount; current payments is PAYOS-only, so CASH/VIETQR requires reviewed receipt registry/adapter. Browser return is not proof. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |

### State / transaction rules

- BOOKED -> RECEIVED -> IN_PROGRESS -> READY -> HANDED_BACK; BOOKED may CANCELLED; RECEIVED/IN_PROGRESS may STOPPED. STOPPED hand-back needs approved disposition and applicable receipt evidence.
- Compare parent Visit.version and grooming.version; mutate extension/event/command result atomically.
- Before work: qualified on-shift sitter, occupancy and any surcharge consent. Before hand-back: actual receipt/approved zero-due treatment and verified handover. No duplicate booking or AI pricing.

### Proposed indexes

- {"keys":{"grooming.workState":1,"startAt":1,"_id":1},"options":{},"purpose":"Operational shop queue in visits","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"grooming.assignedSitterId":1,"grooming.workState":1,"startAt":1},"options":{},"purpose":"Assigned shop queue; occupancy still needs scheduling guard","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"PARENT visits._id","targetCollection":"visits","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Embedded extension in existing visit, not another booking/collection.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"receivedBy","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Authorized receiving operator; assigned sitter must be qualified ACTIVE employee, on shift, occupancy rechecked.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"assignedSitterId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Authorized receiving operator; assigned sitter must be qualified ACTIVE employee, on shift, occupancy rechecked.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"arrivalEvidenceRefs[].bindingId","targetCollection":"caremediabindings","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Private binding/digest belongs to this visit; evidence writer/retention is not claimed live.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"declaredCareSnapshotRef","targetCollection":"visits","targetKey":"snapshots.care digest","storedType":"String","targetType":"SHA256 String","joinRule":"Digest of same visit immutable owner-declared care snapshot; no foreign collection.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"paymentReceiptRef","targetCollection":"payments OR APPROVED_COUNTER_RECEIPT_ADAPTER","targetKey":"typed immutable receipt identity","storedType":"String","targetType":"PAYOS ObjectId serialized OR approved CASH/VIETQR opaque String","joinRule":"Verified booking/visit allocation and full amount; current payments is PAYOS-only, so CASH/VIETQR requires reviewed receipt registry/adapter. Browser return is not proof.","status":"POLYMORPHIC_PROPOSED_REFERENCE"}
- {"field":"customerConsentRef","targetCollection":"EXTERNAL_APPROVED_CONSENT_ADAPTER","targetKey":"opaque consent evidence ID","storedType":"String","targetType":"String","joinRule":"Bind actual Customer, exact proposal hash and approval time; adapter remains a release gate.","status":"UNRESOLVED_RELEASE_GATE"}

### Release gates

- Shop transitions and private consent/evidence/receipt adapters require runtime integration review.
- Approved surcharge/stop/cancellation/zero-due policies remain release gates; no rate/term invented.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","identity":"SHA256([actorId,GROOMING_<action>,visitId,actionKey])","storage":"Reviewed EmployeeScheduleCommand operation extension with unique _id, fingerprint/result; same transaction as guarded parent Visit.","guards":"Role, parent/extension state and expected versions, qualification/occupancy, consent and receipt evidence."}

## ProductFaultyClaim

proposed productfaultyclaims; UC-92 / UC-93. Owner/order/deadline/evidence check; Admin approves same-product exchange or external refund. Faulty goods are never restocked; new replacement stock is decremented once. Change-of-mind return is excluded.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed ProductFaultyClaim._id; enforce role/owner and current state before persistence. |
| orderId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed ProductFaultyClaim.orderId; enforce role/owner and current state before persistence.; Reference orderId -> productorders._id; stored ObjectId / target ObjectId. Check real order owner/purchased line; revalidate current Staff/Admin actor before decision. |
| customerId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed ProductFaultyClaim.customerId; enforce role/owner and current state before persistence.; Reference customerId -> users._id; stored ObjectId / target ObjectId. Check real order owner/purchased line; revalidate current Staff/Admin actor before decision. |
| lines | {productId,quantity,reason}[] | required 1..100 unique purchased product IDs; each quantity positive safe integer <= delivered/picked-up quantity minus competing reserved/resolved claims; reason 1..1000 per line | Proposed ProductFaultyClaim.lines; enforce role/owner and current state before persistence.; Reference lines[].productId -> products._id; stored ObjectId / target ObjectId. Check real order owner/purchased line; revalidate current Staff/Admin actor before decision. |
| evidenceRefs | PrivateMediaRef[] | required array 1..20; immutable owned private {bindingId:String(1..128),contentDigest:SHA256}; no public upload URL | Proposed ProductFaultyClaim.evidenceRefs; enforce role/owner and current state before persistence.; Reference evidenceRefs[].bindingId -> PRIVATE_PRODUCT_CLAIM_EVIDENCE_ADAPTER._id; stored String / target String. Immutable owned private evidence binding/digest; productphotos does not retain historical blobs. |
| claimPolicyVersion | String | required immutable approved version reference 1..160 characters; fail closed if approved policy resolver is unavailable | Opaque policy reference; no rate, cutoff or policy approval is inferred. |
| state | SUBMITTED / UNDER_REVIEW / APPROVED_EXCHANGE / APPROVED_REFUND / REJECTED / RESOLVED | required; enum SUBMITTED, UNDER_REVIEW, APPROVED_EXCHANGE, APPROVED_REFUND, REJECTED, RESOLVED | Proposed ProductFaultyClaim.state; enforce role/owner and current state before persistence. |
| staffReview | {actorId,at,note} / null | null in SUBMITTED; required from UNDER_REVIEW onward except authorized direct Admin rejection; {actorId:ObjectId,at:UTC Date,note:String(1..4000)} | Proposed ProductFaultyClaim.staffReview; enforce role/owner and current state before persistence.; Reference staffReview.actorId -> users._id; stored ObjectId / target ObjectId. Check real order owner/purchased line; revalidate current Staff/Admin actor before decision. |
| adminDecision | {actorId,at,reason,decision} / null | null before decision; required for approved/rejected/resolved; {actorId:current Admin ObjectId,at:UTC Date,reason:String(1..1000),decision:EXCHANGE / REFUND / REJECT}; decision matches branch state | Proposed ProductFaultyClaim.adminDecision; enforce role/owner and current state before persistence.; Reference adminDecision.actorId -> users._id; stored ObjectId / target ObjectId. Check real order owner/purchased line; revalidate current Staff/Admin actor before decision. |
| replacementOrderRef | String / null | null on refund/rejection branch; required before resolving EXCHANGE; at most one actual replacement order | Proposed ProductFaultyClaim.replacementOrderRef; enforce role/owner and current state before persistence.; Reference replacementOrderRef -> productorders._id; stored String / target ObjectId serialized as String. One confirmed replacement order for approved exchange; source line mapping immutable. |
| refundRef | String / null | null on exchange/rejection branch; required before resolving REFUND; verified external resolution evidence | Proposed ProductFaultyClaim.refundRef; enforce role/owner and current state before persistence.; Reference refundRef -> EXTERNAL_APPROVED_PRODUCT_REFUND_ADAPTER._id; stored String / target String. Opaque verified external refund resolution; no assumed join to booking-refunds identity. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| idempotencyKey | String | required immutable; 8..128 ASCII characters matching [A-Za-z0-9._:-]+ | Initial submit identity; scope and later decision identity are specified in commandContract. |
| payloadFingerprint | String | required immutable; exactly 64 lowercase hex characters; SHA-256 | Canonical typed source/payload digest; no secrets or mutable source guesses. |

### State / transaction rules

- SUBMITTED -> UNDER_REVIEW -> APPROVED_EXCHANGE | APPROVED_REFUND | REJECTED; approved branch -> RESOLVED only on actual outcome evidence.
- Per-order source guard/CAS reserves allowed quantities across claims; a multikey unique index cannot enforce quantity capacity.
- Faulty units never restock; replacement decrements fresh stock once in exchange transaction. External refund outside transaction; uncertain outcome stays approved/unresolved for reconciliation, never fabricated as paid.

### Proposed indexes

- {"keys":{"customerId":1,"idempotencyKey":1},"options":{"unique":true},"purpose":"Initial faulty-claim submit identity","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"orderId":1,"state":1,"createdAt":1},"options":{},"purpose":"Concurrent source-quantity review; capacity enforced transactionally","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"replacementOrderRef":1},"options":{"unique":true,"partialFilterExpression":{"replacementOrderRef":{"$type":"string"}}},"purpose":"Replacement order cannot resolve multiple claims","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"orderId","targetCollection":"productorders","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check real order owner/purchased line; revalidate current Staff/Admin actor before decision.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"customerId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check real order owner/purchased line; revalidate current Staff/Admin actor before decision.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"lines[].productId","targetCollection":"products","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check real order owner/purchased line; revalidate current Staff/Admin actor before decision.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"staffReview.actorId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check real order owner/purchased line; revalidate current Staff/Admin actor before decision.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"adminDecision.actorId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Check real order owner/purchased line; revalidate current Staff/Admin actor before decision.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"evidenceRefs[].bindingId","targetCollection":"PRIVATE_PRODUCT_CLAIM_EVIDENCE_ADAPTER","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Immutable owned private evidence binding/digest; productphotos does not retain historical blobs.","status":"UNRESOLVED_RELEASE_GATE"}
- {"field":"replacementOrderRef","targetCollection":"productorders","targetKey":"_id","storedType":"String","targetType":"ObjectId serialized as String","joinRule":"One confirmed replacement order for approved exchange; source line mapping immutable.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"refundRef","targetCollection":"EXTERNAL_APPROVED_PRODUCT_REFUND_ADAPTER","targetKey":"_id","storedType":"String","targetType":"String","joinRule":"Opaque verified external refund resolution; no assumed join to booking-refunds identity.","status":"UNRESOLVED_RELEASE_GATE"}

### Release gates

- Approved faulty-goods deadline/eligibility/refund policy and private evidence retention required; no guessed deadline.
- Replacement/refund adapters and source capacity claims need reviewed integration; booking refunds are not assumed compatible.

**commandContract**: {"status":"DESIGN_PENDING_RUNTIME","submitIdentity":["customerId","idempotencyKey"],"actionIdentity":"SHA256([actorId,operation,aggregateId,actionSpecificKey])","fingerprint":"Canonical operation/resource/expectedVersion/payload SHA256; changed payload with same identity ->409; same command may return stored allowlisted result after current authorization checks.","atomicity":"Mutation, source claims/events and immutable command result in one Mongo transaction; no external send/transfer inside it. Later decisions use separate keys.","resultStore":"Reviewed command-store operation adapter: unique _id, fingerprint, result, createdAt. New operation is not claimed wired.","retry":"Unknown HTTP acknowledgement retries original key/payload; external outcome needs authoritative reconciliation."}

## AccessNoteAudit

proposed accessnoteaudits; UC-90. Record actor/time/resource/decision, never note text, key code or address secrets. Current assigned-care reader does not itself establish this audit event.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | required immutable; SHA256([actorId,visitId,correlationId,action]) hex string; unique decision-event identity | Proposed AccessNoteAudit._id; enforce role/owner and current state before persistence. |
| visitId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed AccessNoteAudit.visitId; enforce role/owner and current state before persistence.; Reference visitId -> visits._id; stored ObjectId / target ObjectId. READ_GRANTED resolves assigned current visit; READ_DENIED may retain only attempted syntactically valid ID, not an invented source. |
| actorId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed AccessNoteAudit.actorId; enforce role/owner and current state before persistence.; Reference actorId -> users._id; stored ObjectId / target ObjectId. Authenticated requesting actor; anonymous failures remain technical access logs. |
| assignmentVersion | Integer / null | nullable for DENIED before source load; required safe integer>=0 for READ_GRANTED; exact evaluated assignment version | Proposed AccessNoteAudit.assignmentVersion; enforce role/owner and current state before persistence. |
| careSnapshotHash | String / null | nullable for DENIED before authorized snapshot load; required SHA256 for READ_GRANTED; exact evaluated care digest | Canonical typed source/payload digest; no secrets or mutable source guesses. |
| action | READ_GRANTED / READ_DENIED | required; enum READ_GRANTED, READ_DENIED | Proposed AccessNoteAudit.action; enforce role/owner and current state before persistence. |
| reasonCode | String | required; enum GRANTED, NOT_ASSIGNED, WINDOW_CLOSED, HANDOVER_REQUIRED, SNAPSHOT_UNAVAILABLE, ACK_REQUIRED, RESOURCE_UNAVAILABLE; no note/address/key/recipient secrets | Proposed AccessNoteAudit.reasonCode; enforce role/owner and current state before persistence. |
| occurredAt | Date | required; finite UTC Date; service-assigned or evidenced event time | Proposed AccessNoteAudit.occurredAt; enforce role/owner and current state before persistence. |
| correlationId | String | required server-generated UUID; stable for this evaluated request only | Proposed AccessNoteAudit.correlationId; enforce role/owner and current state before persistence. |

### State / transaction rules

- Append-only decision event, not assignment/financial mutation.
- GRANTED checks current assignment/handover, acknowledged exact care snapshot and source window [startAt-1h,endAt); log safe metadata only.
- If mandatory audit write fails, fail closed before returning note text; DENIED may lack source version/hash when never authorized/loaded. Never invent them.
- action READ_GRANTED requires reasonCode=GRANTED; READ_DENIED requires a non-GRANTED safe reason. No note text appears in either record.

### Proposed indexes

- {"keys":{"actorId":1,"visitId":1,"correlationId":1,"action":1},"options":{"unique":true},"purpose":"Deduplicate one evaluated access event","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"visitId":1,"occurredAt":-1,"_id":-1},"options":{},"purpose":"Authorized visit audit","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"actorId":1,"occurredAt":-1,"_id":-1},"options":{},"purpose":"Authorized actor audit","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"visitId","targetCollection":"visits","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"READ_GRANTED resolves assigned current visit; READ_DENIED may retain only attempted syntactically valid ID, not an invented source.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"actorId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Authenticated requesting actor; anonymous failures remain technical access logs.","status":"CURRENT_SOURCE_REFERENCE"}

### Release gates

- Privacy retention/TTL (none assumed), authorized audit readers and fail-closed behavior require review.
- Current assigned-care reader is not claimed to emit this proposed event.

**eventIdentity**: {"fields":["actorId","visitId","correlationId","action"],"atomicity":"Persist evaluated event before releasing protected response; same event retry deduplicates. Later reauthorization uses new correlation ID."}

## CustomerTierAssessment

proposed customertierassessments; SRS GBR-42 / JOB-05. Disabled until approved tier names/thresholds/discounts and source rules exist. Only verified paid source joins; no arbitrary rates or fabricated profile DTO tier.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | required; immutable; unique primary identity; BSON ObjectId; reject arbitrary identity conversion | Proposed CustomerTierAssessment._id; enforce role/owner and current state before persistence. |
| customerId | ObjectId | required; BSON ObjectId; reject arbitrary identity conversion | Proposed CustomerTierAssessment.customerId; enforce role/owner and current state before persistence.; Reference customerId -> users._id; stored ObjectId / target ObjectId. Current Customer; preserve operational role separation. |
| policyVersion | String | required immutable approved version reference 1..160 characters; fail closed if approved policy resolver is unavailable | Opaque policy reference; no rate, cutoff or policy approval is inferred. |
| periodStart | Date | required; finite UTC Date; service-assigned or evidenced event time | Proposed CustomerTierAssessment.periodStart; enforce role/owner and current state before persistence. |
| periodEnd | Date | required UTC Date; periodStart < periodEnd; half-open approved-policy period [start,end) and timezone | Proposed CustomerTierAssessment.periodEnd; enforce role/owner and current state before persistence. |
| verifiedSpendVnd | Integer | required safe integer VND>=0; recompute deduplicated verified eligible sources less approved refunds; reject overflow; no AI/estimate/browser-return spend | Proposed CustomerTierAssessment.verifiedSpendVnd; enforce role/owner and current state before persistence. |
| receiptSourceHash | String | required immutable; exactly 64 lowercase hex characters; SHA-256 | Canonical typed source/payload digest; no secrets or mutable source guesses. |
| assessedTier | String | required canonical 1..100-character tier from approved policyVersion vocabulary; DRAFT candidate grants no tier | Proposed CustomerTierAssessment.assessedTier; enforce role/owner and current state before persistence. |
| discountEligibility | Boolean | required strict Boolean derived from approved policy; DRAFT grants no discount and this Boolean is not a rate | Proposed CustomerTierAssessment.discountEligibility; enforce role/owner and current state before persistence. |
| state | DRAFT / APPROVED / SUPERSEDED | required; enum DRAFT, APPROVED, SUPERSEDED | Proposed CustomerTierAssessment.state; enforce role/owner and current state before persistence. |
| createdAt | Date | required immutable server UTC Date | Creation time, not proof of external action. |
| sourceReceiptRefs | {receiptId:ObjectId,sourceVersion:Integer}[] | required array 0..10000 unique receiptId; each {receiptId:ObjectId,sourceVersion:safe integer>=0}; reject overflow and use reviewed aggregation/batching, never silently truncate | Proposed CustomerTierAssessment.sourceReceiptRefs; enforce role/owner and current state before persistence.; Reference sourceReceiptRefs[].receiptId -> payments._id; stored ObjectId / target ObjectId. Verified receipt and captured version with eligible completed source/allocation; refund/reconciliation/duplicate exclusion follows approved source rules. Product receipt mapping remains gated. |
| version | Integer | required safe integer 0..9007199254740991; start 0; CAS expectedVersion; increment exactly once per successful mutation | Optimistic domain version, not a Mongoose version key. |
| approvedBy | ObjectId / null | null in DRAFT; required Admin ObjectId in APPROVED, retained in SUPERSEDED | Proposed CustomerTierAssessment.approvedBy; enforce role/owner and current state before persistence.; Reference approvedBy -> users._id; stored ObjectId / target ObjectId. Current Admin reviewer; automated DRAFT does not self-approve. |
| approvedAt | Date / null | null in DRAFT; required server UTC>=createdAt in APPROVED, retained in SUPERSEDED | Proposed CustomerTierAssessment.approvedAt; enforce role/owner and current state before persistence. |
| approvalReference | String / null | null in DRAFT; required immutable review evidence reference 1..160 in APPROVED/SUPERSEDED | Proposed CustomerTierAssessment.approvalReference; enforce role/owner and current state before persistence. |

### State / transaction rules

- DRAFT -> APPROVED -> SUPERSEDED with expected version/current Admin; no direct DRAFT public tier.
- Supersede old approval and approve replacement atomically under customer-period guard; drift in source hash/version conflicts.
- Identical customer/policy/period/source hash rerun reads existing assessment, never reapplies spend. Public tier/discount reads APPROVED only.

### Proposed indexes

- {"keys":{"customerId":1,"policyVersion":1,"periodStart":1,"periodEnd":1,"receiptSourceHash":1},"options":{"unique":true},"purpose":"Deduplicate assessment input/reruns","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"customerId":1,"periodStart":1,"periodEnd":1},"options":{"unique":true,"partialFilterExpression":{"state":"APPROVED"}},"purpose":"One active approved assessment per customer/period","status":"PROPOSED_NOT_PROVISIONED"}
- {"keys":{"state":1,"createdAt":1,"_id":1},"options":{},"purpose":"Bounded review queue","status":"PROPOSED_NOT_PROVISIONED"}

### Reference key/type contracts

- {"field":"customerId","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Current Customer; preserve operational role separation.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"sourceReceiptRefs[].receiptId","targetCollection":"payments","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Verified receipt and captured version with eligible completed source/allocation; refund/reconciliation/duplicate exclusion follows approved source rules. Product receipt mapping remains gated.","status":"CURRENT_SOURCE_REFERENCE"}
- {"field":"approvedBy","targetCollection":"users","targetKey":"_id","storedType":"ObjectId","targetType":"ObjectId","joinRule":"Current Admin reviewer; automated DRAFT does not self-approve.","status":"CURRENT_SOURCE_REFERENCE"}

### Release gates

- Explicit approved tier names/thresholds/period/timezone/expiry/discount rates/refund treatment required; feature disabled until then.
- Verified source receipt mapping, reproducible source hash, review adapter and public projection need independent release acceptance.

**eventIdentity**: {"fields":["customerId","policyVersion","periodStart","periodEnd","receiptSourceHash"],"atomicity":"Unique typed input tuple deduplicates DRAFT; approval/supersession command includes actor/action/assessment/key/expectedVersion in reviewed adapter."}
