import { loadPublicPolicies, PublicPolicyApiError } from '../../src/services/public-policy-api.js';

function response(data, meta = { schemaVersion: 1 }) {
  return { ok: true, status: 200, json: async () => ({ data, meta }) };
}

test('loads only approved effective unexpired policy DTOs from the public source', async () => {
  const now = new Date().toISOString();
  const policies = await loadPublicPolicies({ fetchImpl: async () => response([
    { slug: 'terms', versionId: 'terms-v1', status: 'APPROVED', title: 'Terms', purpose: 'Use', approvedBy: 'leader', sourceRef: 'approved/terms', contentHash: 'hash-terms', sections: [], approvedAt: '2020-01-01T00:00:00Z', effectiveAt: '2020-01-02T00:00:00Z', expiresAt: null },
    { slug: 'privacy', versionId: 'privacy-draft', status: 'DRAFT', title: 'Privacy', purpose: 'Use', approvedBy: 'leader', sourceRef: 'approved/privacy', contentHash: 'hash-privacy', sections: [], approvedAt: now, effectiveAt: now },
    { slug: 'booking', versionId: 'booking-expired', status: 'APPROVED', title: 'Booking', purpose: 'Use', approvedBy: 'leader', sourceRef: 'approved/booking', contentHash: 'hash-booking', sections: [], approvedAt: '2020-01-01T00:00:00Z', effectiveAt: '2020-01-02T00:00:00Z', expiresAt: '2020-01-03T00:00:00Z' },
  ]) });
  expect(policies.map(policy => policy.versionId)).toEqual(['terms-v1']);
  expect(policies[0]).toMatchObject({ version: 'terms-v1', versionPath: 'terms-v1', summary: 'Use', effectiveDate: '2020-01-02T00:00:00Z' });
});

test('rejects a malformed or unauthenticated policy response', async () => {
  await expect(loadPublicPolicies({ fetchImpl: async () => response({}, { schemaVersion: 1 }) }))
    .rejects.toBeInstanceOf(PublicPolicyApiError);
  await expect(loadPublicPolicies({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) }))
    .rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 503 });
});
