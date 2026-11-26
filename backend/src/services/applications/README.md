# Application services

`application-status.service.js` owns the narrow applicant status projection and scoped OTP contract. `application-status-runtime.service.js` connects it to the existing application collection and OTP service.

`application-intake.service.js` returns Guest intake readiness and verifies READY ApplicantDocument references against the signed intake owner. It retains the authenticated adapter for historical owned applications. Admin document reads map registry IDs to bounded R2 content. It never trusts client-authored object keys or grants roles. Submission/consent/approval transactions remain in `../sitter-application.service.js`.

The default runtime follows UC-16, GBR-25 and GBR-28: a Guest submits both email and phone without registering or verifying email first. `GET /api/v1/applications/intake` issues an HttpOnly SameSite intake cookie and a token returned only in the response body. Uploads and submission require that cookie plus `X-Application-Token` and same-origin checks. `guest-intake.service.js` signs this temporary document capability; it creates neither User nor AuthSession. The token stays in browser memory. It expires after two hours and is independent of login cookies.

Documents use the shared image decoder with a separate ApplicantDocument collection/bucket/namespace and 20-document intake quota. Each application accepts the front/back identity images, portrait and up to five supporting images. PDF is unsupported. Email/phone are encrypted; a sparse unique multikey `activePendingContactKeys` index prevents concurrent pending applications sharing either contact. Provision indexes through `node scripts/deployment/ensure-indexes.js` before rollout. No historical application data or existing validators are rewritten at startup.

Admin approval creates the Pet Sitter User transactionally after the existing interview/signed-contract gates. `application-onboarding.service.js` resolves an approved application for LOGIN OTP; the contact becomes VERIFIED only after successful OTP proof. The existing authenticated ownership/edit adapter remains available for historical applications and approved users.

The authenticated intake includes applicant-visible rejectionReason and server-clock
canReapply. Registration never decides cooldown eligibility from the device clock;
refreshing the receipt reloads intake, then remounts the form only when allowed.
Submission still independently rechecks pending applications and cooldowns.

`application-mail.service.js` enqueues one typed status email per application
version in the same domain transaction. Guest applications use the encrypted
submitted email without pretending it is a verified account contact. Historical
owned applications still require and recheck their verified email. The runtime worker uses existing notificationDelivery
SMTP when EMAIL_ENABLED=true, outside domain transactions. Safe temporary
failures retry at most three queue attempts with one operation id. Uncertain
provider acceptance or an expired sending lease becomes UNKNOWN without blind
resend; Admin can inspect safe delivery state, never addresses/credentials.
`application-mail-template.service.js` owns responsive branded HTML/plain text,
status guidance and approval congratulations. No documents or internal notes are
included. ACCEPTED means SMTP acceptance, not inbox delivery. Existing records
are not backfilled, and historical approved accounts are not changed.

Runtime application approval composes the employment document service. It requires
the current interview application revision to have a verified signed document and
activates its payroll contract in the same transaction as account promotion.
Neither printing nor a DRAFT document grants a role.

Submission retains encrypted DOB/identity for Admin contract preparation rather than discarding the submitted values after age/HMAC checks. A matching authenticated original-request replay may restore a missing snapshot; mismatched payloads cannot. Lists, receipts, OTP status and email never expose these particulars.

The application service exposes getMine/updateMine with current account or unowned legacy verified-contact ownership. Pending edits serialize with Admin review on the same version/state, retain original submission fingerprint, and record idempotent audited updates. New document references must belong to the applicant; responses expose metadata, never storage references or internal interview notes. Once review starts direct editing is closed.
