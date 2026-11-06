# Data schema — Report 4

Source: `5381c62e37037eb38503b441b8ce8447a1697be3`. Field tables preserve the school template: Column, Type, Constraints, Notes. No real records are included.

## ApplicationMail — `application_mails`

Source: `backend/src/models/application-mail.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| applicationId | ObjectId | required | See source schema and validators; no SQL FK implied |
| ownerUserId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| applicationVersion | Number | required | See source schema and validators; no SQL FK implied |
| applicationState | String | required; enum=['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'] | See source schema and validators; no SQL FK implied |
| contactCiphertext | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| operationId | String | required | See source schema and validators; no SQL FK implied |
| deliveryState | String | required; enum=['PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'SKIPPED'] | See source schema and validators; no SQL FK implied |
| attempts | Number | Schema permits omission; see command validation | default=0 |
| failureCode | String | Schema permits omission; see command validation | default=None |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |
| nextAttemptAt | Date | required | See source schema and validators; no SQL FK implied |
| leaseUntil | Date | Schema permits omission; see command validation | default=None |
| acceptedAt | Date | Schema permits omission; see command validation | default=None |

Indexes: `[[{"applicationId":1},{}],[{"deliveryState":1,"nextAttemptAt":1},{}]]`

## ProfileAvatar — `profileavatars`

Source: `backend/src/models/avatar.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity; required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=0 | See source schema and validators; no SQL FK implied |
| body | Buffer | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| fingerprint | String | required | Excluded by default projection; explicit authorized read only |
| present | Boolean | required | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## CustomerVisitReview — `reviews`

Source: `backend/src/models/customer-review.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| visitId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| customerId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sitterId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| direction | String | enum=['CUSTOMER_TO_SITTER'] | See source schema and validators; no SQL FK implied |
| rating | Number | min=1; max=5; validators=user defined | See source schema and validators; no SQL FK implied |
| comment | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| tags | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| visibility | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| verifiedSource | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |

Indexes: `[[{"visitId":1,"direction":1},{"unique":true}]]`

## CustomerReviewCommand — `customerreviewcommands`

Source: `backend/src/models/customer-review.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| payloadHash | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| result | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |

Indexes: `[]`

## DecisionSnapshot — `aidecisions`

Source: `backend/src/models/decision-snapshot.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ownerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| kind | String | required; enum=['QUOTE', 'MATCH'] | See source schema and validators; no SQL FK implied |
| requestHash | String | required | See source schema and validators; no SQL FK implied |
| expiresAt | Date | required | See source schema and validators; no SQL FK implied |
| snapshot | Mixed | required | Excluded by default projection; explicit authorized read only; flexible BSON; service validation remains authoritative |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"ownerId":1},{}],[{"ownerId":1,"kind":1,"createdAt":-1},{}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

## BookingEarningSnapshot — `bookingearningsnapshots`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| bookingId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| completedAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| weekKey | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| ordinal | Number | required; min=1; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| serviceBasisVnd | Number | required; min=0; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| feeBasisPoints | Number | required; min=0; max=10000; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| commissionVnd | Number | required; min=0; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| confirmedTaxVnd | Number | required; min=0; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| sitterTaxCostVnd | Number | required; min=0; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| platformTaxCostVnd | Number | required; min=0; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| accruedVnd | Number | required; min=0; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| policyVersion | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| allocationPolicyVersion | String | immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| decisionVersion | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sourceVersion | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sourceHash | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| completionReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| paymentReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| allocationReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| assessmentReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| createdAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"id":1},{"unique":true}],[{"sitterId":1,"bookingId":1},{"unique":true}],[{"sitterId":1,"weekKey":1,"ordinal":1},{"unique":true}]]`

## WeeklyBookingCounter — `weeklybookingcounters`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| sitterId | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| weekKey | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| count | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"sitterId":1,"weekKey":1},{"unique":true}]]`

## CompletedBookingOrdinal — `completedbookingordinals`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| bookingId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| completedAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| weekKey | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| ordinal | Number | required; min=1; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| completionReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"sitterId":1,"bookingId":1},{"unique":true}],[{"sitterId":1,"weekKey":1,"ordinal":1},{"unique":true}]]`

## EarningAccrualOutbox — `earningaccrualoutboxes`

Source: `backend/src/models/earning-accrual.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| eventId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| type | String | required; enum=['EARNING_ACCRUED']; immutable | See source schema and validators; no SQL FK implied |
| snapshotId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['PENDING', 'PUBLISHED'] | See source schema and validators; no SQL FK implied |
| createdAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"eventId":1},{"unique":true}],[{"state":1,"createdAt":1},{}]]`

## EmployeeAvailability — `employeeavailabilities`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| zone | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| workingWindows | Array[Mixed] | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| areas | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| dayOffDates | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| effectiveFrom | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## EmployeeAvailabilityRevision — `employeeavailabilityrevisions`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| sitterId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| effectiveFrom | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| workingWindows | Array[Mixed] | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"sitterId":1,"effectiveFrom":-1,"version":-1},{"unique":true}]]`

## EmployeeScheduleCommand — `employeeschedulecommands`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| fingerprint | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| result | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| createdAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## EmployeeVisitOffer — `employeevisitoffers`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| visitId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sitterId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| offeredAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| deadline | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| startAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| endAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| serviceName | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| areaCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| pets | Array[Mixed] | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| decidedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| originRouteRequired | Boolean | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| featureSnapshot | Mixed | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; flexible BSON; service validation remains authoritative |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"sitterId":1,"_id":-1},{}],[{"visitId":1,"state":1,"deadline":1},{}]]`

## EmployeeScheduleEvent — `employeescheduleevents`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| type | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| actorId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sitterId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| visitId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| offerId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| at | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| detail | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## EmployeeScheduleProposal — `employeescheduleproposals`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| customerId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| bookingId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| visitId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sitterId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| areaCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| previousAreaCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| areaLabel | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| slots | Array[Mixed] | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| availabilityVersion | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| visitVersion | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| expiresAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| priceSnapshot | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| petSnapshots | Array[Mixed] | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| paymentState | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| paymentRequired | Boolean | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdBy | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| confirmedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| selectedSlot | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"customerId":1,"createdAt":-1,"_id":-1},{}]]`

## EmployeeVisitTravel — `employeevisittravels`

Source: `backend/src/models/employee-scheduling.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| sitterId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sharing | Boolean | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sessionId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| observedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| coordinates | Array[Number] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| accuracyMeters | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| expiresAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"expiresAt":1},{"expireAfterSeconds":0}]]`

## EmploymentDocument — `employmentdocuments`

Source: `backend/src/models/employment-document.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| applicationId | ObjectId | required | See source schema and validators; no SQL FK implied |
| applicationVersion | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| revision | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| reference | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| employeeCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| templateVersion | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['DRAFT', 'ISSUED', 'SIGNED', 'ACTIVATED'] | See source schema and validators; no SQL FK implied |
| encryptedTerms | String | required | Excluded by default projection; explicit authorized read only |
| termsHash | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| issuedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| signedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| verifiedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| verifiedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| archiveReference | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| employeeId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"applicationId":1,"revision":1},{"unique":true}],[{"reference":1},{"unique":true}]]`

## EmploymentDocumentCounter — `employmentdocumentcounters`

Source: `backend/src/models/employment-document.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| value | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## EmploymentDocumentCommand — `employmentdocumentcommands`

Source: `backend/src/models/employment-document.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| fingerprint | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| documentId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## FinanceSourceCommand — `financesourcecommands`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| fingerprint | String | required | See source schema and validators; no SQL FK implied |
| result | Mixed | required | flexible BSON; service validation remains authoritative |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## FinanceSourceEvent — `financesourceevents`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| type | String | required | See source schema and validators; no SQL FK implied |
| bookingId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| actorId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| resourceId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| at | Date | required | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## EarningAccrualTask — `earningaccrualtasks`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| bookingId | String | required | See source schema and validators; no SQL FK implied |
| sitterId | String | required | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['PENDING', 'DONE'] | See source schema and validators; no SQL FK implied |
| revision | Number | required | See source schema and validators; no SQL FK implied |
| nextAttemptAt | Date | required | See source schema and validators; no SQL FK implied |
| lastCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| updatedAt | Date | required | See source schema and validators; no SQL FK implied |

Indexes: `[[{"state":1,"nextAttemptAt":1},{}]]`

## CareMediaBinding — `caremediabindings`

