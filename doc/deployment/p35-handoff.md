# P35 — Handoff

Author/push: Đặng Văn Hải (`Haidvhe181849`); assigned independent reviewer:
Đoàn Tiến Đạt (`doantd11`); Leader/merger: Nguyễn Ngọc Thành (`ngocthanhhx7`).
Review identity and approval are verified separately in PR metadata.

## Scope and selected topology

The user selected one EC2 for frontend/backend, Cloudflare DNS/proxy HTTPS and
R2 image storage. Domain is `pawworldvn.shop`; proposed staging is
`staging.pawworldvn.shop`. The production EC2 now exists at `54.79.81.209`
(`ap-southeast-2`, ARM64); a read-only check on 29/10/2026 saw release
`1f784887ac051108c6b83a09e4a9826850ccdcad`, green API readiness 200 and Mongo
loopback binding. The proposed staging host and R2 bucket/credentials remain
unverified. This worktree performed no provision, deploy, DNS change, provider
message or money movement.
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
(or wildcard for a managed host). It never connects/sends/deploys. R2 settings now validate and compose an opt-in PNG/JPEG transport and owner API.
`STAGING_MONGO_TOPOLOGY=remote` is the selected Atlas path and requires an
authenticated TLS replica set with certificate validation. The explicit
`local-ec2` preflight mode is limited to authenticated loopback `mongodb://`
replica-set URIs; it does not permit network or mixed hosts. This remains an
offline policy check, not deployment evidence.
Guest applicant/care/settlement evidence integration remains absent.

## Checks and remaining acceptance

The checkpoint baseline passed architecture, backend lint, 52 unit suites / 489
tests, frontend lint, 68 suites / 432 tests and the frontend build. This change
adds R2 transport and private-image coverage; focused checks pass with 54 unit
suites / 519 tests, the 5-case isolated Mongo private-image integration suite,
and the earlier 33-case architecture/R2/preflight selection. Review regressions
add 3 admission tests, 34 staging-preflight tests, 9 frontend private-image
adapter tests and 6 private-image integration cases. Local tests use synthetic
providers and isolated Mongo, never live acceptance.

The isolated worktree was rerun after the review fixes: the scoped backend lint
for `src`, `tests` and config passed; the full backend run passed 69 suites /
651 tests, including 14 integration suites / 119 tests; frontend lint and 69
suites / 441 tests passed;
the frontend build passed with the existing Vite chunk-size warning (556 kB).
The later combined R2/SMS verification on 29/10/2026 fixed the operator script's
bare `fetch` and the SMS template trailing blank line. Full backend lint and
repository `git diff --check` now pass. Earlier blocked results are superseded.
The Python trainer and deployment suites also passed (3 and 6 tests).

Staging remains **INTEGRATION_PENDING**: exact EC2/domain/DB/authorized release,
R2 bucket and live provider checks, approved retention/cleanup and attachment integration,
real TLS/proxy/CSRF/cache checks, Admin bootstrap, schema/index provisioning,
provider/payOS composition, job lease/outbox with two-worker crash/restart,
RPO/RTO, restore/rollback and UAT are missing or NOT RUN. Selection of R2 resolves
the provider choice, not these gates. P44 end-to-end load evidence is a shared
release acceptance dependency, not a code/build import. P34 final integration
and unresolved financial policy gates still apply.

Keep draft and withhold approval/merge until the actual deployment acceptance
criteria are met. Historical frontend preview status is not proof of this topology.
See [verification](p35-verification.md) and [recovery](p35-recovery.md).

## Runtime follow-up 16/10/2026

Owner-only private image upload/read, transactional quota/idempotency, actual SDK
transport/signing and server image validation are implemented behind R2_ENABLED.
See [R2 runtime](aws/r2-private-media.md). No live bucket/upload or deployment.
The production dependency audit reports zero vulnerabilities. No live R2 PUT/GET,
bucket privacy, retention/cleanup or attachment integration is claimed. Exact
check commands and their current results are recorded in the handoff from this
worktree.

## Combined follow-up 29/10/2026

Independent review confirmed all six R2 findings are addressed, with 41 focused
backend tests, 6 Mongo private-image integration tests and 9 frontend adapter
tests passing. The complete backend run passed 69 suites / 651 tests (including
119 integration tests); frontend passed 69 suites / 441 tests. Both lints,
architecture, frontend build, Python trainer/deployment (3 + 6 tests) and the
production dependency audit (0 vulnerabilities) passed. Build still reports the
556 kB chunk warning. These are local checks, not live R2 or staging acceptance.

[EC2 environment guide](ec2-environment-guide.md) explains each optional setting,
private R2 token setup and safe environment reload. Production was read only:
the running release remains `1f784887ac051108c6b83a09e4a9826850ccdcad`.
No release was activated by this follow-up. The separate authorized SMS smoke
attempt was accepted by eSMS but delivery failed; SMS remains disabled, and no
additional live SMS was sent in this verification. See the environment guide.

External hosting integrations still require dashboard verification; changing
DNS/source does not disconnect those apps. See [retirement steps](retire-legacy-hosting.md).
Linux memory, real R2/cache/restore acceptance, retention decisions and the
attachment/UI integrations remain pending. No commit, push, merge or deploy
was performed for these uncommitted changes.

## Final local verification after consolidation

Backend: 70 suites / 670 tests PASS; frontend: 71 suites / 451 tests PASS.
Both lints, architecture and frontend build PASS (568.49 kB bundle warning).
The 18 batch-reader tests and six unique #69 files are retained in this change.
Python deployment: 6 tests PASS. Isolated ARM64 memory diagnostic: 16 uploads
and 16 reads in a 384 MiB RAM/no-swap container, peak 295.9 MiB, no OOM.
See the R2 runbook for exact synthetic-auth/provider limits. Direct R2 provider
smoke and recipient-confirmed Viettel OTP delivery passed separately.

Staging/UAT, full runtime private-media/cache/retention/evidence acceptance,
trusted Hanoi OSRM data and persistent booking/offer integration remain open.
No synthetic fixture or service diagnostic is production load acceptance.
