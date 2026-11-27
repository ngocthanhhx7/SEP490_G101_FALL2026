// Source-of-truth metadata for the 67 performance cases.
// Request bodies and IDs stay outside this file because they come from the
// synthetic fixture set and the role-specific session file.
export const PERFORMANCE_CASES = Object.freeze(`
ST-PERF-01|Page load time with up to 200 users active at the same time|page
ST-PERF-02|Confirming a booking with up to 200 users active|api
ST-PERF-03|First offers of a new visit|job
ST-PERF-04|Expired offers passed to the next pet sitters|job
ST-PERF-05|Payment result recorded|provider
ST-PERF-06|Sign-in code handed to the provider|provider
ST-PERF-07|200 users active at the same time|page
ST-PERF-08|Shop pages with up to 200 users active|page
ST-PERF-09|Sale Staff pages with up to 200 users active|page
ST-PERF-10|Admin pages with up to 200 users active|page
ST-PERF-11|Staff and pet sitter pages with up to 200 users active|page
ST-PERF-12|Single-user baseline response time|api
ST-PERF-13|Load ramp from 50 to 500 users|api
ST-PERF-14|Stress test beyond expected capacity|infra
ST-PERF-15|Spike test|infra
ST-PERF-16|Soak test for 2 to 8 hours|infra
ST-PERF-17|Recovery after traffic drops|infra
ST-PERF-18|Mixed workload across all roles|api
ST-PERF-19|Throughput capacity|api
ST-PERF-20|Two customers book the same sitter/time slot concurrently|concurrency
ST-PERF-21|Two sitters accept the same invitation concurrently|concurrency
ST-PERF-22|Concurrent inventory updates|concurrency
ST-PERF-23|Duplicate booking command with the same Idempotency-Key|concurrency
ST-PERF-24|Duplicate payment webhook|concurrency
ST-PERF-25|Concurrent payment webhooks|concurrency
ST-PERF-26|Concurrent booking reschedule and cancel|concurrency
ST-PERF-27|Concurrent visit status updates|concurrency
ST-PERF-28|Login, OTP and session refresh API load|api
ST-PERF-29|Service list and service detail API load|api
ST-PERF-30|Sitter search and availability API load|api
ST-PERF-31|Booking list and detail API load|api
ST-PERF-32|Reschedule and cancel booking API load|api
ST-PERF-33|Sitter assignment and invitation API load|api
ST-PERF-34|Care report and incident update API load|api
ST-PERF-35|Product search, filter and pagination API load|api
ST-PERF-36|Pricing quote API load|api
ST-PERF-37|Refund request and approval API load|api
ST-PERF-38|Large-data database query performance|db
ST-PERF-39|Pagination with large datasets|db
ST-PERF-40|Index usage and slow-query detection|db
ST-PERF-41|MongoDB connection pool under load|db
ST-PERF-42|Concurrent MongoDB reads and writes|db
ST-PERF-43|Admin reports over large time ranges|db
ST-PERF-44|Concurrent dashboard and report access|db
ST-PERF-45|payOS timeout and error handling|provider
ST-PERF-46|Slow payOS response|provider
ST-PERF-47|Email/SMS provider unavailable|provider
ST-PERF-48|Notification retry without duplicate messages|provider
ST-PERF-49|Object-storage upload at multiple file sizes|provider
ST-PERF-50|Object-storage upload failure or slow response|provider
ST-PERF-51|AI/matching service timeout or unavailable|provider
ST-PERF-52|Concurrent offer jobs|job
ST-PERF-53|Offer job delay under backend load|job
ST-PERF-54|Background job retry after failure|job
ST-PERF-55|Duplicate job execution across backend instances|job
ST-PERF-56|Notification/outbox backlog processing|job
ST-PERF-57|Many visits processed simultaneously|job
ST-PERF-58|Frontend Web Vitals|page
ST-PERF-59|Frontend on slow 3G/4G network|page
ST-PERF-60|Pages with large booking/product lists|page
ST-PERF-61|Frontend upload with small, medium and large files|page
ST-PERF-62|Node.js CPU, memory and event-loop behavior|infra
ST-PERF-63|MongoDB CPU, memory and connection exhaustion|infra
ST-PERF-64|Backend restart during active traffic|infra
ST-PERF-65|MongoDB replica-set failover|infra
ST-PERF-66|Cloudflare and cache behavior|infra
ST-PERF-67|Recovery after database or provider outage|infra
`.trim().split('\n').map(line => {
  const [id, scenario, kind] = line.split('|');
  return Object.freeze({ id, scenario, kind });
}));

// Only these two mappings are executable without a fixture or authenticated
// session. The remaining entries intentionally keep their route contract and
// dependency list visible, so an incomplete run is reported as blocked.
export const PERFORMANCE_REQUESTS = Object.freeze({
  'ST-PERF-01': Object.freeze({ method: 'GET', path: '/health', expectedStatus: [200], mode: 'smoke-only' }),
  'ST-PERF-12': Object.freeze({ method: 'GET', path: '/health', expectedStatus: [200], mode: 'harness-baseline-only' })
});

const dependencies = Object.freeze({
  page: ['frontend-url', 'browser-session-for-protected-pages'],
  api: ['request-body', 'fixture-ids', 'role-session'],
  job: ['job-fixtures', 'worker-observability'],
  provider: ['provider-mock', 'provider-fault-mode'],
  db: ['large-dataset', 'mongo-profiler'],
  concurrency: ['two-or-more-role-sessions', 'idempotency-fixtures'],
  infra: ['system-metrics', 'fault-injection-approval']
});

export const PERFORMANCE_CASE_PLAN = Object.freeze(
  Object.fromEntries(PERFORMANCE_CASES.map(testCase => [testCase.id, Object.freeze({
    ...testCase,
    request: PERFORMANCE_REQUESTS[testCase.id] ?? null,
    status: PERFORMANCE_REQUESTS[testCase.id] ? 'smoke-ready' : 'fixture-required',
    dependencies: dependencies[testCase.kind]
  })]))
);