Source: `backend/src/models/finance-source.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| visitId | String | required | See source schema and validators; no SQL FK implied |
| kind | String | required; enum=['CHECK_IN', 'CHECK_OUT'] | See source schema and validators; no SQL FK implied |
| ownerId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| contentDigest | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |

Indexes: `[[{"visitId":1,"kind":1},{"unique":true}]]`

## Contact — `contacts`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| userId | ObjectId | required | See source schema and validators; no SQL FK implied |
| channel | String | required; enum=['EMAIL', 'PHONE'] | See source schema and validators; no SQL FK implied |
| canonicalCiphertext | String | required | Excluded by default projection; explicit authorized read only |
| lookupKey | String | required | Excluded by default projection; explicit authorized read only |
| state | String | required; enum=['VERIFIED', 'REPLACED'] | See source schema and validators; no SQL FK implied |
| verifiedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"userId":1},{}],[{"channel":1,"lookupKey":1},{"unique":true,"partialFilterExpression":{"state":"VERIFIED"}}]]`

## OtpChallenge — `otpchallenges`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| challengeId | String | required | See source schema and validators; no SQL FK implied |
| contactLookup | String | required | Excluded by default projection; explicit authorized read only |
| channel | String | required; enum=['EMAIL', 'PHONE'] | See source schema and validators; no SQL FK implied |
| purpose | String | required; enum=['REGISTER', 'LOGIN', 'CONTACT_CHANGE', 'APPLICATION_STATUS'] | See source schema and validators; no SQL FK implied |
| codeDigest | String | required | Excluded by default projection; explicit authorized read only |
| expiresAt | Date | required | See source schema and validators; no SQL FK implied |
| resendAt | Date | required | See source schema and validators; no SQL FK implied |
| failedCount | Number | required; min=0 | default=0 |
| requesterSessionId | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=None |
| requesterUserId | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=None |
| usedAt | Date | Schema permits omission; see command validation | default=None |
| invalidationReason | String | enum=['RESENT', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED', None] | default=None |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"challengeId":1},{"unique":true}],[{"contactLookup":1,"purpose":1,"usedAt":1,"createdAt":-1},{}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

## OtpThrottle — `otpthrottles`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| contactLookup | String | required | Excluded by default projection; explicit authorized read only |
| sentAt | Array[Date] | Schema permits omission; see command validation | default=[] |
| lastSentAt | Date | Schema permits omission; see command validation | default=None |
| failedCount | Number | required; min=0 | default=0 |
| lockedUntil | Date | Schema permits omission; see command validation | default=None |
| expiresAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"contactLookup":1},{"unique":true}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

## AuthSession — `authsessions`

Source: `backend/src/models/identity.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| sessionId | String | required | See source schema and validators; no SQL FK implied |
| userId | ObjectId | required | See source schema and validators; no SQL FK implied |
| tokenDigest | String | required | Excluded by default projection; explicit authorized read only |
| csrfDigest | String | required | Excluded by default projection; explicit authorized read only |
| authEpochAtIssue | Number | required; min=0 | See source schema and validators; no SQL FK implied |
| expiresAt | Date | required | See source schema and validators; no SQL FK implied |
| revokedAt | Date | Schema permits omission; see command validation | default=None |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"sessionId":1},{"unique":true}],[{"tokenDigest":1},{"unique":true}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

## Notification — `notifications`

Source: `backend/src/models/notification.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| eventId | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| recipientId | String | required | See source schema and validators; no SQL FK implied |
| role | String | Schema permits omission; see command validation | default=None |
| eventType | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| title | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| message | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| channel | String | Schema permits omission; see command validation | default=IN_APP |
| deepLink | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| metadata | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |
| readAt | Date | Schema permits omission; see command validation | default=None |

Indexes: `[[{"recipientId":1,"createdAt":-1,"_id":-1},{}]]`

## NotificationEvent — `notificationevents`

Source: `backend/src/models/notification.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| fingerprint | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| notificationIds | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## EmploymentContract — `employmentcontracts`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| workScheduleMode | String | enum=['SELF_REGISTERED'] | See source schema and validators; no SQL FK implied |
| minimumWeeklyMinutes | Number | min=1; max=2880 | See source schema and validators; no SQL FK implied |
| documentId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| employeeCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| schedule | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| paySchedule | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| monthlyAllowanceVnd | Number | min=0; validators=user defined | See source schema and validators; no SQL FK implied |
| employeeId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| employmentType | String | required; enum=['FULL_TIME', 'PART_TIME'] | See source schema and validators; no SQL FK implied |
| salaryBasis | String | required; enum=['GROSS', 'NET'] | See source schema and validators; no SQL FK implied |
| monthlyBaseVnd | Number | required; min=0; validators=user defined | See source schema and validators; no SQL FK implied |
| payCycle | String | required; enum=['MONTHLY', 'WEEKLY'] | See source schema and validators; no SQL FK implied |
| weeklyMinutes | Number | required; min=1; max=2880; validators=user defined | See source schema and validators; no SQL FK implied |
| signedAt | Date | required | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| endsAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| contractReference | String | required; validators=maxlength | Excluded by default projection; explicit authorized read only |
| workplaceRegion | Number | required; enum=[1, 2, 3, 4] | See source schema and validators; no SQL FK implied |
| workplaceReference | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| verifiedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| recordedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"employeeId":1,"version":1},{"unique":true}],[{"employeeId":1,"effectiveAt":-1},{}]]`

## SalaryAdvance — `salaryadvances`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| employeeId | ObjectId | required | See source schema and validators; no SQL FK implied |
| contractId | ObjectId | required | See source schema and validators; no SQL FK implied |
| monthKey | String | required | See source schema and validators; no SQL FK implied |
| amountVnd | Number | required; min=0; validators=user defined | See source schema and validators; no SQL FK implied |
| status | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PAID'] | See source schema and validators; no SQL FK implied |
| version | Number | min=0; validators=user defined | default=0 |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| decisionReason | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| requestedAt | Date | required | See source schema and validators; no SQL FK implied |
| decidedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| decidedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| paidBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| paidAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| transferReference | String | validators=maxlength | Excluded by default projection; explicit authorized read only |
| policyVersion | String | required | See source schema and validators; no SQL FK implied |
| settlementPeriod | String | required | See source schema and validators; no SQL FK implied |
| settlementConsentReference | String | required; validators=maxlength | Excluded by default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"employeeId":1,"monthKey":1,"status":1,"requestedAt":-1},{}],[{"employeeId":1,"requestedAt":-1,"_id":-1},{}],[{"status":1,"requestedAt":-1,"_id":-1},{}],[{"transferReference":1},{"unique":true,"partialFilterExpression":{"transferReference":{"$type":"string"}}}]]`

## PayrollMonthGuard — `payrollmonthguards`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | default=0 |
| pendingId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| approvedId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PayrollCommand — `payrollcommands`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| fingerprint | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sourceRequestHash | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| result | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| createdAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PayrollEvent — `payrollevents`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| employeeId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| resourceId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| actorId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| type | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| reason | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| at | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PayrollServiceCredit — `payrollservicecredits`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| visitId | ObjectId | required | See source schema and validators; no SQL FK implied |
| bookingId | ObjectId | required | See source schema and validators; no SQL FK implied |
| employeeId | ObjectId | required | See source schema and validators; no SQL FK implied |
| completedAt | Date | required | See source schema and validators; no SQL FK implied |
| serviceNetVnd | Number | required; min=0; validators=user defined | See source schema and validators; no SQL FK implied |
| careMinutes | Number | required; min=0; max=1440; validators=user defined | See source schema and validators; no SQL FK implied |
| onTime | Boolean | required | See source schema and validators; no SQL FK implied |
| reportsComplete | Boolean | required | See source schema and validators; no SQL FK implied |
| sourceVersion | Number | required | See source schema and validators; no SQL FK implied |
| policyVersion | String | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"visitId":1},{"unique":true}],[{"employeeId":1,"completedAt":1,"_id":1},{}]]`

