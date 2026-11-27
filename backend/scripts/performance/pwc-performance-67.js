/* global __ENV, __ITER */
// Run one smoke case: k6 run -e PERF_CASE=ST-PERF-01 -e PERF_PATH=/health scripts/performance/pwc-performance-67.js
// Use PERF_REQUESTS for a case-specific method/body/headers mapping.
// Use PERF_CASE=all only to inventory configured cases; it is not a capacity test.
import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { PERFORMANCE_CASES, PERFORMANCE_REQUESTS } from './performance-case-plan.js';

const CASES = PERFORMANCE_CASES;

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const CASE_ID = __ENV.PERF_CASE || 'ST-PERF-01';
const P95_MS = Number(__ENV.P95_MS || 2000);
const blockedCases = new Counter('performance_cases_blocked');
const executedCases = new Rate('performance_cases_executed');
const blockedCaseIds = new Set();

export const options = {
  scenarios: {
    performance: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 1),
      duration: __ENV.DURATION || '1m'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [`p(95)<${P95_MS}`]
  }
};

function configuredRequests() {
  if (__ENV.PERF_PATH) {
    return { [CASE_ID]: { path: __ENV.PERF_PATH, method: __ENV.PERF_METHOD || 'GET' } };
  }
  try {
    if (__ENV.PERF_REQUESTS) return JSON.parse(__ENV.PERF_REQUESTS);
    return __ENV.PERF_USE_MANIFEST === 'true' ? PERFORMANCE_REQUESTS : {};
  } catch (error) {
    throw new Error(`PERF_REQUESTS must be valid JSON; use PERF_PATH for a simple request: ${error.message}`);
  }
}

function selectedCase() {
  if (CASE_ID === 'all') return CASES[__ITER % CASES.length];
  const item = CASES.find(testCase => testCase.id === CASE_ID);
  if (!item) throw new Error(`Unknown PERF_CASE: ${CASE_ID}`);
  return item;
}

function runConfiguredRequest(testCase, request) {
  const method = request.method || 'GET';
  const path = request.path;
  if (!path) throw new Error(`${testCase.id} request requires a path`);

  const response = http.request(method, `${BASE_URL}${path}`, request.body, {
    headers: request.headers || {},
    tags: { performance_case: testCase.id }
  });
  const expected = request.expectedStatus || [200, 201, 202, 204, 304];
  executedCases.add(1, { performance_case: testCase.id });
  check(response, {
    [`${testCase.id} returns an expected status`]: result => expected.includes(result.status)
  });
}

export default function performanceCase() {
  const testCase = selectedCase();
  const request = configuredRequests()[testCase.id];

  group(`${testCase.id}: ${testCase.scenario}`, () => {
    if (!request) {
      blockedCases.add(1, { performance_case: testCase.id, kind: testCase.kind });
      blockedCaseIds.add(testCase.id);
      console.warn(`${testCase.id} is not executable without PERF_REQUESTS configuration`);
      return;
    }
    runConfiguredRequest(testCase, request);
  });
}

export function handleSummary(data) {
  return {
    stdout: `${JSON.stringify({
      selectedCase: CASE_ID,
      caseCount: CASES.length,
      blockedCases: data.metrics.performance_cases_blocked?.values?.count || 0,
      blockedCaseIds: [...blockedCaseIds],
      executedCases: data.metrics.performance_cases_executed?.values || {}
    }, null, 2)}\n`
  };
}
