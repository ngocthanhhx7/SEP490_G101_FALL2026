# R2 private media — selected provider, integration pending

The user selected Cloudflare R2 on 15/10/2026. The supplied dashboard screenshot
shows no bucket created. Prepare a separate staging bucket, for example
`pwc-private-staging` (availability unverified), independent of production.
Keep both Public Development URL (`r2.dev`) and public custom-domain access
**disabled**. Do not make private documents public to display them in the UI.
Creating a bucket, credentials, lifecycle rules or uploading files has not occurred.

## Backend configuration contract to implement

Use the S3-compatible endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
region `auto`, and bucket-scoped Object Read & Write credentials held only in the
backend secret store. Never use an account-wide administration token, expose
keys in VITE variables or commit them. Proposed adapter-specific names are
`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; these are
**not yet consumed by runtime or validated by the offline preflight**. Adding
these values today does not wire `privateMedia` or enable uploads.

The implementation must bind durable media metadata to authenticated owner,
resource/assignment, purpose, content type, byte size, verified content checksum,
object key and state. Use random server-generated keys, no contact/name/home
address in object paths. Upload into a quarantine state, verify actual content
and size server-side (browser MIME checks/signing Content-Type are insufficient),
then promote metadata and expose only accepted media. Bound streaming/temporary
space and clean orphan objects through an idempotent job only after retention
policy is approved. Do not treat S3 ETag as a universal content checksum.

Prefer backend-mediated upload/read for the first integration so browser auth
remains same-origin. Before every read, check current role, ownership, assignment
and the permitted time window. For temporary direct reads, issue a short-lived
GetObject capability only after those checks; its lifetime must not exceed the
remaining authorization window. Presigned URLs are bearer credentials and can
be reused until expiry; they cannot prove continued assignment or instant
revocation. Use an authenticated backend stream where immediate revocation is
required. Never persist signed URLs as permanent media identity or log their
query strings. API and object responses must be private/no-store and excluded
from CDN/service-worker caches.

R2 presigned URLs use the S3 API hostname, not a public custom domain. With
backend-mediated traffic, no browser-to-R2 CORS policy is needed. If a later
reviewed adapter permits direct browser PUT/GET, restrict CORS to the exact
staging HTTPS origin and required methods/headers; do not use `*` or expose
DELETE. Signing content type does not enforce actual file size/content or stop
repeated overwrites. A direct-upload design therefore needs quarantine,
post-upload verification and a safe finalization/idempotency protocol.

## Gates and operator evidence

Before enabling uploads, record the bucket name/region jurisdiction choice,
credential scope/rotation, approved quota, max bytes/types, retention/deletion
and backup policy. R2 durability is not proof of recoverability from an accidental
delete; test the selected independent backup/recovery method and reconcile DB
metadata with objects. Do not install deletion/lifecycle rules before retention
is agreed. Public marketing/avatar media, if later approved for public release,
needs a distinct publication workflow and bucket; no automatic promotion of
applicant documents or check-in evidence.

Required synthetic tests: guest/other-owner/incorrect assignment denied; expired
and revoked access denied; invalid content/oversize rejected; retry/lost response
not duplicated; orphan cleanup safe; object and DB recovery consistent; no public
r2.dev/custom-domain read; no PII/signed URL in logs/cache. Prove actual SDK/R2
behavior with an authorized target separately from port doubles. Current
`privateMedia` remains fail-closed; no runtime R2 adapter or live proof exists.

Official sources searched and read on 15/10/2026:

- [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Public buckets and default privacy](https://developers.cloudflare.com/r2/buckets/public-buckets/)