## PayrollStatement — `payrollstatements`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| reference | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| employeeName | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| employeeCode | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| employeeId | ObjectId | required | See source schema and validators; no SQL FK implied |
| contractId | ObjectId | required | See source schema and validators; no SQL FK implied |
| periodStart | Date | required | See source schema and validators; no SQL FK implied |
| periodEnd | Date | required | See source schema and validators; no SQL FK implied |
| monthKey | String | required | See source schema and validators; no SQL FK implied |
| dueAt | Date | required | See source schema and validators; no SQL FK implied |
| payCycle | String | required; enum=['MONTHLY', 'WEEKLY'] | See source schema and validators; no SQL FK implied |
| status | String | required; enum=['PREPARED', 'APPROVED', 'PAID', 'VOIDED'] | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | default=0 |
| breakdown | Mixed | required | flexible BSON; service validation remains authoritative |
| assessment | Mixed | required | Excluded by default projection; explicit authorized read only; flexible BSON; service validation remains authoritative |
| creditIds | Array[ObjectId] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| advanceIds | Array[ObjectId] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| preparedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| preparedAt | Date | required | See source schema and validators; no SQL FK implied |
| approvedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| approvedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| paidBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| paidAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| voidedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| voidedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| voidReason | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| transferReference | String | validators=maxlength | Excluded by default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"employeeId":1,"periodStart":1,"periodEnd":1},{"name":"active_payroll_period","unique":true,"partialFilterExpression":{"status":{"$in":["PREPARED","APPROVED","PAID"]}}}],[{"transferReference":1},{"unique":true,"partialFilterExpression":{"transferReference":{"$type":"string"}}}],[{"employeeId":1,"periodEnd":-1,"_id":-1},{}],[{"periodEnd":-1,"_id":-1},{}]]`

## PayrollAdjustment — `payrolladjustments`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| employeeId | ObjectId | required | See source schema and validators; no SQL FK implied |
| statementId | ObjectId | required | See source schema and validators; no SQL FK implied |
| statementVersion | Number | required | See source schema and validators; no SQL FK implied |
| direction | String | required; enum=['SUPPLEMENT', 'RECOVERY'] | See source schema and validators; no SQL FK implied |
| amountVnd | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| assessmentReference | String | required; validators=maxlength | Excluded by default projection; explicit authorized read only |
| status | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'RECONCILED'] | See source schema and validators; no SQL FK implied |
| version | Number | Schema permits omission; see command validation | default=0 |
| requestedAt | Date | required | See source schema and validators; no SQL FK implied |
| preparedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| decidedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| decidedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| decisionReason | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| resolvedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| resolvedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| transferReference | String | validators=maxlength | Excluded by default projection; explicit authorized read only |
| agreementReference | String | validators=maxlength | Excluded by default projection; explicit authorized read only |
| resolutionReference | String | validators=maxlength | Excluded by default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"statementId":1,"assessmentReference":1},{"unique":true}],[{"employeeId":1,"requestedAt":-1,"_id":-1},{}],[{"requestedAt":-1,"_id":-1},{}]]`

## PayrollSourceClaim — `payrollsourceclaims`

Source: `backend/src/models/payroll.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| statementId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| advanceId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| adjustmentId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## Pet — `pets`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ownerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| name | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| species | String | required; enum=['DOG', 'CAT'] | See source schema and validators; no SQL FK implied |
| breedCode | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| weightKg | Number | required; min=0.1; max=150 | See source schema and validators; no SQL FK implied |
| traits | Array[String] | Schema permits omission; see command validation | default=[] |
| careNeedsConfirmed | Boolean | Schema permits omission; see command validation | default=False |
| ageMonths | Number | min=0; max=600 | See source schema and validators; no SQL FK implied |
| sex | String | enum=['MALE', 'FEMALE', 'UNKNOWN'] | default=UNKNOWN |
| careProfile | Map | Schema permits omission; see command validation | default={} |
| careProfile.$* | Embedded | Schema permits omission; see command validation | nested path; not a separate SQL column |
| careProfile.$*.status | String | required; enum=['KNOWN', 'UNKNOWN', 'NOT_PROVIDED'] | nested path; not a separate SQL column |
| careProfile.$*.value | String | validators=maxlength | nested path; not a separate SQL column |
| state | String | enum=['ACTIVE', 'ARCHIVED'] | default=ACTIVE |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"ownerId":1},{}],[{"ownerId":1,"state":1,"_id":1},{}]]`

## CustomerAddress — `customeraddresses`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ownerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| label | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| location | String | required; validators=maxlength | Excluded by default projection; explicit authorized read only |
| point | Embedded | required | Excluded by default projection; explicit authorized read only |
| point.type | String | enum=['Point'] | default=Point; nested path; not a separate SQL column |
| point.coordinates | Array[Number] | required; validators=user defined | nested path; not a separate SQL column |
| areaCode | String | required | See source schema and validators; no SQL FK implied |
| pointConfirmedAt | Date | required | See source schema and validators; no SQL FK implied |
| privateAccessNotes | String | validators=maxlength | Excluded by default projection; explicit authorized read only; default= |
| state | String | enum=['ACTIVE', 'ARCHIVED'] | default=ACTIVE |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"ownerId":1},{}],[{"areaCode":1},{}],[{"point":"2dsphere"},{}]]`

## PetCareCommand — `petcarecommands`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity; required | See source schema and validators; no SQL FK implied |
| fingerprint | String | required | See source schema and validators; no SQL FK implied |
| result | Mixed | required | flexible BSON; service validation remains authoritative |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PetTrait — `aitraits`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required | See source schema and validators; no SQL FK implied |
| label | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| species | Array[String] | required | See source schema and validators; no SQL FK implied |
| explanation | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| active | Boolean | Schema permits omission; see command validation | default=True |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"code":1},{"unique":true}]]`

## PetBreed — `aibreeds`

Source: `backend/src/models/pet-care.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required | See source schema and validators; no SQL FK implied |
| name | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| species | String | required; enum=['DOG', 'CAT'] | See source schema and validators; no SQL FK implied |
| active | Boolean | Schema permits omission; see command validation | default=True |
| source | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"code":1},{"unique":true}]]`

## PricingPolicy — `aipricingpolicies`

Source: `backend/src/models/pricing.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| status | String | enum=['DRAFT', 'APPROVED', 'RETIRED'] | default=DRAFT |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| approvedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| approvedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| approvalSource | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| billingMode | String | enum=['PER_UNIT', 'PER_VISIT', 'PER_DAY', 'PER_KM'] | default=PER_UNIT |
| unitMinutes | Number | required; min=1; max=1440; validators=user defined | See source schema and validators; no SQL FK implied |
| orderStepVnd | Number | min=1; max=9007199254740991; validators=user defined | default=5000000 |
| orderStepBps | Number | min=0; max=10000; validators=user defined | default=200 |
| maxOrderTierBps | Number | min=0; max=50000; validators=user defined | default=2000 |
| maxPets | Number | min=1; max=10; validators=user defined | default=4 |
| extraPetBps | Number | min=0; max=20000; validators=user defined | default=0 |
| maxSurchargeBps | Number | min=0; max=50000; validators=user defined | default=20000 |
| groupStrategy | String | enum=['REJECT', 'MAX'] | default=REJECT |
| comboPerVisitBps | Number | min=0; max=1000; validators=user defined | default=0 |
| comboMaxBps | Number | min=0; max=1000; validators=user defined | default=0 |
| rules | Array[subdocument] | Schema permits omission; see command validation | default=[] |
| rules.code | String | required; validators=maxlength | nested path; not a separate SQL column |
| rules.label | String | required; validators=maxlength | nested path; not a separate SQL column |
| rules.explanation | String | required; validators=maxlength | nested path; not a separate SQL column |
| rules.scope | String | required; enum=['PET', 'VISIT'] | nested path; not a separate SQL column |
| rules.bps | Number | min=0; max=20000; validators=user defined | default=0; nested path; not a separate SQL column |
| rules.flatVnd | Number | min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a separate SQL column |
| rules.exclusiveGroup | String | Schema permits omission; see command validation | nested path; not a separate SQL column |
| rules.when | Embedded | Schema permits omission; see command validation | nested path; not a separate SQL column |
| rules.when.species | String | enum=['DOG', 'CAT'] | nested path; not a separate SQL column |
| rules.when.breedCodes | Array[String] | Schema permits omission; see command validation | nested path; not a separate SQL column |
| rules.when.traitCode | String | Schema permits omission; see command validation | nested path; not a separate SQL column |
| rules.when.minWeightKg | Number | min=0 | nested path; not a separate SQL column |
| rules.when.maxWeightKg | Number | min=0 | nested path; not a separate SQL column |
| rules.when.minWeightExclusive | Boolean | Schema permits omission; see command validation | nested path; not a separate SQL column |
| rules.when.maxWeightInclusive | Boolean | Schema permits omission; see command validation | nested path; not a separate SQL column |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"status":1,"effectiveAt":-1},{}]]`

