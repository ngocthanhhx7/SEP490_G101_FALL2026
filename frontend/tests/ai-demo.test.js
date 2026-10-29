import { readFileSync } from 'node:fs';
import { fireEvent, waitFor } from '@testing-library/react';

const html = readFileSync('demo-ai/index.html', 'utf8');
const script = readFileSync('demo-ai/app.js', 'utf8');
const manifest = {
  database: 'paw_world_care_ai_demo', date: '2026-10-27',
  accounts: [{ key: 'customer-an', id: 'customer', name: '[DEMO] Khách An', role: 'CUSTOMER', email: 'customer-an@pwc-demo.example' }],
  scenarios: [{ key: 'many', label: 'Nhiều sitter', ownerId: 'customer', serviceId: 'service', petIds: ['pet'], addressId: 'address', startAt: '2026-10-27T03:00:00Z', endAt: '2026-10-27T03:30:00Z', limit: 5 }],
  sitters: [{ id: 'sitter', name: '<img src=x onerror=alert(1)>', status: 'ACTIVE', species: ['DOG'], visits: 20, rating: 5, faults: 0 }],
  pets: [{ id: 'pet', ownerId: 'customer', name: 'Bông', species: 'DOG' }],
  addresses: [{ id: 'address', ownerId: 'customer', label: 'Demo', areaCode: 'DEMO-HN' }],
};
let calls, rejectMatch;
beforeEach(async () => {
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, '').replace(/<html[^>]*>|<\/html>/gi, '');
  calls = []; rejectMatch = false;
  window.fetch = jest.fn(async (path, options) => {
    calls.push({ path, options });
    const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
    if (path === '/demo/state') return response(manifest);
    if (path === '/api/v1/me') return response({ error: { code: 'UNAUTHENTICATED' } }, false, 401);
    if (path === '/api/v1/otp-challenges') return response({ data: { challengeId: 'test-challenge' } });
    if (path === '/demo/inbox/customer-an') return response({ code: '123456', expiresAt: '2026-10-27T03:05:00Z' });
    if (path === '/api/v1/sessions') return response({ data: { authenticated: true, csrfToken: 'demo-test-csrf', user: { displayName: '[DEMO] Khách An', roles: ['CUSTOMER'] } } });
    if (path === '/api/v1/ai/recommendations') {
      if (rejectMatch) return response({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Owned pet unavailable' } }, false, 404);
      return response({ data: { status: 'INSUFFICIENT_ELIGIBLE_SITTERS', returned: 1, shortfall: 4, exclusions: { VISIT_CONFLICT: 1 }, candidates: [{ rank: 1, displayName: '[DEMO] Lan', score: 76.3, breakdown: ['fit', 'travel', 'quality', 'reliability', 'workload'].map((key) => ({ key, points: 10, weight: 20, explanation: 'Test explanation' })), plan: { extraTravelMinutes: 15, busyMinutes: 60 } }] } });
    }
    throw new Error('Unexpected test request: ' + path);
  });
  // Execute only our standalone script in a synthetic jsdom document, no browser/network.
  new Function(script)();
  await waitFor(() => expect(document.querySelectorAll('#scenario option')).toHaveLength(1));
});
test('demo shows simulation warning and renders fixture names as text rather than HTML', () => {
  expect(document.body.textContent).toContain('không phải OSRM');
  expect(document.getElementById('sitters').textContent).toContain('<img src=x');
  expect(document.querySelector('#sitters img')).toBeNull();
});
test('demo logs in with OTP/session APIs and sends CSRF on recommendation, then displays component scores', async () => {
  fireEvent.click(document.getElementById('login'));
  await waitFor(() => expect(document.getElementById('identity').textContent).toContain('Khách An'));
  fireEvent.click(document.getElementById('match'));
  await waitFor(() => expect(document.getElementById('ranking').textContent).toContain('76.3'));
  expect(document.getElementById('status').textContent).toContain('thiếu 4');
  const call = calls.find((c) => c.path === '/api/v1/ai/recommendations');
  expect(call.options.headers['X-CSRF-Token']).toBe('demo-test-csrf');
  expect(JSON.parse(call.options.body)).not.toHaveProperty('ownerId');
});
test('ownership failure is visible and buttons are available after a failed request', async () => {
  rejectMatch = true;
  fireEvent.click(document.getElementById('match'));
  await waitFor(() => expect(document.getElementById('status').textContent).toContain('404 RESOURCE_NOT_FOUND'));
  expect(document.getElementById('match').disabled).toBe(false);
});
