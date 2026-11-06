# Data schema — Report 4

93 disconnected Mongoose model schemas plus 10 repository-managed collection contracts. Source baseline develop 5381c62 / production f6a6dca. Four school columns are preserved. MongoDB implicit _id indexes are omitted; explicit schema/provisioning indexes and provenance are listed. No real records or live-index acceptance is claimed.

## ApplicationMail — `application_mails`

Source: `backend/src/models/application-mail.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| applicationId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| ownerUserId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| applicationVersion | Number | required | See schema/validator source; no SQL foreign-key enforcement implied |
| applicationState | String | required; enum=['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| contactCiphertext | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| operationId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| deliveryState | String | required; enum=['PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'SKIPPED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| attempts | Number | Schema permits omission; command validation still applies | default=0 |
| failureCode | String | Schema permits omission; command validation still applies | default=None |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| nextAttemptAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| leaseUntil | Date | Schema permits omission; command validation still applies | default=None |
| acceptedAt | Date | Schema permits omission; command validation still applies | default=None |

Declared/provisioned indexes: `[[{"applicationId":1},{}],[{"deliveryState":1,"nextAttemptAt":1},{}]]`

Index source: `backend/src/models/application-mail.model.js`

## ProfileAvatar — `profileavatars`

Source: `backend/src/models/avatar.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity; required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=0 | See schema/validator source; no SQL foreign-key enforcement implied |
| body | Buffer | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| fingerprint | String | required | Excluded from default projection; explicit authorized read only |
| present | Boolean | required | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/avatar.model.js`

## CustomerVisitReview — `reviews`

Source: `backend/src/models/customer-review.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| visitId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| customerId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| direction | String | enum=['CUSTOMER_TO_SITTER'] | See schema/validator source; no SQL foreign-key enforcement implied |
| rating | Number | min=1; max=5; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| comment | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| tags | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| visibility | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| verifiedSource | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"visitId":1,"direction":1},{"unique":true}]]`

Index source: `backend/src/models/customer-review.model.js`

## CustomerReviewCommand — `customerreviewcommands`

Source: `backend/src/models/customer-review.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| payloadHash | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/customer-review.model.js`

## DecisionSnapshot — `aidecisions`

Source: `backend/src/models/decision-snapshot.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ownerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| kind | String | required; enum=['QUOTE', 'MATCH'] | See schema/validator source; no SQL foreign-key enforcement implied |
| requestHash | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| expiresAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| snapshot | Mixed | required | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"ownerId":1},{}],[{"ownerId":1,"kind":1,"createdAt":-1},{}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

Index source: `backend/src/models/decision-snapshot.model.js`

## BookingEarningSnapshot — `bookingearningsnapshots`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| bookingId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| completedAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| weekKey | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| ordinal | Number | required; min=1; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| serviceBasisVnd | Number | required; min=0; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| feeBasisPoints | Number | required; min=0; max=10000; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| commissionVnd | Number | required; min=0; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| confirmedTaxVnd | Number | required; min=0; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterTaxCostVnd | Number | required; min=0; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| platformTaxCostVnd | Number | required; min=0; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| accruedVnd | Number | required; min=0; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| policyVersion | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| allocationPolicyVersion | String | immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| decisionVersion | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceVersion | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceHash | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| completionReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| paymentReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| allocationReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| assessmentReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"id":1},{"unique":true}],[{"sitterId":1,"bookingId":1},{"unique":true}],[{"sitterId":1,"weekKey":1,"ordinal":1},{"unique":true}]]`

Index source: `backend/src/models/earning-accrual.model.js`

## WeeklyBookingCounter — `weeklybookingcounters`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| sitterId | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| weekKey | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| count | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"sitterId":1,"weekKey":1},{"unique":true}]]`

Index source: `backend/src/models/earning-accrual.model.js`

## CompletedBookingOrdinal — `completedbookingordinals`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| bookingId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| completedAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| weekKey | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| ordinal | Number | required; min=1; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| completionReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"sitterId":1,"bookingId":1},{"unique":true}],[{"sitterId":1,"weekKey":1,"ordinal":1},{"unique":true}]]`

Index source: `backend/src/models/earning-accrual.model.js`

## EarningAccrualOutbox — `earningaccrualoutboxes`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| eventId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| type | String | required; enum=['EARNING_ACCRUED']; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| snapshotId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['PENDING', 'PUBLISHED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"eventId":1},{"unique":true}],[{"state":1,"createdAt":1},{}]]`

Index source: `backend/src/models/earning-accrual.model.js`

## EmployeeAvailability — `employeeavailabilities`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| zone | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| workingWindows | Array[Mixed] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| areas | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| dayOffDates | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveFrom | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmployeeAvailabilityRevision — `employeeavailabilityrevisions`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| sitterId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveFrom | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| workingWindows | Array[Mixed] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"sitterId":1,"effectiveFrom":-1,"version":-1},{"unique":true}]]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmployeeScheduleCommand — `employeeschedulecommands`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmployeeVisitOffer — `employeevisitoffers`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| visitId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| offeredAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| deadline | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| startAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| endAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| serviceName | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| areaCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| pets | Array[Mixed] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| decidedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| originRouteRequired | Boolean | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| featureSnapshot | Mixed | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"sitterId":1,"_id":-1},{}],[{"visitId":1,"state":1,"deadline":1},{}]]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmployeeScheduleEvent — `employeescheduleevents`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| type | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| actorId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| visitId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| offerId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| at | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| detail | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmployeeScheduleProposal — `employeescheduleproposals`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| customerId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| bookingId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| visitId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| areaCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| previousAreaCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| areaLabel | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| slots | Array[Mixed] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| availabilityVersion | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| visitVersion | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| expiresAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| priceSnapshot | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| petSnapshots | Array[Mixed] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paymentState | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paymentRequired | Boolean | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdBy | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| confirmedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| selectedSlot | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"customerId":1,"createdAt":-1,"_id":-1},{}]]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmployeeVisitTravel — `employeevisittravels`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sharing | Boolean | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sessionId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| observedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| coordinates | Array[Number] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| accuracyMeters | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| expiresAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"expiresAt":1},{"expireAfterSeconds":0}]]`

Index source: `backend/src/models/employee-scheduling.model.js`

## EmploymentDocument — `employmentdocuments`

Source: `backend/src/models/employment-document.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| applicationId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| applicationVersion | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| revision | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| reference | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| templateVersion | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['DRAFT', 'ISSUED', 'SIGNED', 'ACTIVATED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| encryptedTerms | String | required | Excluded from default projection; explicit authorized read only |
| termsHash | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| issuedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| signedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| verifiedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| verifiedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| archiveReference | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| employeeId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"applicationId":1,"revision":1},{"unique":true}],[{"reference":1},{"unique":true}]]`

Index source: `backend/src/models/employment-document.model.js`

## EmploymentDocumentCounter — `employmentdocumentcounters`

Source: `backend/src/models/employment-document.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| value | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/employment-document.model.js`

## EmploymentDocumentCommand — `employmentdocumentcommands`

Source: `backend/src/models/employment-document.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| documentId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/employment-document.model.js`

## FinanceSourceCommand — `financesourcecommands`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | required | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/finance-source.model.js`

## FinanceSourceEvent — `financesourceevents`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| type | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| bookingId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| actorId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| at | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/finance-source.model.js`

## EarningAccrualTask — `earningaccrualtasks`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| bookingId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['PENDING', 'DONE'] | See schema/validator source; no SQL foreign-key enforcement implied |
| revision | Number | required | See schema/validator source; no SQL foreign-key enforcement implied |
| nextAttemptAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| lastCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"state":1,"nextAttemptAt":1},{}]]`

Index source: `backend/src/models/finance-source.model.js`

## CareMediaBinding — `caremediabindings`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| visitId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| kind | String | required; enum=['CHECK_IN', 'CHECK_OUT'] | See schema/validator source; no SQL foreign-key enforcement implied |
| ownerId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| contentDigest | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"visitId":1,"kind":1},{"unique":true}]]`