## ApplicantDocument — `applicantdocuments`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| ownerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| inputDigest | String | required | Excluded by default projection; explicit authorized read only |
| storageRef | String | required | Excluded by default projection; explicit authorized read only |
| contentType | String | enum=['image/png', 'image/jpeg'] | See source schema and validators; no SQL FK implied |
| contentDigest | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| byteLength | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['PENDING', 'READY'] | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| __v | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## ApplicantDocumentQuota — `applicantdocumentquotas`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| count | Number | required; min=0 | See source schema and validators; no SQL FK implied |
| __v | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PrivateImage — `privateimages`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| ownerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| inputDigest | String | required | Excluded by default projection; explicit authorized read only |
| storageRef | String | required | Excluded by default projection; explicit authorized read only |
| contentType | String | enum=['image/png', 'image/jpeg'] | See source schema and validators; no SQL FK implied |
| contentDigest | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| byteLength | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['PENDING', 'READY'] | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| __v | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PrivateImageQuota — `privateimagequotas`

Source: `backend/src/models/private-image.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| count | Number | required; min=0 | See source schema and validators; no SQL FK implied |
| __v | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## ProductPhoto — `productphotos`

Source: `backend/src/models/product-photo.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| productId | ObjectId | required | See source schema and validators; no SQL FK implied |
| digest | String | required; validators=regexp | See source schema and validators; no SQL FK implied |
| content | Buffer | required | Excluded by default projection; explicit authorized read only |
| byteLength | Number | required; min=1; max=1048576; validators=user defined | See source schema and validators; no SQL FK implied |
| width | Number | required; min=1; max=1600; validators=user defined | See source schema and validators; no SQL FK implied |
| height | Number | required; min=1; max=1600; validators=user defined | See source schema and validators; no SQL FK implied |
| uploadedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"productId":1,"digest":1},{"unique":true}]]`

## Product — `products`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| name | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| category | String | required; enum=['FOOD', 'ACCESSORY'] | See source schema and validators; no SQL FK implied |
| petType | String | required; enum=['DOG', 'CAT'] | See source schema and validators; no SQL FK implied |
| description | String | validators=maxlength | default= |
| photos | Array[String] | Schema permits omission; see command validation | default=[] |
| catalogSource | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| sampleCatalog | Boolean | Schema permits omission; see command validation | default=False |
| sellingPrice | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| stockOnHand | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| quantityHeld | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| visible | Boolean | Schema permits omission; see command validation | default=True |
| deletedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| deletedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| deletionReason | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| detailsVersion | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"code":1},{"unique":true}],[{"visible":1,"category":1,"petType":1,"name":1},{}]]`

## Supplier — `suppliers`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| name | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| nameKey | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| contactName | String | validators=maxlength | default= |
| phone | String | validators=maxlength | default= |
| email | String | validators=maxlength | default= |
| productIds | Array[ObjectId] | validators=user defined | default=[] |
| status | String | enum=['ACTIVE', 'STOPPED'] | default=ACTIVE |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"nameKey":1},{"unique":true}],[{"status":1,"nameKey":1},{}]]`

## ProductCart — `productcarts`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| customerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| lines | Array[subdocument] | Schema permits omission; see command validation | default=[] |
| lines.productId | ObjectId | required | nested path; not a separate SQL column |
| lines.quantity | Number | required; min=1; max=99; validators=user defined | nested path; not a separate SQL column |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"customerId":1},{"unique":true}]]`

## ProductOrder — `productorders`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| customerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| lines | Array[subdocument] | required | See source schema and validators; no SQL FK implied |
| lines.productId | ObjectId | required | nested path; not a separate SQL column |
| lines.productCode | String | required; validators=maxlength | nested path; not a separate SQL column |
| lines.productName | String | required; validators=maxlength | nested path; not a separate SQL column |
| lines.quantity | Number | required; min=1; max=99; validators=user defined | nested path; not a separate SQL column |
| lines.sellingPriceWhenOrdered | Number | required; min=0; max=9007199254740991; validators=user defined | nested path; not a separate SQL column |
| lines.resellableQuantity | Number | min=0; max=99; validators=user defined | nested path; not a separate SQL column |
| receiveMethod | String | required; enum=['DELIVERY', 'PICKUP'] | See source schema and validators; no SQL FK implied |
| deliveryAddress | Embedded | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| deliveryAddress.addressId | ObjectId | required | nested path; not a separate SQL column |
| deliveryAddress.label | String | required; validators=maxlength | nested path; not a separate SQL column |
| deliveryAddress.location | String | required; validators=maxlength | nested path; not a separate SQL column |
| deliveryAddress.areaCode | String | required; validators=maxlength | nested path; not a separate SQL column |
| subtotal | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| shippingFee | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| total | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| paymentMethod | String | required; enum=['COD', 'PAY_AT_SHOP', 'PREPAID'] | See source schema and validators; no SQL FK implied |
| paid | Boolean | Schema permits omission; see command validation | default=False |
| trackingCode | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| status | String | enum=['PLACED', 'HANDED_TO_CARRIER', 'DELIVERED', 'BEING_RETURNED', 'RETURNED', 'READY', 'PICKED_UP', 'CANCELLED'] | default=PLACED |
| deliveredAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| carrierReturnReason | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| returnReason | String | enum=['CUSTOMER_REFUSED', 'CARRIER_UNDELIVERABLE', 'SHOP_FAULT'] | See source schema and validators; no SQL FK implied |
| returnNote | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| returnedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| refundMarked | Boolean | Schema permits omission; see command validation | default=False |
| idempotencyKey | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestFingerprint | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"code":1},{"unique":true}],[{"customerId":1,"createdAt":-1},{}],[{"lines.productId":1},{}],[{"customerId":1,"idempotencyKey":1},{"unique":true}],[{"status":1,"createdAt":-1},{}]]`

## ProductCustomerRefusal — `productcustomerrefusals`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| customerId | ObjectId | required | See source schema and validators; no SQL FK implied |
| orderId | ObjectId | required | See source schema and validators; no SQL FK implied |
| reason | String | required; enum=['REFUSED_DELIVERY'] | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"orderId":1},{"unique":true}],[{"customerId":1},{}]]`

## ProductCounter — `productcounters`

Source: `backend/src/models/product.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity; required | See source schema and validators; no SQL FK implied |
| value | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[]`

## PublicPolicyVersion — `publicpolicyversions`

Source: `backend/src/models/public-policy-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| slug | String | required; enum=['terms', 'privacy', 'contact-verification', 'service-areas', 'booking', 'payments', 'cancellations-refunds', 'care-evidence', 'safety-complaints', 'sitter-onboarding', 'settlement-and-ratings', 'pwa']; immutable | See source schema and validators; no SQL FK implied |
| versionId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| status | String | required; enum=['DRAFT', 'APPROVED', 'RETIRED'] | See source schema and validators; no SQL FK implied |
| title | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| purpose | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| expiresAt | Date | immutable | default=None |
| approvedAt | Date | Schema permits omission; see command validation | default=None |
| approvedBy | String | validators=maxlength | default=None |
| sourceRef | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| contentHash | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sections | Array[subdocument] | required; immutable | See source schema and validators; no SQL FK implied |
| sections.heading | String | required; validators=maxlength | nested path; not a separate SQL column |
| sections.paragraphs | Array[String] | Schema permits omission; see command validation | nested path; not a separate SQL column |
| sections.items | Array[String] | Schema permits omission; see command validation | nested path; not a separate SQL column |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"slug":1,"versionId":1},{"unique":true}],[{"slug":1,"status":1,"effectiveAt":-1},{}]]`

## ServiceAudit — `serviceaudits`

Source: `backend/src/models/service-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See source schema and validators; no SQL FK implied |
| action | String | required; enum=['SERVICE_CREATED', 'SERVICE_VERSIONED', 'POLICY_VERSIONED'] | See source schema and validators; no SQL FK implied |
| resourceType | String | required; enum=['service', 'service-policy'] | See source schema and validators; no SQL FK implied |
| resourceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1 | See source schema and validators; no SQL FK implied |
| changedFields | Array[String] | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

## ServicePolicyVersion — `servicepolicyversions`

Source: `backend/src/models/service-policy-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['PUBLISHED', 'WITHDRAWN'] | See source schema and validators; no SQL FK implied |
| title | String | validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| body | String | validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| changedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| recordedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"effectiveAt":1},{"unique":true}],[{"state":1,"effectiveAt":1,"serviceId":1},{}]]`

## ServicePresentation — `servicepresentations`

Source: `backend/src/models/service-presentation.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| category | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| locations | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| durationMinutes | Number | min=1; max=1440; validators=user defined | See source schema and validators; no SQL FK implied |
| preparation | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| exclusions | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| faq | Array[subdocument] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| faq.question | String | required; validators=maxlength | nested path; not a separate SQL column |
| faq.answer | String | required; validators=maxlength | nested path; not a separate SQL column |
| provisioningRunId | ObjectId | required | See source schema and validators; no SQL FK implied |
| updatedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"serviceId":1},{"unique":true}]]`

## ServicePriceAudit — `servicepriceaudits`

Source: `backend/src/models/service-price-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See source schema and validators; no SQL FK implied |
| action | String | required; enum=['SERVICE_PRICE_VERSIONED'] | See source schema and validators; no SQL FK implied |
| resourceType | String | required; enum=['service-price'] | See source schema and validators; no SQL FK implied |
| resourceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1 | See source schema and validators; no SQL FK implied |
| changedFields | Array[String] | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

