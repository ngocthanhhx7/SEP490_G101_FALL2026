# Application services

`application-status.service.js` owns the narrow applicant status projection and scoped OTP contract. `application-status-runtime.service.js` connects it to the existing application collection and OTP service.

`application-intake.service.js` reads the authenticated Customer's verified email and most recent owned application. It verifies READY ApplicantDocument references against that owner and maps document registry IDs to bounded R2 content reads for Admin-reviewed documents. It does not trust client-authored object keys, grant Pet Sitter roles or set policy readiness. Submission/consent/approval transactions remain in `../sitter-application.service.js`.

The runtime mounts the existing sitter application router with authenticated submission and CSRF. Its legacy factory option remains for historical Guest contracts/tests; the default application composition explicitly enables the authenticated path. Document uploads use the shared validated image service with a separate ApplicantDocument collection, bucket, namespace and 20-document owner quota; each application references at most six images. PDF is not supported by this pipeline. See [registration verification](../../../../doc/testing/registration-sitter-flow.md).

The authenticated intake includes applicant-visible rejectionReason and server-clock
canReapply. Registration never decides cooldown eligibility from the device clock;
refreshing the receipt reloads intake, then remounts the form only when allowed.
Submission still independently rechecks pending applications and cooldowns.

`application-mail.service.js` enqueues one typed status email per application
version in the same domain transaction. It stores an encrypted recipient only
when the owner has that verified email, and rechecks it before sending. Missing
verified email is SKIPPED. The runtime worker uses existing notificationDelivery
SMTP when EMAIL_ENABLED=true, outside domain transactions. Safe temporary
failures retry at most three queue attempts with one operation id. Uncertain
provider acceptance or an expired sending lease becomes UNKNOWN without blind
resend; Admin can inspect safe delivery state, never addresses/credentials.
`application-mail-template.service.js` owns responsive branded HTML/plain text,
status guidance and approval congratulations. No documents or internal notes are
included. ACCEPTED means SMTP acceptance, not inbox delivery. Existing records
are not backfilled, and historical approved accounts are not changed.