Index source: `backend/src/models/finance-source.model.js`

## Contact — `contacts`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| userId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| channel | String | required; enum=['EMAIL', 'PHONE'] | See schema/validator source; no SQL foreign-key enforcement implied |
| canonicalCiphertext | String | required | Excluded from default projection; explicit authorized read only |
| lookupKey | String | required | Excluded from default projection; explicit authorized read only |
| state | String | required; enum=['VERIFIED', 'REPLACED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| verifiedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"userId":1},{}],[{"channel":1,"lookupKey":1},{"unique":true,"partialFilterExpression":{"state":"VERIFIED"}}]]`

Index source: `backend/src/models/identity.model.js`

## OtpChallenge — `otpchallenges`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| challengeId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| contactLookup | String | required | Excluded from default projection; explicit authorized read only |
| channel | String | required; enum=['EMAIL', 'PHONE'] | See schema/validator source; no SQL foreign-key enforcement implied |
| purpose | String | required; enum=['REGISTER', 'LOGIN', 'CONTACT_CHANGE', 'APPLICATION_STATUS'] | See schema/validator source; no SQL foreign-key enforcement implied |
| codeDigest | String | required | Excluded from default projection; explicit authorized read only |
| expiresAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| resendAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| failedCount | Number | required; min=0 | default=0 |
| requesterSessionId | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=None |
| requesterUserId | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=None |
| usedAt | Date | Schema permits omission; command validation still applies | default=None |
| invalidationReason | String | enum=['RESENT', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED', None] | default=None |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"challengeId":1},{"unique":true}],[{"contactLookup":1,"purpose":1,"usedAt":1,"createdAt":-1},{}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

Index source: `backend/src/models/identity.model.js`

## OtpThrottle — `otpthrottles`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| contactLookup | String | required | Excluded from default projection; explicit authorized read only |
| sentAt | Array[Date] | Schema permits omission; command validation still applies | default=[] |
| lastSentAt | Date | Schema permits omission; command validation still applies | default=None |
| failedCount | Number | required; min=0 | default=0 |
| lockedUntil | Date | Schema permits omission; command validation still applies | default=None |
| expiresAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"contactLookup":1},{"unique":true}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

Index source: `backend/src/models/identity.model.js`

## AuthSession — `authsessions`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| sessionId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| userId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| tokenDigest | String | required | Excluded from default projection; explicit authorized read only |
| csrfDigest | String | required | Excluded from default projection; explicit authorized read only |
| authEpochAtIssue | Number | required; min=0 | See schema/validator source; no SQL foreign-key enforcement implied |
| expiresAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| revokedAt | Date | Schema permits omission; command validation still applies | default=None |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"sessionId":1},{"unique":true}],[{"tokenDigest":1},{"unique":true}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

Index source: `backend/src/models/identity.model.js`

## Notification — `notifications`

Source: `backend/src/models/notification.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| eventId | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| recipientId | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| role | String | Schema permits omission; command validation still applies | default=None |
| eventType | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| title | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| message | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| channel | String | Schema permits omission; command validation still applies | default=IN_APP |
| deepLink | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| metadata | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| readAt | Date | Schema permits omission; command validation still applies | default=None |

Declared/provisioned indexes: `[[{"recipientId":1,"createdAt":-1,"_id":-1},{}]]`

Index source: `backend/src/models/notification.model.js`

## NotificationEvent — `notificationevents`

Source: `backend/src/models/notification.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| notificationIds | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/notification.model.js`

## EmploymentContract — `employmentcontracts`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| workScheduleMode | String | enum=['SELF_REGISTERED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| minimumWeeklyMinutes | Number | min=1; max=2880 | See schema/validator source; no SQL foreign-key enforcement implied |
| documentId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| schedule | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paySchedule | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| monthlyAllowanceVnd | Number | min=0; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| employmentType | String | required; enum=['FULL_TIME', 'PART_TIME'] | See schema/validator source; no SQL foreign-key enforcement implied |
| salaryBasis | String | required; enum=['GROSS', 'NET'] | See schema/validator source; no SQL foreign-key enforcement implied |
| monthlyBaseVnd | Number | required; min=0; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| payCycle | String | required; enum=['MONTHLY', 'WEEKLY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| weeklyMinutes | Number | required; min=1; max=2880; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| signedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| endsAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| contractReference | String | required; validators=maxlength | Excluded from default projection; explicit authorized read only |
| workplaceRegion | Number | required; enum=[1, 2, 3, 4] | See schema/validator source; no SQL foreign-key enforcement implied |
| workplaceReference | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| verifiedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| recordedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"employeeId":1,"version":1},{"unique":true}],[{"employeeId":1,"effectiveAt":-1},{}]]`

Index source: `backend/src/models/payroll.model.js`

## SalaryAdvance — `salaryadvances`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| employeeId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| contractId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| monthKey | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| amountVnd | Number | required; min=0; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PAID'] | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | min=0; validators=user defined | default=0 |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| decisionReason | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| decidedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| decidedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paidBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paidAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| transferReference | String | validators=maxlength | Excluded from default projection; explicit authorized read only |
| policyVersion | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| settlementPeriod | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| settlementConsentReference | String | required; validators=maxlength | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"employeeId":1,"monthKey":1,"status":1,"requestedAt":-1},{}],[{"employeeId":1,"requestedAt":-1,"_id":-1},{}],[{"status":1,"requestedAt":-1,"_id":-1},{}],[{"transferReference":1},{"unique":true,"partialFilterExpression":{"transferReference":{"$type":"string"}}}]]`

Index source: `backend/src/models/payroll.model.js`

## PayrollMonthGuard — `payrollmonthguards`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | default=0 |
| pendingId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/payroll.model.js`

## PayrollCommand — `payrollcommands`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceRequestHash | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/payroll.model.js`

## PayrollEvent — `payrollevents`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| employeeId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| actorId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| type | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| at | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/payroll.model.js`

## PayrollServiceCredit — `payrollservicecredits`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| visitId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| bookingId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| completedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| serviceNetVnd | Number | required; min=0; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| careMinutes | Number | required; min=0; max=1440; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| onTime | Boolean | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reportsComplete | Boolean | required | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceVersion | Number | required | See schema/validator source; no SQL foreign-key enforcement implied |
| policyVersion | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"visitId":1},{"unique":true}],[{"employeeId":1,"completedAt":1,"_id":1},{}]]`

Index source: `backend/src/models/payroll.model.js`

## PayrollStatement — `payrollstatements`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| reference | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeName | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeCode | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| employeeId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| contractId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| periodStart | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| periodEnd | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| monthKey | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| dueAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| payCycle | String | required; enum=['MONTHLY', 'WEEKLY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | required; enum=['PREPARED', 'APPROVED', 'PAID', 'VOIDED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | default=0 |
| breakdown | Mixed | required | See schema/validator source; no SQL foreign-key enforcement implied |
| assessment | Mixed | required | Excluded from default projection; explicit authorized read only |
| creditIds | Array[ObjectId] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| advanceIds | Array[ObjectId] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| preparedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| preparedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paidBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| paidAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| voidedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| voidedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| voidReason | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| transferReference | String | validators=maxlength | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"employeeId":1,"periodStart":1,"periodEnd":1},{"name":"active_payroll_period","unique":true,"partialFilterExpression":{"status":{"$in":["PREPARED","APPROVED","PAID"]}}}],[{"transferReference":1},{"unique":true,"partialFilterExpression":{"transferReference":{"$type":"string"}}}],[{"employeeId":1,"periodEnd":-1,"_id":-1},{}],[{"periodEnd":-1,"_id":-1},{}]]`

Index source: `backend/src/models/payroll.model.js`