## ServicePriceVersion — `servicepriceversions`

Source: `backend/src/models/service-price-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| currency | String | required; enum=['VND'] | default=VND |
| unitLabel | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| changedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| recordedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"effectiveAt":1},{"unique":true}],[{"serviceId":1,"effectiveAt":-1,"version":-1},{}]]`

## ServiceVersion — `serviceversions`

Source: `backend/src/models/service-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| serviceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| name | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| description | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| scope | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| species | Array[String] | required; validators=user defined | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| changedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| recordedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"serviceId":1,"version":1},{"unique":true}],[{"serviceId":1,"effectiveAt":1},{"unique":true}],[{"state":1,"effectiveAt":1,"serviceId":1},{}]]`

## Service — `services`

Source: `backend/src/models/service.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| code | String | required; validators=minlength,maxlength,regexp | See source schema and validators; no SQL FK implied |
| createdBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"code":1},{"unique":true}]]`

## SettlementRequest — `settlementrequests`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestWeekKey | String | required; immutable; validators=regexp | See source schema and validators; no SQL FK implied |
| startsAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| endsAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| earningIds | Array[String] | required; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| earningSnapshots | Array[subdocument] | immutable | See source schema and validators; no SQL FK implied |
| earningSnapshots.earningId | String | required; validators=maxlength | nested path; not a separate SQL column |
| earningSnapshots.visitId | String | validators=maxlength | default=None; nested path; not a separate SQL column |
| earningSnapshots.earningPeriodKey | String | required; validators=maxlength | nested path; not a separate SQL column |
| earningSnapshots.amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | nested path; not a separate SQL column |
| earningSnapshots.pendingVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a separate SQL column |
| earningSnapshots.heldVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a separate SQL column |
| earningSnapshots.availableVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a separate SQL column |
| earningSnapshots.reservedVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a separate SQL column |
| earningSnapshots.paidVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0; nested path; not a separate SQL column |
| earningSnapshots.explanation | String | validators=maxlength | default=None; nested path; not a separate SQL column |
| earningSnapshots.ledgerReference | String | validators=maxlength | default=None; nested path; not a separate SQL column |
| earningSnapshots.transferRecordedAt | Date | Schema permits omission; see command validation | default=None; nested path; not a separate SQL column |
| amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| currency | String | required; enum=['VND']; immutable | default=VND |
| status | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'TRANSFER_PENDING', 'PAID'] | See source schema and validators; no SQL FK implied |
| version | Number | required; min=0; validators=user defined | See source schema and validators; no SQL FK implied |
| submittedAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| policyVersion | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| decisionVersion | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| decision | Mixed | Schema permits omission; see command validation | default=None; flexible BSON; service validation remains authoritative |
| transfer | Embedded | Schema permits omission; see command validation | default=None |
| transfer.outcome | String | required; enum=['CONFIRMED', 'UNKNOWN', 'AMOUNT_MISMATCH'] | nested path; not a separate SQL column |
| transfer.reference | String | required; validators=maxlength | nested path; not a separate SQL column |
| transfer.evidenceReference | String | required; validators=maxlength | nested path; not a separate SQL column |
| transfer.amountVnd | Number | min=0; max=9007199254740991; validators=user defined | default=None; nested path; not a separate SQL column |
| transfer.paidAt | Date | Schema permits omission; see command validation | default=None; nested path; not a separate SQL column |
| transfer.recordedBy | String | required; validators=maxlength | nested path; not a separate SQL column |
| transfer.recordedAt | Date | required | nested path; not a separate SQL column |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"id":1},{"unique":true}],[{"sitterId":1,"requestWeekKey":1},{"unique":true}],[{"status":1,"submittedAt":-1,"id":-1},{}],[{"sitterId":1,"submittedAt":-1,"id":-1},{}]]`

## SettlementWeekClaim — `settlementweekclaims`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestWeekKey | String | required; immutable; validators=regexp | See source schema and validators; no SQL FK implied |
| startsAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| endsAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"id":1},{"unique":true}],[{"sitterId":1,"requestWeekKey":1},{"unique":true}]]`

## Earning — `earnings`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| earningId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| visitId | String | immutable; validators=maxlength | default=None |
| bookingId | String | immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| completedAt | Date | immutable | See source schema and validators; no SQL FK implied |
| sourceSnapshotId | String | immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| earningPeriodKey | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| accruedVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| pendingVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| heldVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| availableVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| reservedVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| paidVnd | Number | required; min=0; max=9007199254740991; validators=user defined | default=0 |
| explanation | String | validators=maxlength | default=None |
| ledgerReference | String | validators=maxlength | default=None |
| transferRecordedAt | Date | Schema permits omission; see command validation | default=None |
| state | String | required; enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID'] | See source schema and validators; no SQL FK implied |
| reservation.requestId | String | validators=maxlength | default=None; nested path; not a separate SQL column |
| reservation.reservedAt | Date | Schema permits omission; see command validation | default=None; nested path; not a separate SQL column |
| version | Number | required; min=0; validators=user defined | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"earningId":1},{"unique":true}],[{"sitterId":1,"state":1,"earningPeriodKey":1,"earningId":1},{}],[{"sitterId":1,"visitId":1},{"unique":true,"name":"earning_visit_owner_v2","partialFilterExpression":{"visitId":{"$type":"string"}}}],[{"reservation.requestId":1,"state":1},{}],[{"sitterId":1,"completedAt":-1,"earningId":-1},{}]]`

## FinancialLock — `financiallocks`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| resourceType | String | required; enum=['EARNING', 'ALLOCATION', 'REFUND', 'CASE'] | See source schema and validators; no SQL FK implied |
| resourceId | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| lockType | String | required; enum=['REFUND', 'CASE', 'SETTLEMENT', 'HOLD'] | See source schema and validators; no SQL FK implied |
| reference | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['ACTIVE', 'RELEASED'] | See source schema and validators; no SQL FK implied |
| actorId | String | validators=maxlength | default=None |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |
| releasedAt | Date | Schema permits omission; see command validation | default=None |
| releasedBy | String | validators=maxlength | default=None |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"resourceType":1,"resourceId":1,"lockType":1,"reference":1},{"unique":true}],[{"resourceType":1,"resourceId":1,"state":1,"lockType":1},{}]]`

## EarningLedgerEntry — `earningledgerentries`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| lineId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| operationId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestId | String | immutable; validators=maxlength | default=None |
| earningId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| fromBucket | String | enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID', None]; immutable | default=None |
| toBucket | String | required; enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID']; immutable | See source schema and validators; no SQL FK implied |
| amountVnd | Number | required; min=0; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| policyVersion | String | immutable; validators=maxlength | default=None |
| decisionVersion | String | immutable; validators=maxlength | default=None |
| actorId | String | immutable; validators=maxlength | default=None |
| occurredAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"lineId":1},{"unique":true}],[{"sitterId":1,"occurredAt":1,"lineId":1},{}],[{"earningId":1,"occurredAt":1,"lineId":1},{}]]`

## SettlementCommand — `settlementcommands`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| operation | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| key | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| fingerprint | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| result | Mixed | required; immutable | flexible BSON; service validation remains authoritative |
| createdAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"actorId":1,"operation":1,"key":1},{"unique":true}],[{"createdAt":1},{}]]`

## SettlementEvent — `settlementevents`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| eventId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| operationId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| type | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| actorId | String | immutable; validators=maxlength | default=None |
| earningIds | Array[String] | immutable | See source schema and validators; no SQL FK implied |
| amountVnd | Number | min=0; max=9007199254740991; immutable; validators=user defined | default=None |
| fromBucket | String | enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID', None]; immutable | default=None |
| toBucket | String | enum=['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID']; immutable | default=None |
| reason | String | immutable; validators=maxlength | default=None |
| transfer | Mixed | immutable | default=None; flexible BSON; service validation remains authoritative |
| policyVersion | String | immutable; validators=maxlength | default=None |
| decisionVersion | String | immutable; validators=maxlength | default=None |
| aggregateVersion | Number | min=0; immutable | default=None |
| occurredAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"operationId":1},{"unique":true}],[{"requestId":1,"occurredAt":1,"eventId":1},{}]]`

## SettlementOutbox — `settlementoutboxes`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| eventId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| operationId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| type | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| payload | Mixed | required; immutable | flexible BSON; service validation remains authoritative |
| state | String | required; enum=['PENDING', 'PUBLISHED', 'FAILED'] | default=PENDING |
| attempts | Number | required; min=0 | default=0 |
| createdAt | Date | required | See source schema and validators; no SQL FK implied |
| publishedAt | Date | Schema permits omission; see command validation | default=None |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"operationId":1},{"unique":true}],[{"state":1,"createdAt":1},{}]]`

