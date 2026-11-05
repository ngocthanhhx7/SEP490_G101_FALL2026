# Persistence models

`product-photo.model.js` stores bounded normalized WebP bytes in `productphotos`,
separate from lightweight product documents. Product ID/hash is unique; image
references and details versions change transactionally. Mongo backup/restore
includes these blobs; no writable release directory or provider key is required.

`customer-review.model.js` preserves the `reviews` collection, adds a unique
visit/direction constraint and durable command replay. Operational satisfaction
outcomes retain `aivisitoutcomes`; optional private provenance links source
versions without changing legacy imports. Provision through deployment indexes.

Mongoose schemas/indexes and physical collection compatibility belong here. Pet-care, pricing, decision snapshots and sitter matching have separate factories. `platform-data.model.js` combines them only for explicit seed/test setup; runtime matching must not import pricing models. `model-definitions.js` retains legacy collection names, including `airoutingmatrixes`. No upper HTTP/service imports.

SitterApplication's new ownerUserId identifies the authenticated applicant for receipt recovery and same-account role promotion. Immutable policyConsents record the approved versions accepted at submission; existing legacy records retain a null owner and empty consent list. Collection names remain unchanged.

Application document and consent subdocuments disable Mongoose version keys like
their parent. This keeps transaction abort/retry restoration from assigning an
undeclared `__v` under `strict: 'throw'`; domain concurrency uses `version`.

`pet-care.model.js` adds owner-declared care fields, private address access notes
and durable `PetCareCommand` replay without renaming existing collections.
`notification.model.js` defines recipient/role-scoped notifications/event replay.
Provision registered collections/indexes with the explicit deployment command.
`sitter-public-profile.model.js` stores separately submitted public profile content,
its review state/version, immutable command replay results and content-hash audits.
It does not publish application experience or repurpose AI matching profiles.

`application-mail.model.js` owns the new `application_mails` collection. One
record per application/version stores an encrypted verified recipient snapshot,
provider operation id, bounded attempts, lease and safe delivery state. It does
not contain application documents or interview notes. Existing collections are
unchanged; deployment index provisioning registers this model explicitly.

`product.model.js` defines `Product`, `ProductCart`, `ProductOrder`, `ProductCustomerRefusal` (one record per refused order, order id unique; a customer's refusal count is the number of their records) and the `ProductCounter` used for order codes, with default collection names (`products`, `productcarts`, `productorders`, `productcustomerrefusals`, `productcounters`). `ProductOrder` also keeps delivery and return details (`deliveredAt`, `carrierReturnReason`, `returnReason`, `returnNote`, `returnedAt`, `refundMarked`) and each order line the `resellableQuantity` set when a return is confirmed. The new collection is created with the deployment index command. `Supplier` (collection `suppliers`) holds a supplier of the shop: name, `nameKey` (the name as compared for uniqueness, under a unique index), contact name, ten-digit phone, email, the `productIds` it supplies, `status` (`ACTIVE`/`STOPPED`) and `version`; it is created with the deployment index command like the other product-sales models. `Product.detailsVersion` guards edits made in Product Management; the stock `version` is separate because every order or return changes stock. `ProductCounter` also holds `PRODUCT_CODE`, the last `SP-xxxx` number. `sellingPrice`, stock and totals are integer VND/units; sellable quantity is derived (`stockOnHand - quantityHeld`). Order lines copy code, name and price at order time. Provision through the deployment index command like other runtime models.

Matching models retain original artifact bytes/evidence and review versions.
`SitterRankModelReview` adds durable approval/retirement replay and a transaction
activation guard. Employee offers keep private feature snapshots; accepted visits
retain the actual assignee snapshot. Existing collection names remain unchanged.

`employment-document.model.js` adds encrypted immutable application contracts, a
transactional document counter and command replay without renaming legacy payroll
collections. EmploymentContract adds the signed document reference, generated code,
contractual schedule and fixed allowance; PayrollStatement snapshots identity and
reference for print. New collections are created by existing deployment indexing.

EmploymentContract.workScheduleMode SELF_REGISTERED and minimumWeeklyMinutes preserve minimum-hours terms without copying operational availability into a signed contract. Existing fixed schedule records and collection names are unchanged.

SitterApplication.applicantParticularsCiphertext optionally retains submitted DOB/identity under existing AES-GCM protection, select:false. Legacy hashes remain unchanged; no plaintext or invented identity backfill.

SitterApplicationAudit supports APPLICATION_UPDATED, retaining original submission fingerprint separately from versioned owner-edit replay. No collection name changes.

`avatar.model.js` stores bounded JPEG blobs/version/tombstones in `profileavatars`; User/Pet collection names and projections remain unchanged. Sitter application document types add IDENTITY_FRONT/IDENTITY_BACK/PORTRAIT while preserving legacy IDENTITY.