## PayrollAdjustment — `payrolladjustments`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| employeeId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| statementId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| statementVersion | Number | required | See schema/validator source; no SQL foreign-key enforcement implied |
| direction | String | required; enum=['SUPPLEMENT', 'RECOVERY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| amountVnd | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| assessmentReference | String | required; validators=maxlength | Excluded from default projection; explicit authorized read only |
| status | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'RECONCILED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | Schema permits omission; command validation still applies | default=0 |
| requestedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| preparedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| decidedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| decidedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| decisionReason | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| resolvedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| resolvedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| transferReference | String | validators=maxlength | Excluded from default projection; explicit authorized read only |
| agreementReference | String | validators=maxlength | Excluded from default projection; explicit authorized read only |
| resolutionReference | String | validators=maxlength | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"statementId":1,"assessmentReference":1},{"unique":true}],[{"employeeId":1,"requestedAt":-1,"_id":-1},{}],[{"requestedAt":-1,"_id":-1},{}]]`

Index source: `backend/src/models/payroll.model.js`

## PayrollSourceClaim — `payrollsourceclaims`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| statementId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| advanceId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| adjustmentId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/payroll.model.js`

## Pet — `pets`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ownerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| name | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| species | String | required; enum=['DOG', 'CAT'] | See schema/validator source; no SQL foreign-key enforcement implied |
| breedCode | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| weightKg | Number | required; min=0.1; max=150 | See schema/validator source; no SQL foreign-key enforcement implied |
| traits | Array[String] | Schema permits omission; command validation still applies | default=[] |
| careNeedsConfirmed | Boolean | Schema permits omission; command validation still applies | default=False |
| ageMonths | Number | min=0; max=600 | See schema/validator source; no SQL foreign-key enforcement implied |
| sex | String | enum=['MALE', 'FEMALE', 'UNKNOWN'] | default=UNKNOWN |
| careProfile | Map | Schema permits omission; command validation still applies | default={} |
| careProfile.$* | Embedded | Schema permits omission; command validation still applies | nested path; not a SQL column |
| careProfile.$*.status | String | required; enum=['KNOWN', 'UNKNOWN', 'NOT_PROVIDED'] | nested path; not a SQL column |
| careProfile.$*.value | String | validators=maxlength | nested path; not a SQL column |
| state | String | enum=['ACTIVE', 'ARCHIVED'] | default=ACTIVE |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"ownerId":1},{}],[{"ownerId":1,"state":1,"_id":1},{}]]`

Index source: `backend/src/models/pet-care.model.js`

## CustomerAddress — `customeraddresses`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ownerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| label | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| location | String | required; validators=maxlength | Excluded from default projection; explicit authorized read only |
| point | Embedded | required | Excluded from default projection; explicit authorized read only |
| point.type | String | enum=['Point'] | default=Point; nested path; not a SQL column |
| point.coordinates | Array[Number] | required; validators=user defined | nested path; not a SQL column |
| areaCode | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| pointConfirmedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| privateAccessNotes | String | validators=maxlength | Excluded from default projection; explicit authorized read only; default= |
| state | String | enum=['ACTIVE', 'ARCHIVED'] | default=ACTIVE |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"ownerId":1},{}],[{"areaCode":1},{}],[{"point":"2dsphere"},{}]]`

Index source: `backend/src/models/pet-care.model.js`

## PetCareCommand — `petcarecommands`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity; required | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | required | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/pet-care.model.js`

## PetTrait — `aitraits`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| label | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| species | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| explanation | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| active | Boolean | Schema permits omission; command validation still applies | default=True |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"code":1},{"unique":true}]]`

Index source: `backend/src/models/pet-care.model.js`

## PetBreed — `aibreeds`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| name | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| species | String | required; enum=['DOG', 'CAT'] | See schema/validator source; no SQL foreign-key enforcement implied |
| active | Boolean | Schema permits omission; command validation still applies | default=True |
| source | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"code":1},{"unique":true}]]`

Index source: `backend/src/models/pet-care.model.js`

## PricingPolicy — `aipricingpolicies`

Source: `backend/src/models/pricing.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | enum=['DRAFT', 'APPROVED', 'RETIRED'] | default=DRAFT |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| approvalSource | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| billingMode | String | enum=['PER_UNIT', 'PER_VISIT', 'PER_DAY', 'PER_KM'] | default=PER_UNIT |
| unitMinutes | Number | required; min=1; max=1440; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| orderStepVnd | Number | min=1; max=9007199254740991; validators=user defined | default=5000000 |
| orderStepBps | Number | min=0; max=10000; validators=user defined | default=200 |
| maxOrderTierBps | Number | min=0; max=50000; validators=user defined | default=2000 |
| maxPets | Number | min=1; max=10; validators=user defined | default=4 |
| extraPetBps | Number | min=0; max=20000; validators=user defined | default=0 |
| maxSurchargeBps | Number | min=0; max=50000; validators=user defined | default=20000 |
| groupStrategy | String | enum=['REJECT', 'MAX'] | default=REJECT |
| comboPerVisitBps | Number | min=0; max=1000; validators=user defined | default=0 |
| comboMaxBps | Number | min=0; max=1000; validators=user defined | default=0 |
| rules | Array[subdocument] | Schema permits omission; command validation still applies | default=[] |
| rules.code | String | required; validators=maxlength | nested path; not a SQL column |
| rules.label | String | required; validators=maxlength | nested path; not a SQL column |
| rules.explanation | String | required; validators=maxlength | nested path; not a SQL column |
| rules.scope | String | required; enum=['PET', 'VISIT'] | nested path; not a SQL column |
| rules.bps | Number | min=0; max=20000; validators=user defined | default=0; nested path; not a SQL column |
| rules.flatVnd | Number | min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a SQL column |
| rules.exclusiveGroup | String | Schema permits omission; command validation still applies | nested path; not a SQL column |
| rules.when | Embedded | Schema permits omission; command validation still applies | nested path; not a SQL column |
| rules.when.species | String | enum=['DOG', 'CAT'] | nested path; not a SQL column |
| rules.when.breedCodes | Array[String] | Schema permits omission; command validation still applies | nested path; not a SQL column |
| rules.when.traitCode | String | Schema permits omission; command validation still applies | nested path; not a SQL column |
| rules.when.minWeightKg | Number | min=0 | nested path; not a SQL column |
| rules.when.maxWeightKg | Number | min=0 | nested path; not a SQL column |
| rules.when.minWeightExclusive | Boolean | Schema permits omission; command validation still applies | nested path; not a SQL column |
| rules.when.maxWeightInclusive | Boolean | Schema permits omission; command validation still applies | nested path; not a SQL column |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"status":1,"effectiveAt":-1},{}]]`

Index source: `backend/src/models/pricing.model.js`

## ApplicantDocument — `applicantdocuments`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| ownerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| inputDigest | String | required | Excluded from default projection; explicit authorized read only |
| storageRef | String | required | Excluded from default projection; explicit authorized read only |
| contentType | String | enum=['image/png', 'image/jpeg'] | See schema/validator source; no SQL foreign-key enforcement implied |
| contentDigest | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| byteLength | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['PENDING', 'READY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| __v | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/private-image.model.js`

## ApplicantDocumentQuota — `applicantdocumentquotas`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| count | Number | required; min=0 | See schema/validator source; no SQL foreign-key enforcement implied |
| __v | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/private-image.model.js`

## PrivateImage — `privateimages`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| ownerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| inputDigest | String | required | Excluded from default projection; explicit authorized read only |
| storageRef | String | required | Excluded from default projection; explicit authorized read only |
| contentType | String | enum=['image/png', 'image/jpeg'] | See schema/validator source; no SQL foreign-key enforcement implied |
| contentDigest | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| byteLength | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['PENDING', 'READY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| __v | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/private-image.model.js`

