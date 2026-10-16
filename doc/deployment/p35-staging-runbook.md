# P35 — EC2 + Cloudflare staging runbook

Status: **PREPARED / INTEGRATION_PENDING**, 15/10/2026, Asia/Ho_Chi_Minh.
The user selected frontend and backend on one EC2, Cloudflare DNS/proxy HTTPS,
and Cloudflare R2 for image storage. The supplied domain is `pawworldvn.shop`; use `staging.pawworldvn.shop` for the proposed staging hostname;
EC2 does not exist and the screenshot shows no R2 bucket yet. These choices
supersede the previous Vercel/Render proposal. The old Vercel preview is historical
frontend evidence only. No resources, DNS changes or deployment were performed.

## Topology and release gate

Browser → Cloudflare HTTPS → Nginx HTTPS on EC2 → static frontend or local Express
at `127.0.0.1:3000`. Browser API remains `/api/v1` at the same public origin.
Backend connects over TLS to the separate Atlas staging replica set and to a
private R2 bucket. MongoDB and private media are not stored on the EC2 root disk.
One EC2 is a single failure domain; it does not meet an HA or two-worker proof.

Before provisioning, record domain/subdomain, AWS account/region, instance size,
OS/architecture, network/egress, cost owner and budget. Do not infer free-tier
eligibility. Select a supported Linux systemd/Nginx host; build for that host's
architecture, not by copying Windows node_modules. Keep IMDSv2 required, EBS
encrypted and administrative access via IAM/SSM; no inbound SSH is needed when
SSM agent/role and outbound connectivity are configured. Allow inbound 443 only
from current Cloudflare IP ranges, no inbound 3000/27017; apply matching IPv6
rules or publish no AAAA record. Plan outbound access for SSM, Atlas, R2 and SMTP.
Reserve a stable origin/egress address before configuring DNS/Atlas allowlists.
Creating EC2, IPs, storage, logging or buckets needs a separately authorized target.

Deploy only a recorded SHA after the final [P34 gate](../testing/p34-a-integration-status.md)
and dependent financial/provider/runtime gates pass on the same release.
No automatic deploy on push. [Verification](p35-verification.md) and
[recovery](p35-recovery.md) define acceptance; config validation is not acceptance.
Production still requires approved UAT and the project release/review process.

## Templates and server installation

[aws/nginx.conf.example](aws/nginx.conf.example) is an Nginx **http-context include**,
not a full nginx.conf. The template uses `staging.pawworldvn.shop`; verify this DNS target, certificate paths and
root paths before installing under sites-enabled/conf.d. The required
`/etc/nginx/pwc-cloudflare-realip.conf` must contain only reviewed current
`set_real_ip_from CIDR;` entries for Cloudflare IPv4/IPv6 ranges. Fetch/review the
provider list before changes; never trust all IPs or a client-supplied header.
Nginx real-IP support and `nginx -t` are required on the actual OS. The SG must
restrict the origin as well. The template replaces forwarded Host/protocol/IP;
Express trusts just the immediate local Nginx hop, not the entire CDN chain.
Validate spoofed CF/forwarded headers and direct-origin rejection before rollout.

[aws/pwc-backend.service.example](aws/pwc-backend.service.example) runs a dedicated
unprivileged `pwc` user with Node at `/opt/pwc/node/bin/node`. Install the exact
ADR runtime Node 24.21.0 / npm 11.19.0 and verify both versions; adapt this path to
the verified installation. Create release directories `/srv/pwc/releases/<SHA>`
owned by the release operator, readable by the service/Nginx and not writable by
`pwc`. Build with lockfiles (`npm ci --ignore-scripts`, lint/tests, frontend build)
in a controlled environment. Install backend production dependencies for Linux
with `npm ci --omit=dev --ignore-scripts`; keep dev dependencies and build tools
out of the running service. Serve `frontend/dist` using Nginx, not Vite preview.

Place secrets outside releases in `/etc/pwc/backend.env`, root-owned mode 0600;
systemd reads EnvironmentFile before dropping privileges. Never copy a local
.env or print secret values. Provision directories, service identity, executable,
certificate/private key and trusted-proxy include before enabling units. Run
`nginx -t` and `systemd-analyze verify` on the host, offline preflight using the
same private environment, and local `/ready` before proxy traffic. These host
checks have **not** run in this Windows audit. No template is auto-installed.
The service includes restart backoff, graceful SIGTERM and read-only filesystem
hardening; it does not configure jobs, uploads, schema migrations or monitoring.

Publish the frontend and backend from the same release via a single `current`
symlink. Switch to the complete release, restart backend and check readiness
before opening traffic; a symlink switch alone is not an atomic live rollout.
Use maintenance during the restart, preserve a known-good previous release and
retain old hashed assets across the browser deployment window. If auth, CSRF or
readiness fails, restore the compatible previous release and restart; no database
down-migration or deletion. Rehearse this sequence before calling rollback ready.