## SettlementTransfer — `settlementtransfers`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| requestId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; immutable; validators=user defined | See source schema and validators; no SQL FK implied |
| adminId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| outcome | String | required; enum=['CONFIRMED', 'UNKNOWN', 'AMOUNT_MISMATCH']; immutable | See source schema and validators; no SQL FK implied |
| reference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| evidenceReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| amountVnd | Number | min=0; max=9007199254740991; immutable; validators=user defined | default=None |
| paidAt | Date | immutable | default=None |
| recordedAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"requestId":1,"version":1},{"unique":true}],[{"reference":1},{}],[{"evidenceReference":1},{}]]`

## SettlementTransferClaim — `settlementtransferclaims`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| kind | String | required; enum=['TRANSFER', 'EVIDENCE']; immutable | See source schema and validators; no SQL FK implied |
| reference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"kind":1,"reference":1},{"unique":true}]]`

## SettlementEvidence — `settlementevidences`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| evidenceReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| requestId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| ownerActorId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| mediaId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['UPLOADED', 'REVOKED'] | default=UPLOADED |
| uploadedAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"evidenceReference":1},{"unique":true}],[{"requestId":1,"ownerActorId":1,"state":1},{}]]`

## EarningAdjustment — `earningadjustments`

Source: `backend/src/models/settlement.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| earningId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sourceReference | String | required; immutable; validators=maxlength | See source schema and validators; no SQL FK implied |
| sourceType | String | required; enum=['CASE', 'REFUND', 'HOLD']; immutable | See source schema and validators; no SQL FK implied |
| status | String | required; enum=['PENDING_ADMIN_REVIEW'] | See source schema and validators; no SQL FK implied |
| proposedAmountVnd | Number | min=0; max=9007199254740991; validators=user defined | default=None |
| createdBy | String | immutable; validators=maxlength | default=None |
| createdAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"id":1},{"unique":true}],[{"earningId":1,"sourceType":1,"sourceReference":1},{"unique":true}],[{"status":1,"createdAt":1},{}]]`

## SitterApplication — `sitterapplications`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| contractGuard | Number | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=0 |
| ownerUserId | ObjectId | Schema permits omission; see command validation | default=None |
| policyConsents | Array[subdocument] | immutable | default=[] |
| policyConsents.slug | String | Schema permits omission; see command validation | nested path; not a separate SQL column |
| policyConsents.versionId | String | Schema permits omission; see command validation | nested path; not a separate SQL column |
| policyConsents.contentHash | String | Schema permits omission; see command validation | nested path; not a separate SQL column |
| policyConsents.effectiveAt | Date | Schema permits omission; see command validation | nested path; not a separate SQL column |
| policyConsents.consentedAt | Date | Schema permits omission; see command validation | nested path; not a separate SQL column |
| policyConsents.sourceRef | String | Schema permits omission; see command validation | nested path; not a separate SQL column |
| displayName | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| contactChannel | String | required; enum=['EMAIL', 'PHONE'] | See source schema and validators; no SQL FK implied |
| contactCiphertext | String | required | Excluded by default projection; explicit authorized read only |
| contactLookupKey | String | required | Excluded by default projection; explicit authorized read only |
| applicantParticularsCiphertext | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| identityLookupKey | String | required | Excluded by default projection; explicit authorized read only |
| activePendingOwnerUserId | ObjectId | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| activePendingContactKey | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| activePendingIdentityKey | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| ageEligible | Boolean | required; enum=[True] | See source schema and validators; no SQL FK implied |
| ageCheckedAt | Date | required | See source schema and validators; no SQL FK implied |
| experience | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| employmentType | String | enum=['FULL_TIME', 'PART_TIME', None] | default=None |
| requestedServices | Array[String] | required; validators=user defined | See source schema and validators; no SQL FK implied |
| workAreas | Array[String] | required; validators=user defined | See source schema and validators; no SQL FK implied |
| privateDocuments | Array[subdocument] | required; validators=user defined | See source schema and validators; no SQL FK implied |
| privateDocuments.documentId | String | required | nested path; not a separate SQL column |
| privateDocuments.documentType | String | required; enum=['IDENTITY', 'IDENTITY_FRONT', 'IDENTITY_BACK', 'PORTRAIT', 'CERTIFICATE', 'OTHER'] | nested path; not a separate SQL column |
| privateDocuments.storageRef | String | required | Excluded by default projection; explicit authorized read only; nested path; not a separate SQL column |
| state | String | required; enum=['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'] | default=PENDING |
| interviewNote | String | validators=maxlength | default=None |
| decisionReason | String | validators=maxlength | default=None |
| rejectedAt | Date | Schema permits omission; see command validation | default=None |
| reapplyAt | Date | Schema permits omission; see command validation | default=None |
| provisionedUserId | ObjectId | Schema permits omission; see command validation | default=None |
| version | Number | required; min=0 | default=0 |
| trackingCodeDigest | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| submissionKeyDigest | String | required | Excluded by default projection; explicit authorized read only |
| submissionPayloadDigest | String | required | Excluded by default projection; explicit authorized read only |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"ownerUserId":1},{}],[{"activePendingOwnerUserId":1},{"unique":true,"sparse":true}],[{"activePendingContactKey":1},{"unique":true,"sparse":true}],[{"activePendingIdentityKey":1},{"unique":true,"sparse":true}],[{"state":1,"createdAt":-1,"_id":-1},{}],[{"submissionKeyDigest":1},{"unique":true}],[{"trackingCodeDigest":1},{"unique":true,"sparse":true}],[{"identityLookupKey":1,"rejectedAt":-1},{}]]`

## SitterApplicationAudit — `sitterapplicationaudits`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | Schema permits omission; see command validation | default=None |
| actorRoles | Array[String] | required | default=[] |
| action | String | required; enum=['APPLICATION_UPDATED', 'APPLICATION_SUBMITTED', 'APPLICATION_VIEWED', 'APPLICATION_REVIEW_STARTED', 'APPLICATION_DECIDED', 'APPLICATION_DOCUMENT_REQUESTED', 'SITTER_SUSPENDED', 'SITTER_REINSTATED'] | See source schema and validators; no SQL FK implied |
| resourceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| state | String | enum=['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'] | default=None |
| decision | String | enum=['APPROVE', 'REJECT', None] | default=None |
| reasonDigest | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=None |
| idempotencyDigest | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=None |
| payloadDigest | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=None |
| resultVersion | Number | Schema permits omission; see command validation | default=None |
| resultUserId | ObjectId | Schema permits omission; see command validation | default=None |
| reapplyAt | Date | Schema permits omission; see command validation | default=None |
| documentId | String | Schema permits omission; see command validation | default=None |
| correlationId | String | validators=maxlength | default=None |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"resourceId":1,"occurredAt":-1},{}],[{"actorId":1,"occurredAt":-1},{}],[{"resourceId":1,"idempotencyDigest":1},{"unique":true,"partialFilterExpression":{"idempotencyDigest":{"$type":"string"}}}]]`

## SitterApplicationDownloadQuota — `sitterapplicationdownloadquotas`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See source schema and validators; no SQL FK implied |
| windowStart | Date | required | See source schema and validators; no SQL FK implied |
| count | Number | required; min=0 | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"actorId":1,"windowStart":1},{"unique":true}]]`

## SitterStatus — `sitterstatuses`

Source: `backend/src/models/sitter-application.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| userId | ObjectId | required | See source schema and validators; no SQL FK implied |
| status | String | required; enum=['ACTIVE', 'SUSPENDED'] | See source schema and validators; no SQL FK implied |
| statusReason | String | validators=maxlength | Excluded by default projection; explicit authorized read only; default=None |
| changedAt | Date | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=0 | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"userId":1},{"unique":true}]]`