## PrivateImageQuota — `privateimagequotas`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| count | Number | required; min=0 | See schema/validator source; no SQL foreign-key enforcement implied |
| __v | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/private-image.model.js`

## ProductPhoto — `productphotos`

Source: `backend/src/models/product-photo.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| productId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| digest | String | required; validators=regexp | See schema/validator source; no SQL foreign-key enforcement implied |
| content | Buffer | required | Excluded from default projection; explicit authorized read only |
| byteLength | Number | required; min=1; max=1048576; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| width | Number | required; min=1; max=1600; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| height | Number | required; min=1; max=1600; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| uploadedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"productId":1,"digest":1},{"unique":true}]]`

Index source: `backend/src/models/product-photo.model.js`

## Product — `products`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| name | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| category | String | required; enum=['FOOD', 'ACCESSORY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| petType | String | required; enum=['DOG', 'CAT'] | See schema/validator source; no SQL foreign-key enforcement implied |
| description | String | validators=maxlength | default= |
| photos | Array[String] | Schema permits omission; command validation still applies | default=[] |
| catalogSource | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sampleCatalog | Boolean | Schema permits omission; command validation still applies | default=False |
| sellingPrice | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| stockOnHand | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| quantityHeld | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| visible | Boolean | Schema permits omission; command validation still applies | default=True |
| deletedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| deletedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| deletionReason | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| detailsVersion | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"code":1},{"unique":true}],[{"visible":1,"category":1,"petType":1,"name":1},{}]]`

Index source: `backend/src/models/product.model.js`

## Supplier — `suppliers`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| name | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| nameKey | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| contactName | String | validators=maxlength | default= |
| phone | String | validators=maxlength | default= |
| email | String | validators=maxlength | default= |
| productIds | Array[ObjectId] | validators=user defined | default=[] |
| status | String | enum=['ACTIVE', 'STOPPED'] | default=ACTIVE |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"nameKey":1},{"unique":true}],[{"status":1,"nameKey":1},{}]]`

Index source: `backend/src/models/product.model.js`

## ProductCart — `productcarts`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| customerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| lines | Array[subdocument] | Schema permits omission; command validation still applies | default=[] |
| lines.productId | ObjectId | required | nested path; not a SQL column |
| lines.quantity | Number | required; min=1; max=99; validators=user defined | nested path; not a SQL column |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"customerId":1},{"unique":true}]]`

Index source: `backend/src/models/product.model.js`

## ProductOrder — `productorders`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| customerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| lines | Array[subdocument] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| lines.productId | ObjectId | required | nested path; not a SQL column |
| lines.productCode | String | required; validators=maxlength | nested path; not a SQL column |
| lines.productName | String | required; validators=maxlength | nested path; not a SQL column |
| lines.quantity | Number | required; min=1; max=99; validators=user defined | nested path; not a SQL column |
| lines.sellingPriceWhenOrdered | Number | required; min=0; max=9007199254740991; validators=user defined | nested path; not a SQL column |
| lines.resellableQuantity | Number | min=0; max=99; validators=user defined | nested path; not a SQL column |
| receiveMethod | String | required; enum=['DELIVERY', 'PICKUP'] | See schema/validator source; no SQL foreign-key enforcement implied |
| deliveryAddress | Embedded | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| deliveryAddress.addressId | ObjectId | required | nested path; not a SQL column |
| deliveryAddress.label | String | required; validators=maxlength | nested path; not a SQL column |
| deliveryAddress.location | String | required; validators=maxlength | nested path; not a SQL column |
| deliveryAddress.areaCode | String | required; validators=maxlength | nested path; not a SQL column |
| subtotal | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| shippingFee | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| total | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| paymentMethod | String | required; enum=['COD', 'PAY_AT_SHOP', 'PREPAID'] | See schema/validator source; no SQL foreign-key enforcement implied |
| paid | Boolean | Schema permits omission; command validation still applies | default=False |
| trackingCode | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | enum=['PLACED', 'HANDED_TO_CARRIER', 'DELIVERED', 'BEING_RETURNED', 'RETURNED', 'READY', 'PICKED_UP', 'CANCELLED'] | default=PLACED |
| deliveredAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| carrierReturnReason | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| returnReason | String | enum=['CUSTOMER_REFUSED', 'CARRIER_UNDELIVERABLE', 'SHOP_FAULT'] | See schema/validator source; no SQL foreign-key enforcement implied |
| returnNote | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| returnedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| refundMarked | Boolean | Schema permits omission; command validation still applies | default=False |
| idempotencyKey | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestFingerprint | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"code":1},{"unique":true}],[{"customerId":1,"createdAt":-1},{}],[{"lines.productId":1},{}],[{"customerId":1,"idempotencyKey":1},{"unique":true}],[{"status":1,"createdAt":-1},{}]]`

Index source: `backend/src/models/product.model.js`

## ProductCustomerRefusal — `productcustomerrefusals`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| customerId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| orderId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; enum=['REFUSED_DELIVERY'] | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"orderId":1},{"unique":true}],[{"customerId":1},{}]]`

Index source: `backend/src/models/product.model.js`

