# P35 — Handoff

Author/push: Đặng Văn Hải (`Haidvhe181849`); assigned independent reviewer:
Đoàn Tiến Đạt (`doantd11`); Leader/merger: Nguyễn Ngọc Thành (`ngocthanhhx7`).
Review identity and approval are verified separately in PR metadata.

## Scope and selected topology

The user selected one EC2 for frontend/backend, Cloudflare DNS/proxy HTTPS and
R2 image storage. Domain is `pawworldvn.shop`; proposed staging is `staging.pawworldvn.shop`. EC2 and R2 bucket do
not exist. This replaces the earlier Vercel/Render preparation. No provision,
deploy, DNS change, provider message or money movement was performed.
The original dirty P35 checkout remains untouched; edits use an isolated worktree.

[Runbook](p35-staging-runbook.md), [Nginx template](aws/nginx.conf.example),
[systemd template](aws/pwc-backend.service.example) and
[R2 plan](aws/r2-private-media.md) document same-origin routing, local backend,
trusted Cloudflare IP handling, strict TLS, private cache/logs, immutable release
paths, secret separation and recovery prerequisites. Templates are not installed
and cannot run with their unresolved certificate/include paths and unprovisioned host.
No Nginx/systemd host validation has been executed on Windows.

Offline preflight reuses runtime validation, requires email for email-only auth,
rejects SMS-only configuration and accepts IPv4 loopback for a local EC2 proxy
(or wildcard for a managed host). It never connects/sends/deploys. R2 credentials
are a proposed adapter contract only, not existing runtime environment support.

## Checks and remaining acceptance

After merging develop #82, backend lint + full 61 suites / 581 tests passed on
`942809f`. A further loopback regression and topology documentation are included
in the follow-up. Fresh backend lint and full 61 suites / 582 tests PASS, including
26 offline preflight cases; 27 local documentation links pass.
Local tests use synthetic providers and isolated Mongo, never live acceptance.

Staging remains **INTEGRATION_PENDING**: exact EC2/domain/DB/authorized release,
R2 bucket plus durable metadata/upload/read adapter and approved retention/quota,
real TLS/proxy/CSRF/cache checks, Admin bootstrap, schema/index provisioning,
provider/payOS composition, job lease/outbox with two-worker crash/restart,
RPO/RTO, restore/rollback and UAT are missing or NOT RUN. Selection of R2 resolves
the provider choice, not these gates. P44 end-to-end load evidence is a shared
release acceptance dependency, not a code/build import. P34 final integration
and unresolved financial policy gates still apply.

Keep draft and withhold approval/merge until the actual deployment acceptance
criteria are met. Historical Vercel preview status is not proof of this topology.
See [verification](p35-verification.md) and [recovery](p35-recovery.md).