## SitterMatchingProfile — `aisitterprofiles`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| changedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| userId | ObjectId | required | See source schema and validators; no SQL FK implied |
| serviceIds | Array[ObjectId] | required | See source schema and validators; no SQL FK implied |
| species | Array[String] | required | See source schema and validators; no SQL FK implied |
| areaCodes | Array[String] | required | See source schema and validators; no SQL FK implied |
| allowedTraits | Array[String] | Schema permits omission; see command validation | default=[] |
| maxWeightKg | Number | required; min=0; max=150 | See source schema and validators; no SQL FK implied |
| maxPets | Number | required; min=1; max=10; validators=user defined | See source schema and validators; no SQL FK implied |
| active | Boolean | Schema permits omission; see command validation | default=True |
| timeZone | String | enum=['Asia/Ho_Chi_Minh'] | default=Asia/Ho_Chi_Minh |
| windows | Array[subdocument] | required | See source schema and validators; no SQL FK implied |
| windows.weekday | Number | required; min=0; max=6; validators=user defined | nested path; not a separate SQL column |
| windows.startMinute | Number | required; min=0; max=1439; validators=user defined | nested path; not a separate SQL column |
| windows.endMinute | Number | required; min=1; max=1440; validators=user defined | nested path; not a separate SQL column |
| dayOffDates | Array[String] | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| starts | Array[subdocument] | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; default=[] |
| starts.localDate | String | required | nested path; not a separate SQL column |
| starts.point | Embedded | required | nested path; not a separate SQL column |
| starts.point.type | String | enum=['Point'] | default=Point; nested path; not a separate SQL column |
| starts.point.coordinates | Array[Number] | required; validators=user defined | nested path; not a separate SQL column |
| starts.availableFrom | Date | required | nested path; not a separate SQL column |
| starts.availableUntil | Date | required | nested path; not a separate SQL column |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"userId":1},{"unique":true}],[{"active":1,"areaCodes":1},{}]]`

## SitterVisitOutcome — `aivisitoutcomes`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| visitId | ObjectId | required | See source schema and validators; no SQL FK implied |
| sitterId | ObjectId | required | See source schema and validators; no SQL FK implied |
| serviceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| petIds | Array[ObjectId] | required | See source schema and validators; no SQL FK implied |
| species | Array[String] | required | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| resolution | String | required; enum=['COMPLETED', 'SITTER_FAULT', 'EXCUSED'] | See source schema and validators; no SQL FK implied |
| rating | Number | min=1; max=5; validators=user defined | See source schema and validators; no SQL FK implied |
| onTime | Boolean | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| verifiedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| sourceRef | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| provenance | Mixed | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; flexible BSON; service validation remains authoritative |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"visitId":1},{"unique":true}],[{"sitterId":1,"serviceId":1,"occurredAt":-1},{}]]`

## SitterScheduleBlock — `aischeduleblocks`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| changedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| sourceRef | String | validators=maxlength | See source schema and validators; no SQL FK implied |
| sitterId | ObjectId | required | See source schema and validators; no SQL FK implied |
| visitId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| startAt | Date | required | See source schema and validators; no SQL FK implied |
| endAt | Date | required | See source schema and validators; no SQL FK implied |
| point | Embedded | required | Excluded by default projection; explicit authorized read only |
| point.type | String | enum=['Point'] | default=Point; nested path; not a separate SQL column |
| point.coordinates | Array[Number] | required; validators=user defined | nested path; not a separate SQL column |
| endPoint | Embedded | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| endPoint.type | String | enum=['Point'] | default=Point; nested path; not a separate SQL column |
| endPoint.coordinates | Array[Number] | required; validators=user defined | nested path; not a separate SQL column |
| state | String | required; enum=['CONFIRMED', 'HOLD', 'RELEASED'] | See source schema and validators; no SQL FK implied |
| holdExpiresAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| kind | String | enum=['VISIT', 'BREAK'] | default=VISIT |
| version | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"sitterId":1,"startAt":1,"endAt":1},{}]]`

## RoutingMatrixCache — `airoutingmatrixes`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| key | String | required | See source schema and validators; no SQL FK implied |
| minutes | Number | required; min=0; max=1440 | See source schema and validators; no SQL FK implied |
| source | String | required | See source schema and validators; no SQL FK implied |
| recordedAt | Date | required | See source schema and validators; no SQL FK implied |
| expiresAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"key":1},{"unique":true}],[{"expiresAt":1},{"expireAfterSeconds":0}]]`

## SitterRankingPolicy — `airankingpolicies`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| version | Number | required; min=1; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| status | String | enum=['DRAFT', 'APPROVED', 'RETIRED'] | default=DRAFT |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| approvedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| approvedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| approvalSource | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| weights | Embedded | required | See source schema and validators; no SQL FK implied |
| weights.fit | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.travel | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.quality | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.reliability | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.workload | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"version":1},{"unique":true}],[{"status":1,"effectiveAt":-1},{}]]`

## SitterRankModel — `airankmodels`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| artifactJson | String | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only |
| artifactSha256 | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| trainingEvidence | Mixed | Schema permits omission; see command validation | Excluded by default projection; explicit authorized read only; flexible BSON; service validation remains authoritative |
| importedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| reviewVersion | Number | min=0; max=9007199254740991; validators=user defined | default=0 |
| version | String | required | See source schema and validators; no SQL FK implied |
| state | String | enum=['DRAFT', 'APPROVED', 'RETIRED'] | default=DRAFT |
| weights | Embedded | required | See source schema and validators; no SQL FK implied |
| weights.fit | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.travel | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.quality | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.reliability | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| weights.workload | Number | Schema permits omission; see command validation | nested path; not a separate SQL column |
| sha256 | String | required | See source schema and validators; no SQL FK implied |
| trainingRows | Number | required; min=100; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| testMae | Number | required; min=0 | See source schema and validators; no SQL FK implied |
| baselineMae | Number | required; min=0 | See source schema and validators; no SQL FK implied |
| testGroups | Number | required; min=10; max=9007199254740991; validators=user defined | See source schema and validators; no SQL FK implied |
| trainedUntil | Date | required | See source schema and validators; no SQL FK implied |
| approvedBy | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| approvedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"version":1},{"unique":true}]]`

## SitterRankModelReview — `sitterrankmodelreviews`

Source: `backend/src/models/sitter-matching.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | See source schema and validators; no SQL FK implied |
| modelId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| actorId | ObjectId | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| action | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| reason | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| reviewReference | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| fingerprint | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| result | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| guardVersion | Number | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"modelId":1,"createdAt":-1},{}]]`

## SitterPublicProfile — `sitterpublicprofiles`

Source: `backend/src/models/sitter-public-profile.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| userId | ObjectId | required; immutable | See source schema and validators; no SQL FK implied |
| bio | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| areas | Array[String] | required; validators=user defined | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['SUBMITTED', 'APPROVED', 'REJECTED'] | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| reviewedBy | ObjectId | Schema permits omission; see command validation | default=None |
| reviewedAt | Date | Schema permits omission; see command validation | default=None |
| reason | String | validators=maxlength | Excluded by default projection; explicit authorized read only; default=None |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"userId":1},{"unique":true}],[{"state":1,"updatedAt":1,"userId":1},{}]]`

## SitterPublicProfileCommand — `sitterpublicprofilecommands`

Source: `backend/src/models/sitter-public-profile.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required; immutable | See source schema and validators; no SQL FK implied |
| operation | String | required; immutable | See source schema and validators; no SQL FK implied |
| key | String | required; immutable | See source schema and validators; no SQL FK implied |
| fingerprint | String | required; immutable | See source schema and validators; no SQL FK implied |
| result | Mixed | required; immutable | flexible BSON; service validation remains authoritative |
| occurredAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"actorId":1,"operation":1,"key":1},{"unique":true}]]`

## SitterPublicProfileAudit — `sitterpublicprofileaudits`

Source: `backend/src/models/sitter-public-profile.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required; immutable | See source schema and validators; no SQL FK implied |
| userId | ObjectId | required; immutable | See source schema and validators; no SQL FK implied |
| action | String | required; immutable | See source schema and validators; no SQL FK implied |
| version | Number | required; immutable | See source schema and validators; no SQL FK implied |
| contentHash | String | required; immutable | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required; immutable | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"userId":1,"version":1},{"unique":true}]]`

## SystemSettingAudit — `systemsettingaudits`