## ProductCounter — `productcounters`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity; required | See schema/validator source; no SQL foreign-key enforcement implied |
| value | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[]`

Index source: `backend/src/models/product.model.js`

## PublicPolicyVersion — `publicpolicyversions`

Source: `backend/src/models/public-policy-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| slug | String | required; enum=['terms', 'privacy', 'contact-verification', 'service-areas', 'booking', 'payments', 'cancellations-refunds', 'care-evidence', 'safety-complaints', 'sitter-onboarding', 'settlement-and-ratings', 'pwa']; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| versionId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | required; enum=['DRAFT', 'APPROVED', 'RETIRED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| title | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| purpose | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| expiresAt | Date | immutable | default=None |
| approvedAt | Date | Schema permits omission; command validation still applies | default=None |
| approvedBy | String | validators=maxlength | default=None |
| sourceRef | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| contentHash | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sections | Array[subdocument] | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| sections.heading | String | required; validators=maxlength | nested path; not a SQL column |
| sections.paragraphs | Array[String] | Schema permits omission; command validation still applies | nested path; not a SQL column |
| sections.items | Array[String] | Schema permits omission; command validation still applies | nested path; not a SQL column |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"slug":1,"versionId":1},{"unique":true}],[{"slug":1,"status":1,"effectiveAt":-1},{}]]`

Index source: `backend/src/models/public-policy-version.model.js`

## ServiceAudit — `serviceaudits`

Source: `backend/src/models/service-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| action | String | required; enum=['SERVICE_CREATED', 'SERVICE_VERSIONED', 'POLICY_VERSIONED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceType | String | required; enum=['service', 'service-policy'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1 | See schema/validator source; no SQL foreign-key enforcement implied |
| changedFields | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

Index source: `backend/src/models/service-audit.model.js`

## ServicePolicyVersion — `servicepolicyversions`

Source: `backend/src/models/service-policy-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['PUBLISHED', 'WITHDRAWN'] | See schema/validator source; no SQL foreign-key enforcement implied |
| title | String | validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| body | String | validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| changedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| recordedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"effectiveAt":1},{"unique":true}],[{"state":1,"effectiveAt":1,"serviceId":1},{}]]`

Index source: `backend/src/models/service-policy-version.model.js`

## ServicePresentation — `servicepresentations`

Source: `backend/src/models/service-presentation.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| category | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| locations | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| durationMinutes | Number | min=1; max=1440; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| preparation | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| exclusions | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| faq | Array[subdocument] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| faq.question | String | required; validators=maxlength | nested path; not a SQL column |
| faq.answer | String | required; validators=maxlength | nested path; not a SQL column |
| provisioningRunId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"serviceId":1},{"unique":true}]]`

Index source: `backend/src/models/service-presentation.model.js`

## ServicePriceAudit — `servicepriceaudits`

Source: `backend/src/models/service-price-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| action | String | required; enum=['SERVICE_PRICE_VERSIONED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceType | String | required; enum=['service-price'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1 | See schema/validator source; no SQL foreign-key enforcement implied |
| changedFields | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

Index source: `backend/src/models/service-price-audit.model.js`

## ServicePriceVersion — `servicepriceversions`

Source: `backend/src/models/service-price-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| currency | String | required; enum=['VND'] | default=VND |
| unitLabel | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| changedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| recordedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"effectiveAt":1},{"unique":true}],[{"serviceId":1,"effectiveAt":-1,"version":-1},{}]]`

Index source: `backend/src/models/service-price-version.model.js`

## ServiceVersion — `serviceversions`

Source: `backend/src/models/service-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| name | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| description | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| scope | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| species | Array[String] | required; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| changedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| recordedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"effectiveAt":1},{"unique":true}],[{"state":1,"effectiveAt":1,"serviceId":1},{}]]`

Index source: `backend/src/models/service-version.model.js`

## Service — `services`

Source: `backend/src/models/service.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required; validators=minlength,maxlength,regexp | See schema/validator source; no SQL foreign-key enforcement implied |
| createdBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"code":1},{"unique":true}]]`

Index source: `backend/src/models/service.model.js`

## SettlementRequest — `settlementrequests`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestWeekKey | String | required; immutable; validators=regexp | See schema/validator source; no SQL foreign-key enforcement implied |
| startsAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| endsAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| earningIds | Array[String] | required; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| earningSnapshots | Array[subdocument] | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| earningSnapshots.earningId | String | required; validators=maxlength | nested path; not a SQL column |
| earningSnapshots.visitId | String | validators=maxlength | default=None; nested path; not a SQL column |
| earningSnapshots.earningPeriodKey | String | required; validators=maxlength | nested path; not a SQL column |
| earningSnapshots.amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | nested path; not a SQL column |
| earningSnapshots.pendingVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a SQL column |
| earningSnapshots.heldVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a SQL column |
| earningSnapshots.availableVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a SQL column |
| earningSnapshots.reservedVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a SQL column |
| earningSnapshots.paidVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a SQL column |
| earningSnapshots.explanation | String | validators=maxlength | default=None; nested path; not a SQL column |
| earningSnapshots.ledgerReference | String | validators=maxlength | default=None; nested path; not a SQL column |
| earningSnapshots.transferRecordedAt | Date | Schema permits omission; command validation still applies | default=None; nested path; not a SQL column |
| amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| currency | String | required; enum=['VND']; immutable | default=VND |
| status | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'TRANSFER_PENDING', 'PAID'] | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=0; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| submittedAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| policyVersion | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| decisionVersion | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| decision | Mixed | Schema permits omission; command validation still applies | default=None |
| transfer | Embedded | Schema permits omission; command validation still applies | default=None |
| transfer.outcome | String | required; enum=['CONFIRMED', 'UNKNOWN', 'AMOUNT_MISMATCH'] | nested path; not a SQL column |
| transfer.reference | String | required; validators=maxlength | nested path; not a SQL column |
| transfer.evidenceReference | String | required; validators=maxlength | nested path; not a SQL column |
| transfer.amountVnd | Number | min=0; max=9007199254740991; validators=user defined | default=None; nested path; not a SQL column |
| transfer.paidAt | Date | Schema permits omission; command validation still applies | default=None; nested path; not a SQL column |
| transfer.recordedBy | String | required; validators=maxlength | nested path; not a SQL column |
| transfer.recordedAt | Date | required | nested path; not a SQL column |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"id":1},{"unique":true}],[{"sitterId":1,"requestWeekKey":1},{"unique":true}],[{"status":1,"submittedAt":-1,"id":-1},{}],[{"sitterId":1,"submittedAt":-1,"id":-1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementWeekClaim — `settlementweekclaims`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestWeekKey | String | required; immutable; validators=regexp | See schema/validator source; no SQL foreign-key enforcement implied |
| startsAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| endsAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"id":1},{"unique":true}],[{"sitterId":1,"requestWeekKey":1},{"unique":true}]]`

Index source: `backend/src/models/settlement.model.js`

## Earning — `earnings`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| earningId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| visitId | String | immutable; validators=maxlength | default=None |
| bookingId | String | immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| completedAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceSnapshotId | String | immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| earningPeriodKey | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| accruedVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| pendingVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| heldVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| availableVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| reservedVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| paidVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| explanation | String | validators=maxlength | default=None |
| ledgerReference | String | validators=maxlength | default=None |
| transferRecordedAt | Date | Schema permits omission; command validation still applies | default=None |
| state | String | required; enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID'] | See schema/validator source; no SQL foreign-key enforcement implied |
| reservation.requestId | String | validators=maxlength | default=None; nested path; not a SQL column |
| reservation.reservedAt | Date | Schema permits omission; command validation still applies | default=None; nested path; not a SQL column |
| version | Number | required; min=0; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"earningId":1},{"unique":true}],[{"sitterId":1,"state":1,"earningPeriodKey":1,"earningId":1},{}],[{"sitterId":1,"visitId":1},{"unique":true,"name":"earning_visit_owner_v2","partialFilterExpression":{"visitId":{"$type":"string"}}}],[{"reservation.requestId":1,"state":1},{}],[{"sitterId":1,"completedAt":-1,"earningId":-1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## FinancialLock — `financiallocks`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| resourceType | String | required; enum=['EARNING', 'ALLOCATION', 'REFUND', 'CASE'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| lockType | String | required; enum=['REFUND', 'CASE', 'SETTLEMENT', 'HOLD'] | See schema/validator source; no SQL foreign-key enforcement implied |
| reference | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['ACTIVE', 'RELEASED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| actorId | String | validators=maxlength | default=None |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| releasedAt | Date | Schema permits omission; command validation still applies | default=None |
| releasedBy | String | validators=maxlength | default=None |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"resourceType":1,"resourceId":1,"lockType":1,"reference":1},{"unique":true}],[{"resourceType":1,"resourceId":1,"state":1,"lockType":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## EarningLedgerEntry — `earningledgerentries`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| lineId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| operationId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestId | String | immutable; validators=maxlength | default=None |
| earningId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| fromBucket | String | enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID', None]; immutable | default=None |
| toBucket | String | required; enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID']; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| policyVersion | String | immutable; validators=maxlength | default=None |
| decisionVersion | String | immutable; validators=maxlength | default=None |
| actorId | String | immutable; validators=maxlength | default=None |
| occurredAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"lineId":1},{"unique":true}],[{"sitterId":1,"occurredAt":1,"lineId":1},{}],[{"earningId":1,"occurredAt":1,"lineId":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementCommand — `settlementcommands`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| operation | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| key | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"actorId":1,"operation":1,"key":1},{"unique":true}],[{"createdAt":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementEvent — `settlementevents`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| eventId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| operationId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| type | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| actorId | String | immutable; validators=maxlength | default=None |
| earningIds | Array[String] | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| amountVnd | Number | min=0; max=9007199254740991; immutable; validators=user defined | default=None |
| fromBucket | String | enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID', None]; immutable | default=None |
| toBucket | String | enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID']; immutable | default=None |
| reason | String | immutable; validators=maxlength | default=None |
| transfer | Mixed | immutable | default=None |
| policyVersion | String | immutable; validators=maxlength | default=None |
| decisionVersion | String | immutable; validators=maxlength | default=None |
| aggregateVersion | Number | min=0; immutable | default=None |
| occurredAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"operationId":1},{"unique":true}],[{"requestId":1,"occurredAt":1,"eventId":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementOutbox — `settlementoutboxes`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| eventId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| operationId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| type | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| payload | Mixed | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['PENDING', 'PUBLISHED', 'FAILED'] | default=PENDING |
| attempts | Number | required; min=0 | default=0 |
| createdAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| publishedAt | Date | Schema permits omission; command validation still applies | default=None |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"operationId":1},{"unique":true}],[{"state":1,"createdAt":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementTransfer — `settlementtransfers`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| requestId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; immutable; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| adminId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| outcome | String | required; enum=['CONFIRMED', 'UNKNOWN', 'AMOUNT_MISMATCH']; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| reference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| evidenceReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| amountVnd | Number | min=0; max=9007199254740991; immutable; validators=user defined | default=None |
| paidAt | Date | immutable | default=None |
| recordedAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"requestId":1,"version":1},{"unique":true}],[{"reference":1},{}],[{"evidenceReference":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementTransferClaim — `settlementtransferclaims`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| kind | String | required; enum=['TRANSFER', 'EVIDENCE']; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| reference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"kind":1,"reference":1},{"unique":true}]]`

Index source: `backend/src/models/settlement.model.js`

## SettlementEvidence — `settlementevidences`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| evidenceReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| requestId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| ownerActorId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| mediaId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['UPLOADED', 'REVOKED'] | default=UPLOADED |
| uploadedAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"evidenceReference":1},{"unique":true}],[{"requestId":1,"ownerActorId":1,"state":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## EarningAdjustment — `earningadjustments`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| earningId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceReference | String | required; immutable; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceType | String | required; enum=['CASE', 'REFUND', 'HOLD']; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | required; enum=['PENDING_ADMIN_REVIEW'] | See schema/validator source; no SQL foreign-key enforcement implied |
| proposedAmountVnd | Number | min=0; max=9007199254740991; validators=user defined | default=None |
| createdBy | String | immutable; validators=maxlength | default=None |
| createdAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"id":1},{"unique":true}],[{"earningId":1,"sourceType":1,"sourceReference":1},{"unique":true}],[{"status":1,"createdAt":1},{}]]`

