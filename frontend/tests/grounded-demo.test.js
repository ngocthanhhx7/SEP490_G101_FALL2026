import { readFileSync } from 'node:fs';
import { waitFor } from '@testing-library/react';

test('public-road demo distinguishes static routing evidence, declared people and absent reviews', async () => {
  const html = readFileSync('demo-ai/index.html', 'utf8');
  const script = readFileSync('demo-ai/app.js', 'utf8');
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, '').replace(/<html[^>]*>|<\/html>/gi, '');
  const state = { database: 'paw_world_care_ai_grounded_demo', mode: 'GROUNDED_PUBLIC_ROADS',
    date: '2026-11-02', routing: 'OSRM_STATIC_PUBLIC_SAMPLE_NOT_LIVE',
    routingEvidence: { observedAt: '2026-10-29T22:47:58Z', profile: 'OSRM_CAR_V2610', attribution: 'OpenStreetMap contributors / ODbL' },
    accounts: [], scenarios: [], pets: [], addresses: [], sitters: [{ name: '[DEMO] Người mô phỏng',
      status: 'ACTIVE', species: ['DOG'], visits: 0, rating: null, faults: 0 }] };
  const original = window.fetch;
  window.fetch = jest.fn(async path => ({ ok: path === '/demo/state', status: path === '/demo/state' ? 200 : 401,
    json: async () => path === '/demo/state' ? state : { error: { code: 'UNAUTHENTICATED' } } }));
  try {
    new Function(script)();
    await waitFor(() => expect(document.getElementById('sitters').textContent).toContain('LIMITED_HISTORY'));
    expect(document.getElementById('db').textContent).toContain('KHÔNG LIVE TRAFFIC');
    expect(document.getElementById('demo-intro').textContent).toContain('demo giữ nguyên ngưỡng');
    expect(document.getElementById('demo-routing-notice').textContent).toContain('OSRM_STATIC_PUBLIC_SAMPLE_NOT_LIVE');
    expect(document.body.textContent).not.toContain('null sao');
    expect(document.body.textContent).not.toContain('đánh giá đều tổng hợp');
  } finally { window.fetch = original; }
});
