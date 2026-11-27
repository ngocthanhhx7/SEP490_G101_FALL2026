# Performance diagnostics

`dispatch-benchmark.js` measures the existing dispatch service with synthetic
in-process repository/ranker ports, 100 candidates and concurrency 1. Run from
`backend/` with `node scripts/performance/dispatch-benchmark.js`; pass another
checkout's backend directory to compare the same harness against that source.
It prints timing summaries and port call counts only. It does not connect to
MongoDB, test browser pages or verify booking confirmation under load.

## PWC performance harness

The 67 cases are defined in `performance-case-plan.js`. The plan is explicit
about readiness: only `ST-PERF-01` and `ST-PERF-12` have a safe `/health`
smoke mapping. The other 65 cases remain `fixture-required` until their real
request body, IDs, role session and expected status are supplied. This prevents
`PERF_CASE=all` from being reported as a false full run.

Run the non-mutating preflight from `backend/`:

```powershell
node --env-file-if-exists=.env scripts/performance/performance-preflight.mjs `
  --base-url=http://127.0.0.1:3000 `
  --frontend-url=http://127.0.0.1:5173 `
  --require-local-mongo=true
```

Run the known smoke mapping:

```powershell
k6 run -e PERF_CASE=ST-PERF-01 -e PERF_USE_MANIFEST=true `
  scripts/performance/pwc-performance-67.js
```

`PERF_CASE=all` is an inventory run unless every case has a request mapping.
The summary includes `blockedCaseIds` so blocked cases are visible.

## Test accounts, sessions and CSRF

The account command is dry-run by default. It creates five role accounts,
verified synthetic email contacts, and session cookie/CSRF pairs only when all
guards below pass:

```powershell
node --env-file-if-exists=.env scripts/performance/seed-performance-accounts.mjs
$env:PERF_ALLOW_DB_WRITE='true'
node --env-file-if-exists=.env scripts/performance/seed-performance-accounts.mjs --apply
```

The apply path accepts only `development`, a database ending in `_dev`, and a
loopback MongoDB URI. Session material is written under ignored
`backend/storage/performance/`; never commit or paste that file into a report.

## Synthetic dataset and fixture status

Generate a deterministic fixture manifest without touching MongoDB:

```powershell
node scripts/performance/generate-performance-fixtures.mjs --count=1000
```

The manifest covers users, sitters, products, bookings, payments and jobs and
is the ID contract for the k6 request mappings. It is intentionally not a
MongoDB seed adapter: booking, payment and worker storage are feature-gated
and their schemas must be provisioned through the existing domain migrations
and services first. Existing safe seed entry points remain dry-run by default:
`seeds/demo-services.js`, `seeds/product-sales.js`, `seeds/pricing.js`,
`seeds/grooming-demo.js` and `seeds/sitter-matching.js`.

## Provider doubles

Start the deterministic provider double for isolated adapter tests:

```powershell
node scripts/performance/provider-mock.mjs
$env:PERF_PROVIDER_FAILURE='timeout' # or 503 / 429
$env:PERF_PROVIDER_DELAY_MS='2500'
node scripts/performance/provider-mock.mjs
```

The server exposes `/payos/v2/payment-requests`, `/email`, `/sms`,
`/r2/upload` and `/ai/recommendations`. The live payOS adapter currently
validates the official payOS origin by default. For a local-only payOS run,
set `PAYOS_SANDBOX=true` and `PAYOS_API_BASE_URL=http://127.0.0.1:4310`; the
mock signs responses with `PERF_PROVIDER_CHECKSUM_KEY`, which must equal
`PAYOS_CHECKSUM_KEY`. Email, SMS, R2 and AI still use their own transport
boundaries, so do not silently treat the standalone endpoints as live runtime
integration for those providers.

## Browser and Web Vitals

`browser-web-vitals.js` measures public pages and records page load, First Paint
and LCP. It requires a k6 build with the Chromium browser module:

```powershell
k6 run scripts/performance/browser-web-vitals.js
```

Authenticated pages are deliberately not included until the session file is
fed into a browser runner; public page timings must not be mistaken for role
workspace timings.

## MongoDB profiler and system metrics

Enable the profiler only on the isolated local performance database, collect
the load run, then disable it after the run. Use MongoDB's own admin command or
the DBA-approved wrapper for the exact environment. Capture host/process data
with:

```powershell
powershell -File scripts/performance/system-metrics.ps1 `
  -DurationSeconds 300 -IntervalSeconds 5 -BackendPid 26492 `
  -OutputPath storage/performance/system-metrics.csv
```

Do not enable profiling against the current remote/dev `.env` without an
explicit owner decision; query text and operational data may be recorded.

## Fault injection

Provider timeout/error modes use `provider-mock.mjs`. Process interruption is
separate and guarded:

```powershell
$env:PERF_FAULT_INJECTION='true'
powershell -File scripts/performance/fault-injection.ps1 -Action status
powershell -File scripts/performance/fault-injection.ps1 -Action stop-process `
  -ProcessId <explicit-workspace-pid> -ConfirmPerformanceFault
```

The script does not automatically restart services or force MongoDB failover.
Restart/failover must be performed by the operator using the local replica-set
procedure, while k6 and `system-metrics.ps1` continue collecting evidence.

Keep actual query plans and journey/load evidence in
[doc/testing](../../../doc/testing/README.md). The
[P44 record](../../../doc/testing/p44-performance.md) lists the missing
integration gates and how to collect the next measurements.