Index source: `backend/src/models/settlement.model.js`

## SitterApplication — `sitterapplications`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| contractGuard | Number | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=0 |
| ownerUserId | ObjectId | Schema permits omission; command validation still applies | default=None |
| policyConsents | Array[subdocument] | immutable | default=[] |
| policyConsents.slug | String | Schema permits omission; command validation still applies | nested path; not a SQL column |
| policyConsents.versionId | String | Schema permits omission; command validation still applies | nested path; not a SQL column |
| policyConsents.contentHash | String | Schema permits omission; command validation still applies | nested path; not a SQL column |
| policyConsents.effectiveAt | Date | Schema permits omission; command validation still applies | nested path; not a SQL column |
| policyConsents.consentedAt | Date | Schema permits omission; command validation still applies | nested path; not a SQL column |
| policyConsents.sourceRef | String | Schema permits omission; command validation still applies | nested path; not a SQL column |
| displayName | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| contactChannel | String | required; enum=['EMAIL', 'PHONE'] | See schema/validator source; no SQL foreign-key enforcement implied |
| contactCiphertext | String | required | Excluded from default projection; explicit authorized read only |
| contactLookupKey | String | required | Excluded from default projection; explicit authorized read only |
| applicantParticularsCiphertext | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| identityLookupKey | String | required | Excluded from default projection; explicit authorized read only |
| activePendingOwnerUserId | ObjectId | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| activePendingContactKey | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| activePendingIdentityKey | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| ageEligible | Boolean | required; enum=[True] | See schema/validator source; no SQL foreign-key enforcement implied |
| ageCheckedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| experience | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| employmentType | String | enum=['FULL_TIME', 'PART_TIME', None] | default=None |
| requestedServices | Array[String] | required; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| workAreas | Array[String] | required; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| privateDocuments | Array[subdocument] | required; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| privateDocuments.documentId | String | required | nested path; not a SQL column |
| privateDocuments.documentType | String | required; enum=['IDENTITY', 'IDENTITY_FRONT', 'IDENTITY_BACK', 'PORTRAIT', 'CERTIFICATE', 'OTHER'] | nested path; not a SQL column |
| privateDocuments.storageRef | String | required | Excluded from default projection; explicit authorized read only; nested path; not a SQL column |
| state | String | required; enum=['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'] | default=PENDING |
| interviewNote | String | validators=maxlength | default=None |
| decisionReason | String | validators=maxlength | default=None |
| rejectedAt | Date | Schema permits omission; command validation still applies | default=None |
| reapplyAt | Date | Schema permits omission; command validation still applies | default=None |
| provisionedUserId | ObjectId | Schema permits omission; command validation still applies | default=None |
| version | Number | required; min=0 | default=0 |
| trackingCodeDigest | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| submissionKeyDigest | String | required | Excluded from default projection; explicit authorized read only |
| submissionPayloadDigest | String | required | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"ownerUserId":1},{}],[{"activePendingOwnerUserId":1},{"unique":true,"sparse":true}],[{"activePendingContactKey":1},{"unique":true,"sparse":true}],[{"activePendingIdentityKey":1},{"unique":true,"sparse":true}],[{"state":1,"createdAt":-1,"_id":-1},{}],[{"submissionKeyDigest":1},{"unique":true}],[{"trackingCodeDigest":1},{"unique":true,"sparse":true}],[{"identityLookupKey":1,"rejectedAt":-1},{}]]`

Index source: `backend/src/models/sitter-application.model.js`

## SitterApplicationAudit — `sitterapplicationaudits`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | Schema permits omission; command validation still applies | default=None |
| actorRoles | Array[String] | required | default=[] |
| action | String | required; enum=['APPLICATION_UPDATED', 'APPLICATION_SUBMITTED', 'APPLICATION_VIEWED', 'APPLICATION_REVIEW_STARTED', 'APPLICATION_DECIDED', 'APPLICATION_DOCUMENT_REQUESTED', 'SITTER_SUSPENDED', 'SITTER_REINSTATED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | enum=['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'] | default=None |
| decision | String | enum=['APPROVE', 'REJECT', None] | default=None |
| reasonDigest | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=None |
| idempotencyDigest | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=None |
| payloadDigest | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=None |
| resultVersion | Number | Schema permits omission; command validation still applies | default=None |
| resultUserId | ObjectId | Schema permits omission; command validation still applies | default=None |
| reapplyAt | Date | Schema permits omission; command validation still applies | default=None |
| documentId | String | Schema permits omission; command validation still applies | default=None |
| correlationId | String | validators=maxlength | default=None |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"resourceId":1,"occurredAt":-1},{}],[{"actorId":1,"occurredAt":-1},{}],[{"resourceId":1,"idempotencyDigest":1},{"unique":true,"partialFilterExpression":{"idempotencyDigest":{"$type":"string"}}}]]`

Index source: `backend/src/models/sitter-application.model.js`

## SitterApplicationDownloadQuota — `sitterapplicationdownloadquotas`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| windowStart | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| count | Number | required; min=0 | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"actorId":1,"windowStart":1},{"unique":true}]]`

Index source: `backend/src/models/sitter-application.model.js`

