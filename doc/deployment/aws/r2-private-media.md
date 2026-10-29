# R2 private image runtime

Implemented scope (16/10/2026): authenticated owner-only PNG/JPEG storage, backed
by Mongo metadata/quota and the R2 S3-compatible SDK. Disabled by default via
`R2_ENABLED=false`. No bucket, credentials, DNS, lifecycle rule or real upload has
been created in this audit. No frontend upload control is enabled by this change.
Guest applicant documents/PDF, care reports, settlement evidence registration and
public image publication remain separate integrations; do not reuse an arbitrary
owner-image reference as approved evidence.

## Operator setup

Create a separate private staging bucket (proposed `pwc-private-staging`), with
both r2.dev and custom-domain public access disabled. Scope credentials to that
bucket's Object Read & Write operations; do not use an account administration token.
Use backend-only `R2_ENABLED=true`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_MAX_IMAGES_PER_USER` from the
[example](../../../backend/.env.example). Real values belong only in the private
EC2 environment file. Never put them in frontend/VITE settings. Account ID is
32 lowercase hex characters, access key ID 32 and secret 64; malformed enabled
configuration stops startup with safe field names. Disabled configuration is inert.

Runtime consumes and validates these fields. Preflight reuses that validation but
cannot verify credentials, bucket privacy, quota, SDK/R2 behavior or live network.
The endpoint is derived from the validated account ID, HTTPS only, region `auto`;
there is no caller-controlled endpoint or ambient AWS credential chain. SDK
versions are exact in the lockfile. AWS SDK transport retries are disabled; a
hard 10-second abort covers request and full download body. A timeout keeps
metadata pending because a provider may have stored the object already.

The image and quota collections need their native `_id` indexes only. Upload
reserves a slot and pending record in one Mongo transaction. No startup
syncIndexes/drop or destructive migration runs. Provision/check collections and
transaction permissions on the actual Atlas staging DB before traffic.

## API and authorization

When authentication and R2 are enabled, the default app mounts:

- `POST /api/v1/private-images`: raw `image/png` or `image/jpeg` body; active
  session cookie, same-origin Origin, X-CSRF-Token and Idempotency-Key required.
  The caller must generate and retain the 16–128 ASCII key with the payload;
  retrying an unknown response uses the same key, while a new command uses a
  new key. Returns 201 on
  completion or 200 for a completed replay, with `{id,state,replayed}` only.
- `GET /api/v1/private-images/:id/content`: active current owner's session;
  other users, including Admin/Staff, get 404. Revoked/expired sessions get 401.
  Backend downloads and verifies the object's stored length, type and SHA256,
  then returns attachment bytes, no public or signed browser URL.

Requests/responses are private/no-store, nosniff and no-referrer. Cloudflare and
service-worker bypass rules still need live verification. The route never logs
body, object key, credentials or signed URL. There is no list/read-any-user or
unauthenticated upload endpoint, and no arbitrary user ID accepted from a client.

Upload input and output are capped at 5 MiB, decoded pixels at 4 million, static
single-frame PNG/JPEG only. Sharp decodes and re-encodes with a five-second
processing limit and strips metadata; client MIME or magic bytes alone do not
establish acceptance. The route admits at most four image requests, including
upload body parsing, while the native Sharp decode/re-encode gate is deliberately
limited to one concurrent job. This separates request/body memory from native
decoder memory and keeps the 384 MiB container target conservative. Orientation,
alpha, near-limit JPEG, pixel-cap and concurrent-load regressions are covered by
synthetic tests. Linux cgroup/RSS verification on the target container is **NOT
RUN**; do not infer it from Windows measurements and keep R2 production disabled
until that host check and provider acceptance are complete.

The default technical cap is 20 image identities per user, operator-configurable
1–1000. Pending/uncertain objects consume a slot too; failure cannot bypass quota.
Quota is shared through Mongo across app processes. There is no delete/release
API until retention/evidence policy is approved. Do not enable this service in a
live environment before deciding retention, backup, orphan recovery and support
for a user whose quota is full. Failed input/auth/CSRF does not reserve a slot.

## Idempotency and uncertain outcomes

The server derives an opaque object identity from session owner + command key;
clients cannot choose R2 paths. The normalized input digest binds that identity
to one payload. Changed payload gives 409; a completed retry returns its stored
identity. Same-key concurrent PUTs may occur, but converge on the same identity
and bytes with one Mongo quota slot. Do not claim exactly-once network transfer.
After lost acknowledgement, the object may exist while metadata remains PENDING;
retry the same payload/key to reconcile. Never issue a new command key just to
hide a timeout. Content bytes must verify before a READY object is served.

Identity derivation uses the backend session-token secret with a purpose prefix;
keep its version stable during retry windows. Key rotation requires a reviewed
idempotency-version migration; changing it silently can create another identity.
No automatic cleanup or deletion is implemented. Preserve the original image
input and command identity securely if retry/reconciliation is needed.

The lower-level provider exposes short-lived signed read capabilities only for
internal authorized services, restricted to the private image key namespace.
Presigned URLs are bearer tokens reusable until expiry and work on the S3 API
hostname, not a public custom domain. The owner API deliberately uses backend
reads, so each new request rechecks session/ownership and needs no R2 browser CORS.
A future direct-browser adapter needs exact-origin CORS, quota/quarantine,
content verification and short lifetimes; CORS alone is not authorization.

## Linux diagnostic and provider update — 29/10/2026

User decision 30/10/2026: demo owner images remain until their owner requests
deletion; no age-based expiration, default quota 20 images per owner. This does
not apply to complaint/settlement evidence. Until a reviewed deletion command
exists, operator requests must check owner, reject objects linked to evidence,
record a deletion tombstone first, delete the exact R2 key and reconcile Mongo
quota only after provider deletion is confirmed. Do not decrement quota after
an uncertain response or silently remove metadata first. Pending/unknown
uploads require same-key reconciliation; do not bulk-delete apparent orphans
from R2 without comparing durable metadata and active operations.

An isolated runtime using real persisted sessions and the actual R2 SDK has
now passed upload 201, same-key replay 200, owner read 200, wrong-CSRF 403,
guest/revoked 401, other owner/Admin 404, one quota slot and EXIF removal.
Its synthetic database was removed and its real test objects deleted. This
does not yet attest Cloudflare cache behavior or create a user deletion UI.

The earlier NOT RUN memory statement is superseded for this specific synthetic
workload: actual production Dockerfile/dependencies built successfully on EC2
Linux ARM64. In a separate internal Docker network, a tmpfs Mongo replica set
and a 384 MiB Node container completed 16 JPEG HTTP uploads and 16 downloads in
waves of four. The input was a 1900x1900 synthetic noisy JPEG (2,987,593 bytes).
Cgroup memory.peak was 284,676,096 bytes (271.5 MiB), RSS 284,553,216 bytes,
with zero OOM kills. All temporary containers and the network were removed;
no production environment, database volume or published port was used.

The checked-in runner was then executed with RAM+swap explicitly capped to
384 MiB and `/data/configdb` also on tmpfs. It passed the same 16+16 workload:
fixture 2,987,603 bytes, peak 310,317,056 bytes (295.9 MiB), RSS 313,470,976 bytes,
swap usage/limit both zero, OOM kills zero. Random fixture bytes/native allocator
behavior vary between runs; both measurements remain below the RAM cap.

Authentication/provider are synthetic in this diagnostic. It verifies native
Sharp/runtime installation and bounded HTTP/body/re-encode memory for this
workload; it is not a 200-user load test, slow-client proof or every possible
PNG/JPEG/provider-failure memory case. Existing isolated integration tests cover
session/ownership separately. Do not turn this measurement into full acceptance.

Reproduce on a host with at least 900 MiB spare RAM and an already built release
image (the runner does not build, pull application code, or activate a release):

```bash
sudo python3 backend/scripts/deployment/check-private-media-memory.py pawworldcare-backend:FULL_40_CHARACTER_SHA
```

The runner uses a pinned Mongo image, an isolated internal network, no port
mapping and no production env/volume. It invokes the adjacent diagnostic module
inside the supplied image with fake authentication and an in-memory provider.
If Docker lacks the pinned Mongo image it may pull that public image.
The diagnostic's in-memory provider does not measure SDK GET chunk/concat
allocations or actual provider latency; the JPEG is not a worst-case 5 MiB PNG.

Separately, an actual EC2-to-R2 S3 signed provider smoke completed PUT/GET 200,
byte-for-byte SHA256 match, private/no-store metadata and DELETE 204. The
operator fixed the token/IP filtering that previously returned AccessDenied.
Unsigned S3 API returned 400; this alone does not attest r2.dev/custom-domain
privacy. New-runtime API/provider integration, Cloudflare cache, retention,
deletion/orphan recovery, restoration and attachment/UI acceptance remain open.

## Evidence and remaining gates

Tests cover the real AWS SDK signing/serialization through a synthetic HTTP
handler and real image decode/reencode. Isolated Mongo with persisted sessions
covers CSRF, owner access/revocation, EXIF removal, false MIME, oversize/quota,
concurrent IDs, provider unknown outcome and storage tampering. Hung-request and
stalled-body tests verify hard abort/stream destruction. None contacts R2.
Final exact test counts are recorded in the PR review. Live bucket privacy,
credential scope, actual PUT/GET, EC2 native install/memory, provider failures,
retention/deletion and DB/object restore remain NOT RUN.

Official references read 15–16/10/2026:

- [Cloudflare SDK v3 configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Private/public bucket behavior](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls)
- [CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Sharp constructor/input safety](https://sharp.pixelplumbing.com/api-constructor/)
- [Sharp output/metadata](https://sharp.pixelplumbing.com/api-output/)