## Cloudflare DNS, TLS and cache

After the instance/address and exact staging hostname are recorded, add a proxied
A record (AAAA only with equivalent IPv6 protection). Install an unexpired
hostname-matching public CA or Cloudflare Origin CA certificate on Nginx and use
**Full (strict)**. Enable edge HTTP→HTTPS. Do not downgrade verification to fix
526. Origin CA is for the Cloudflare→origin connection; browsers will not trust
it if proxying is disabled. Track certificate renewal/expiry separately.

Initially bypass Cloudflare cache for the entire staging hostname and remove
conflicting Cache Everything rules. Never cache API, session, upload/payment,
private media or any Set-Cookie response. Do not log query strings, signed media
URLs, Cookie, Authorization, CSRF, request bodies or provider payloads at any
layer. The Nginx access log contains generated request ID, status and duration; its
raw error log is discarded because request context can contain secret URLs.
Use sanitized application events/metrics for alerts; verify global Nginx startup
logs, journald and Cloudflare collection separately before rollout.
Prove no cache hit containing PII and `private, no-store` behavior in the actual
edge path; service-worker caches require a separate PWA check.

Nginx fixes Host to the staging hostname and X-Forwarded-Proto to https; the
backend compares Origin to protocol://Host and does not trust X-Forwarded-Host.
Use `TRUST_PROXY_HOPS=1`; do not set 2 or trust all. Unknown `/api` paths and
health endpoints must remain backend JSON responses, never SPA HTML/200.
Same-origin browser calls require no permissive CORS. Valid cookie+Origin+CSRF
writes must pass; missing/wrong Origin or CSRF must fail. Test cookie
HttpOnly/Secure/Lax, reload, logout, revocation and both limiter/IP paths.

## Environment, database and provider gates

Use names from [backend/.env.example](../../backend/.env.example). Set
`NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3000`, `TRUST_PROXY_HOPS=1`,
`MONGO_DB` ending `_staging`, `ALLOW_DEV_ADMIN_SEED=false`. Atlas requires Mongo
8.0.x replica-set topology, verified TLS, restricted egress allowlist and a DB
user restricted to the staging database. Do not put a standalone Mongo on EC2
or open Atlas to all IPs. `autoIndex:false`: reviewed unique/TTL/query/index
provisioning is a release prerequisite; no automatic syncIndexes/drop.

Enable `AUTH_ENABLED=true` only with five independent auth keys:
OTP_HMAC_SECRET, SESSION_TOKEN_SECRET, SESSION_CSRF_SECRET, CONTACT_LOOKUP_SECRET
(at least 32 bytes), CONTACT_ENCRYPTION_KEY (exactly 32 UTF-8 bytes). Rotation
needs a reviewed migration/dual-read plan; preserve keys needed to read backups.
`EMAIL_ENABLED=true` needs valid SMTP because login/registration are email-only;
SMS cannot substitute and remains disabled unless separately enabled/authorized.
Never put secrets in frontend/VITE variables. Admin bootstrap remains unresolved;
the development LOCKED seed is not a staging administrator.

The offline CLI is `backend/scripts/deployment/staging-preflight.js`; see its
[README](../../backend/scripts/deployment/README.md). Run with the same securely
loaded service environment. It accepts local-proxy loopback or managed-host
wildcard binding; it cannot validate SGs, Nginx, entropy, connections, indexes or
provider effects. Exit 0 is `CONFIG_VALIDATED/OFFLINE_ONLY`, not deployed/ready.
No real email/SMS/payment was sent in this audit.

## R2 and payments

Use the [R2 private-media plan](aws/r2-private-media.md). The user's selection
resolves the storage provider, not retention/quota/media authorization or the
remaining attachment/retention integration. Do not save private images in frontend/public or on the
EC2 root disk. Opt-in owner PNG/JPEG upload/read is now wired; guest documents,
care reports and settlement evidence remain unavailable. See the R2 plan for exact endpoints.

payOS still needs its actual route/repository/outbox composition and approved
provider secret mapping. Do not invent a callback URL or claim a return URL proves
Paid. Verify signature, amount/currency/reference, replay and races server-side
on authorized synthetic payments. Webhooks use their own verifier, not a global
CSRF bypass. Durable two-worker job/lease/fencing, storage, backup/restore,
RPO/RTO and rollback/UAT remain explicit acceptance gates.

## Official references read 15/10/2026

- [EC2 infrastructure/network security](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/infrastructure-security.html)
- [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)

These explain provider behavior; they do not establish an existing PWC deployment.