## SitterStatus — `sitterstatuses`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| userId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | required; enum=['ACTIVE', 'SUSPENDED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| statusReason | String | validators=maxlength | Excluded from default projection; explicit authorized read only; default=None |
| changedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=0 | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"userId":1},{"unique":true}]]`

Index source: `backend/src/models/sitter-application.model.js`

## SitterMatchingProfile — `aisitterprofiles`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| changedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| userId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| serviceIds | Array[ObjectId] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| species | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| areaCodes | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| allowedTraits | Array[String] | Schema permits omission; command validation still applies | default=[] |
| maxWeightKg | Number | required; min=0; max=150 | See schema/validator source; no SQL foreign-key enforcement implied |
| maxPets | Number | required; min=1; max=10; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| active | Boolean | Schema permits omission; command validation still applies | default=True |
| timeZone | String | enum=['Asia/Ho_Chi_Minh'] | default=Asia/Ho_Chi_Minh |
| windows | Array[subdocument] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| windows.weekday | Number | required; min=0; max=6; validators=user defined | nested path; not a SQL column |
| windows.startMinute | Number | required; min=0; max=1439; validators=user defined | nested path; not a SQL column |
| windows.endMinute | Number | required; min=1; max=1440; validators=user defined | nested path; not a SQL column |
| dayOffDates | Array[String] | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| starts | Array[subdocument] | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only; default=[] |
| starts.localDate | String | required | nested path; not a SQL column |
| starts.point | Embedded | required | nested path; not a SQL column |
| starts.point.type | String | enum=['Point'] | default=Point; nested path; not a SQL column |
| starts.point.coordinates | Array[Number] | required; validators=user defined | nested path; not a SQL column |
| starts.availableFrom | Date | required | nested path; not a SQL column |
| starts.availableUntil | Date | required | nested path; not a SQL column |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"userId":1},{"unique":true}],[{"active":1,"areaCodes":1},{}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## SitterVisitOutcome — `aivisitoutcomes`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| visitId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| serviceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| petIds | Array[ObjectId] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| species | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| resolution | String | required; enum=['COMPLETED', 'SITTER_FAULT', 'EXCUSED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| rating | Number | min=1; max=5; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| onTime | Boolean | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| verifiedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceRef | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| provenance | Mixed | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"visitId":1},{"unique":true}],[{"sitterId":1,"serviceId":1,"occurredAt":-1},{}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## SitterScheduleBlock — `aischeduleblocks`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| changedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| sourceRef | String | validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| sitterId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| visitId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| startAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| endAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| point | Embedded | required | Excluded from default projection; explicit authorized read only |
| point.type | String | enum=['Point'] | default=Point; nested path; not a SQL column |
| point.coordinates | Array[Number] | required; validators=user defined | nested path; not a SQL column |
| endPoint | Embedded | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| endPoint.type | String | enum=['Point'] | default=Point; nested path; not a SQL column |
| endPoint.coordinates | Array[Number] | required; validators=user defined | nested path; not a SQL column |
| state | String | required; enum=['CONFIRMED', 'HOLD', 'RELEASED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| holdExpiresAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| kind | String | enum=['VISIT', 'BREAK'] | default=VISIT |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"sitterId":1,"startAt":1,"endAt":1},{}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## RoutingMatrixCache — `airoutingmatrixes`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| key | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| minutes | Number | required; min=0; max=1440 | See schema/validator source; no SQL foreign-key enforcement implied |
| source | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| recordedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| expiresAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"key":1},{"unique":true}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## SitterRankingPolicy — `airankingpolicies`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| version | Number | required; min=1; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| status | String | enum=['DRAFT', 'APPROVED', 'RETIRED'] | default=DRAFT |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| approvalSource | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| weights | Embedded | required | See schema/validator source; no SQL foreign-key enforcement implied |
| weights.fit | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.travel | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.quality | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.reliability | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.workload | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"version":1},{"unique":true}],[{"status":1,"effectiveAt":-1},{}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## SitterRankModel — `airankmodels`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| artifactJson | String | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| artifactSha256 | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| trainingEvidence | Mixed | Schema permits omission; command validation still applies | Excluded from default projection; explicit authorized read only |
| importedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| reviewVersion | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| version | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | enum=['DRAFT', 'APPROVED', 'RETIRED'] | default=DRAFT |
| weights | Embedded | required | See schema/validator source; no SQL foreign-key enforcement implied |
| weights.fit | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.travel | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.quality | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.reliability | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| weights.workload | Number | Schema permits omission; command validation still applies | nested path; not a SQL column |
| sha256 | String | required | See schema/validator source; no SQL foreign-key enforcement implied |
| trainingRows | Number | required; min=100; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| testMae | Number | required; min=0 | See schema/validator source; no SQL foreign-key enforcement implied |
| baselineMae | Number | required; min=0 | See schema/validator source; no SQL foreign-key enforcement implied |
| testGroups | Number | required; min=10; max=9007199254740991; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| trainedUntil | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedBy | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| approvedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"version":1},{"unique":true}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## SitterRankModelReview — `sitterrankmodelreviews`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| modelId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| actorId | ObjectId | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| action | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| reviewReference | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| guardVersion | Number | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"modelId":1,"createdAt":-1},{}]]`

Index source: `backend/src/models/sitter-matching.model.js`

## SitterPublicProfile — `sitterpublicprofiles`

Source: `backend/src/models/sitter-public-profile.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| userId | ObjectId | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| bio | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| areas | Array[String] | required; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| reviewedBy | ObjectId | Schema permits omission; command validation still applies | default=None |
| reviewedAt | Date | Schema permits omission; command validation still applies | default=None |
| reason | String | validators=maxlength | Excluded from default projection; explicit authorized read only; default=None |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"userId":1},{"unique":true}],[{"state":1,"updatedAt":1,"userId":1},{}]]`

Index source: `backend/src/models/sitter-public-profile.model.js`

## SitterPublicProfileCommand — `sitterpublicprofilecommands`

Source: `backend/src/models/sitter-public-profile.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| operation | String | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| key | String | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| fingerprint | String | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| result | Mixed | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"actorId":1,"operation":1,"key":1},{"unique":true}]]`

Index source: `backend/src/models/sitter-public-profile.model.js`

## SitterPublicProfileAudit — `sitterpublicprofileaudits`

Source: `backend/src/models/sitter-public-profile.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| userId | ObjectId | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| action | String | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| contentHash | String | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required; immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"userId":1,"version":1},{"unique":true}]]`

Index source: `backend/src/models/sitter-public-profile.model.js`

## SystemSettingAudit — `systemsettingaudits`