Source: `backend/src/models/system-setting-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See source schema and validators; no SQL FK implied |
| action | String | required; enum=['SERVICE_CATALOG_VISIBILITY_CHANGED'] | See source schema and validators; no SQL FK implied |
| resourceType | String | required; enum=['system-setting'] | See source schema and validators; no SQL FK implied |
| resourceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1 | See source schema and validators; no SQL FK implied |
| changedFields | Array[String] | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

## SystemSettingVersion — `systemsettingversions`

Source: `backend/src/models/system-setting-version.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| key | String | required; enum=['SERVICE_CATALOG_VISIBLE'] | See source schema and validators; no SQL FK implied |
| version | Number | required; min=1; validators=user defined | See source schema and validators; no SQL FK implied |
| enabled | Boolean | required | See source schema and validators; no SQL FK implied |
| effectiveAt | Date | required | See source schema and validators; no SQL FK implied |
| changedBy | ObjectId | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| recordedAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"key":1,"version":1},{"unique":true}],[{"key":1,"effectiveAt":1},{"unique":true}],[{"key":1,"effectiveAt":-1,"version":-1},{}]]`

## UserAdminAudit — `useradminaudits`

Source: `backend/src/models/user-admin-audit.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| actorId | ObjectId | required | See source schema and validators; no SQL FK implied |
| action | String | required; enum=['USER_LOCKED', 'USER_UNLOCKED', 'USER_ROLES_CHANGED'] | See source schema and validators; no SQL FK implied |
| previousRoles | Array[String] | enum=['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] | See source schema and validators; no SQL FK implied |
| roles | Array[String] | enum=['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] | See source schema and validators; no SQL FK implied |
| resourceType | String | required; enum=['user'] | See source schema and validators; no SQL FK implied |
| resourceId | ObjectId | required | See source schema and validators; no SQL FK implied |
| reason | String | required; validators=minlength,maxlength | See source schema and validators; no SQL FK implied |
| occurredAt | Date | required | See source schema and validators; no SQL FK implied |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |

Indexes: `[[{"resourceId":1,"occurredAt":-1},{}]]`

## User — `users`

Source: `backend/src/models/user.model.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| displayName | String | required; validators=maxlength | See source schema and validators; no SQL FK implied |
| roles | Array[String] | required; enum=['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] | See source schema and validators; no SQL FK implied |
| state | String | required; enum=['ACTIVE', 'LOCKED', 'SUSPENDED'] | See source schema and validators; no SQL FK implied |
| authEpoch | Number | required; min=0 | default=0 |
| version | Number | required; min=0 | default=0 |
| synthetic | Boolean | Schema permits omission; see command validation | default=False |
| fixtureKey | String | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |
| policyConsents | Array[subdocument] | immutable | See source schema and validators; no SQL FK implied |
| policyConsents.slug | String | required; enum=['terms', 'privacy'] | nested path; not a separate SQL column |
| policyConsents.versionId | String | required; validators=maxlength | nested path; not a separate SQL column |
| policyConsents.contentHash | String | required; validators=maxlength | nested path; not a separate SQL column |
| policyConsents.effectiveAt | Date | required | nested path; not a separate SQL column |
| policyConsents.consentedAt | Date | required | nested path; not a separate SQL column |
| policyConsents.sourceRef | String | required; validators=maxlength | nested path; not a separate SQL column |
| _id | ObjectId | primary identity | See source schema and validators; no SQL FK implied |
| createdAt | Date | immutable | See source schema and validators; no SQL FK implied |
| updatedAt | Date | Schema permits omission; see command validation | See source schema and validators; no SQL FK implied |

Indexes: `[[{"fixtureKey":1},{"unique":true,"sparse":true}]]`

## Booking — `bookings`

Source: `backend/src/services/booking-proposals/booking-checkout.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| quoteId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| quoteVersion | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| originalVisitCount | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| visitIds | ObjectId[] | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentMode | PREPAY/POSTPAY | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentState | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentSnapshot | {amountVnd:Integer,currency:VND} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentDeadlineAt | Date (PREPAY) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| financeGuardVersion | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| carePlanState | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| careVisitCount | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkoutSnapshot | {quote,selections,customerVisits,consentAt,policyVersion} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| carePlanSnapshot | {shiftMinutes,approvedBy,approvedAt,allocationVersion,source} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| completedAt | Date (completion transition) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`

## Visit — `visits`

Source: `backend/src/services/booking-proposals/booking-checkout.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| serviceId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| petIds | ObjectId[] | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| sitterId | ObjectId/null | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| sequence | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| areaCode | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| requestedSitterId | ObjectId/null | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingMode | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| recommendationRef | {matchId,selectedAt,advisory,featureSnapshot} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| assignedFeatureSnapshot | Mixed (decision-time features) | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| location | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| addressId | ObjectId (HOME) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| startAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| endAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| evidenceRefs | String[] | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| snapshots | {serviceName,serviceAddress,serviceScope,priceVersion,careMinutes,employeeServiceNetVnd,care,pets,checklistItems,...} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerVisitId | String (care-shift source) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerScheduleConsent | Mixed (directed schedule) | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| assignedAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkInAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkOutAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checklist | Mixed (item completion) | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| careAcknowledgement | {sitterId,version,acknowledgedAt} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| handoverRequired | Boolean (replacement) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| handoverAccepted | Boolean (replacement) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| completedAt | Date (CHECK_OUT) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`

## PaymentIntent — `paymentintents`

Source: `backend/src/services/booking-proposals/booking-checkout.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| provider | PAYOS | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| providerReference | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| amountVnd | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| currency | VND | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | PENDING/PAID/other guarded state | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| expiresAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paidAt | Date (verified callback) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| linkState | CREATING/READY/RECONCILIATION_REQUIRED | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| checkoutUrl | HTTPS URL (READY) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| paymentLinkId | String (READY) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`

## Payment — `payments`

Source: `backend/src/services/providers/payos/mongo-payment-webhook.repository.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId/null | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| intentId | ObjectId/null | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| provider | PAYOS | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| providerEventId | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| providerTransactionReference | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | VERIFIED/RECONCILIATION_REQUIRED | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| receiptMoney | {amountVnd:Integer,currency:VND} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| reconcileReason | String (reconciliation) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| verifiedAt | Date (verified) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| receivedAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`

## TaxAssessment — `taxassessments`

Source: `backend/src/services/settlements/booking-finance-source.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | CONFIRMED | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| totalTaxVnd | nonnegative safe Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| confirmedBy | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| confirmedAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| evidenceReference | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`

## Case — `cases`

Source: `backend/src/services/complaints/mongo-complaint.repository.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String (logical complaint identity) | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| visitId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| bookingId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| customerId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| sitterId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| kind | COMPLAINT/other case contract | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| category | String enum | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| description | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| evidenceRefs | {mediaId,kind,caption}[] | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| state | OPEN/UNDER_REVIEW/RESOLVED/CLOSED | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| version | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | ISO instant String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| resolution | Mixed (audited resolution) | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| summary | String (max 500) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| requestedOutcome | String (max 2000) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| serviceName | String/null | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| involvedActorRefs | String[] | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| objectionCount | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| openedAt | ISO instant String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| actorId | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| idempotencyKey | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| financialHold | Boolean (case decision) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| staffNotes | String (private) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| latestObjection | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| decision | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |

Indexes: `[]`

## Refund — `refunds`

Source: `backend/src/services/settlements/mongo-earning-sources.repository.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId or legacy contract identity | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition. Refund collection is provisioned/read; full refund writer integration remains pending. |
| bookingId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition. Refund collection is provisioned/read; full refund writer integration remains pending. |
| state | String (financial lock reader contract) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition. Refund collection is provisioned/read; full refund writer integration remains pending. |

Indexes: `[]`

## ContactChangeAudit — `account_contact_audit_events`

Source: `backend/src/services/contact-change-audit.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| eventId | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| logicalOperationId | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| correlationId | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| schemaVersion | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| type | CONTACT_LINKED/CONTACT_REPLACED | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| aggregateType | CONTACT | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| aggregateId | ObjectId | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| aggregateVersion | Integer | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| actorRef | {userId:ObjectId} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| occurredAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| payload | {channel:EMAIL/PHONE} | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`

## CatalogProvisioningRun — `catalogprovisioningruns`

Source: `backend/src/services/demo-catalog-provisioning.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | ObjectId | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| key | String | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| actorKind | SYSTEM_MIGRATION | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| createdAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| source | String (source-dependent) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| skipped | Mixed[] (demo catalog) | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| retired | String[] (demo catalog) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| authorization | String (initial/detail migration) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| created | Mixed (initial migration) | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |

Indexes: `[]`

## DemoPopulationRun — `demopopulationruns`

Source: `backend/src/services/hanoi-demo-population.service.js`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| _id | String | primary identity | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| summary | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| records | Mixed | Schema permits omission; see command validation | flexible BSON; service validation remains authoritative |
| appliedAt | Date | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |
| authorization | String (recorded explicit scope) | Schema permits omission; see command validation | Repository-managed BSON contract; no Mongoose/SQL schema enforcement. Conditional fields depend on transition.  |

Indexes: `[]`