Source: `backend/src/models/system-setting-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| action | String | required; enum=['SERVICE_CATALOG_VISIBILITY_CHANGED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceType | String | required; enum=['system-setting'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1 | See schema/validator source; no SQL foreign-key enforcement implied |
| changedFields | Array[String] | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

Index source: `backend/src/models/system-setting-audit.model.js`

## SystemSettingVersion — `systemsettingversions`

Source: `backend/src/models/system-setting-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| key | String | required; enum=['SERVICE_CATALOG_VISIBLE'] | See schema/validator source; no SQL foreign-key enforcement implied |
| version | Number | required; min=1; validators=user defined | See schema/validator source; no SQL foreign-key enforcement implied |
| enabled | Boolean | required | See schema/validator source; no SQL foreign-key enforcement implied |
| effectiveAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| changedBy | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| recordedAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"key":1,"version":1},{"unique":true}],[{"key":1,"effectiveAt":1},{"unique":true}],[{"key":1,"effectiveAt":-1,"version":-1},{}]]`

Index source: `backend/src/models/system-setting-version.model.js`

## UserAdminAudit — `useradminaudits`

Source: `backend/src/models/user-admin-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| action | String | required; enum=['USER_LOCKED', 'USER_UNLOCKED', 'USER_ROLES_CHANGED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| previousRoles | Array[String] | enum=['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] | See schema/validator source; no SQL foreign-key enforcement implied |
| roles | Array[String] | enum=['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceType | String | required; enum=['user'] | See schema/validator source; no SQL foreign-key enforcement implied |
| resourceId | ObjectId | required | See schema/validator source; no SQL foreign-key enforcement implied |
| reason | String | required; validators=minlength,maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| occurredAt | Date | required | See schema/validator source; no SQL foreign-key enforcement implied |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

Index source: `backend/src/models/user-admin-audit.model.js`

## User — `users`

Source: `backend/src/models/user.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| displayName | String | required; validators=maxlength | See schema/validator source; no SQL foreign-key enforcement implied |
| roles | Array[String] | required; enum=['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] | See schema/validator source; no SQL foreign-key enforcement implied |
| state | String | required; enum=['ACTIVE', 'LOCKED', 'SUSPENDED'] | See schema/validator source; no SQL foreign-key enforcement implied |
| authEpoch | Number | required; min=0 | default=0 |
| version | Number | required; min=0 | default=0 |
| synthetic | Boolean | Schema permits omission; command validation still applies | default=False |
| fixtureKey | String | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |
| policyConsents | Array[subdocument] | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| policyConsents.slug | String | required; enum=['terms', 'privacy'] | nested path; not a SQL column |
| policyConsents.versionId | String | required; validators=maxlength | nested path; not a SQL column |
| policyConsents.contentHash | String | required; validators=maxlength | nested path; not a SQL column |
| policyConsents.effectiveAt | Date | required | nested path; not a SQL column |
| policyConsents.consentedAt | Date | required | nested path; not a SQL column |
| policyConsents.sourceRef | String | required; validators=maxlength | nested path; not a SQL column |
| _id | ObjectId | primary identity | See schema/validator source; no SQL foreign-key enforcement implied |
| createdAt | Date | immutable | See schema/validator source; no SQL foreign-key enforcement implied |
| updatedAt | Date | Schema permits omission; command validation still applies | See schema/validator source; no SQL foreign-key enforcement implied |

Declared/provisioned indexes: `[[{"fixtureKey":1},{"unique":true,"sparse":true}]]`

Index source: `backend/src/models/user.model.js`

## Booking — `bookings`

Source: `backend/src/services/booking-proposals/booking-checkout.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| quoteId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| quoteVersion | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| originalVisitCount | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| visitIds | ObjectId[] | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentMode | PREPAY / POSTPAY | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentState | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentSnapshot | {amountVnd:Integer,currency:VND} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentDeadlineAt | Date (PREPAY) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| financeGuardVersion | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| carePlanState | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| careVisitCount | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkoutSnapshot | {quote,selections,customerVisits,consentAt,policyVersion} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| carePlanSnapshot | {shiftMinutes,approvedBy,approvedAt,allocationVersion,source} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| completedAt | Date (completion transition) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[[{"carePlanState":1,"createdAt":1,"_id":1},{}]]`

Index source: `backend/src/services/employee-scheduling/scheduling-storage.service.js`

## Visit — `visits`

Source: `backend/src/services/booking-proposals/booking-checkout.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| serviceId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| petIds | ObjectId[] | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| sitterId | ObjectId / null | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| sequence | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| areaCode | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| requestedSitterId | ObjectId / null | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingMode | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| recommendationRef | {matchId,selectedAt,advisory,featureSnapshot} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| assignedFeatureSnapshot | Mixed (decision-time features) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| location | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| addressId | ObjectId (HOME) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| startAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| endAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| evidenceRefs | String[] | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| snapshots | {serviceName,serviceAddress,serviceScope,priceVersion,careMinutes,employeeServiceNetVnd,care,pets,checklistItems,...} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerVisitId | String (care-shift source) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerScheduleConsent | Mixed (directed schedule) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| assignedAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkInAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkOutAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checklist | Mixed (item completion) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| careAcknowledgement | {sitterId,version,acknowledgedAt} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| handoverRequired | Boolean (replacement) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| handoverAccepted | Boolean (replacement) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| completedAt | Date (CHECK_OUT) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[[{"sitterId":1,"state":1,"startAt":1,"endAt":1},{}],[{"state":1,"startAt":1,"_id":1},{}],[{"startAt":1,"_id":1},{}]]`

Index source: `backend/src/services/employee-scheduling/scheduling-storage.service.js`

## PaymentIntent — `paymentintents`

Source: `backend/src/services/booking-proposals/booking-checkout.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| provider | PAYOS | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| providerReference | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| amountVnd | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| currency | VND | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | PENDING / PAID / other guarded state | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| expiresAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paidAt | Date (verified callback) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| linkState | CREATING / READY / RECONCILIATION_REQUIRED | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkoutUrl | HTTPS URL (READY) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentLinkId | String (READY) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[[{"providerReference":1},{"name":"payment_intent_provider_reference","unique":true}]]`

Index source: `backend/src/services/settlements/source-provisioning.js`

## Payment — `payments`

Source: `backend/src/services/providers/payos/mongo-payment-webhook.repository.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId / null | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| intentId | ObjectId / null | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| provider | PAYOS | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| providerEventId | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| providerTransactionReference | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | VERIFIED / RECONCILIATION_REQUIRED | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| receiptMoney | {amountVnd:Integer,currency:VND} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| reconcileReason | String (reconciliation) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| verifiedAt | Date (verified) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| receivedAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[[{"provider":1,"providerEventId":1},{"name":"verified_provider_event","unique":true}],[{"bookingId":1},{"name":"one_verified_booking_receipt","unique":true,"partialFilterExpression":{"state":"VERIFIED"}}],[{"provider":1,"providerTransactionReference":1},{"name":"one_verified_bank_reference","unique":true,"partialFilterExpression":{"state":"VERIFIED","providerTransactionReference":{"$type":"string"}}}]]`

Index source: `backend/src/services/settlements/source-provisioning.js`

## TaxAssessment — `taxassessments`

Source: `backend/src/services/settlements/booking-finance-source.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | CONFIRMED | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| totalTaxVnd | nonnegative safe Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| confirmedBy | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| confirmedAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| evidenceReference | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[[{"bookingId":1},{"name":"one_confirmed_booking_assessment","unique":true,"partialFilterExpression":{"state":"CONFIRMED"}}]]`

Index source: `backend/src/services/settlements/source-provisioning.js`

## Case — `cases`

Source: `backend/src/services/complaints/mongo-complaint.repository.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String (logical complaint identity) | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| visitId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| sitterId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| kind | COMPLAINT / other case contract | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| category | String enum | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| description | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| evidenceRefs | {mediaId,kind,caption}[] | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | OPEN / UNDER_REVIEW / RESOLVED / CLOSED | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | ISO instant String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| resolution | Mixed (audited resolution) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| summary | String (max 500) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| requestedOutcome | String (max 2000) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| serviceName | String / null | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| involvedActorRefs | String[] | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| objectionCount | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| openedAt | ISO instant String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| actorId | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| idempotencyKey | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| financialHold | Boolean (case decision) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| staffNotes | String (private) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| latestObjection | Mixed | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| decision | Mixed | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[]`

Index source: `backend/src/services/complaints/mongo-complaint.repository.js`

## Refund — `refunds`

Source: `backend/src/services/settlements/mongo-earning-sources.repository.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId or legacy contract identity | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition. Refund collection is provisioned/read; full refund writer integration remains pending. |
| bookingId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition. Refund collection is provisioned/read; full refund writer integration remains pending. |
| state | String (financial lock reader contract) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition. Refund collection is provisioned/read; full refund writer integration remains pending. |

Declared/provisioned indexes: `[]`

Index source: `backend/src/services/settlements/mongo-earning-sources.repository.js`

## ContactChangeAudit — `account_contact_audit_events`

Source: `backend/src/services/contact-change-audit.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| eventId | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| logicalOperationId | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| correlationId | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| schemaVersion | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| type | CONTACT_LINKED / CONTACT_REPLACED | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| aggregateType | CONTACT | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| aggregateId | ObjectId | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| aggregateVersion | Integer | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| actorRef | {userId:ObjectId} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| occurredAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| payload | {channel:EMAIL / PHONE} | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[]`

Index source: `backend/src/services/contact-change-audit.service.js`

## CatalogProvisioningRun — `catalogprovisioningruns`

Source: `backend/src/services/demo-catalog-provisioning.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| key | String | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| actorKind | SYSTEM_MIGRATION | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| source | String (source-dependent) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| skipped | Mixed[] (demo catalog) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| retired | String[] (demo catalog) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| authorization | String (initial/detail migration) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| created | Mixed (initial migration) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[[{"key":1},{"unique":true}]]`

Index source: `backend/src/services/initial-catalog-provisioning.service.js`

## DemoPopulationRun — `demopopulationruns`

Source: `backend/src/services/hanoi-demo-population.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| summary | Mixed | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| records | Mixed | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| appliedAt | Date | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| authorization | String (recorded explicit scope) | Repository/service state validation; no Mongoose required flag | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Declared/provisioned indexes: `[]`

Index source: `backend/src/services/hanoi-demo-population.service.js`
