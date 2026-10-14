import { expect, test } from '@jest/globals';
import { createRegistrationPolicyService } from '../../src/services/registration-policy.service.js';

function source(rows) {
  return { find: () => ({ session: () => ({ lean: async () => rows }) }) };
}

const approved = [
  { slug: 'terms', versionId: 'terms-v1', status: 'APPROVED', approvedAt: new Date('2026-10-01'), approvedBy: 'leader', effectiveAt: new Date('2026-10-02'), expiresAt: null, contentHash: 't', sourceRef: 'approved/t' },
  { slug: 'privacy', versionId: 'privacy-v1', status: 'APPROVED', approvedAt: new Date('2026-10-01'), approvedBy: 'leader', effectiveAt: new Date('2026-10-02'), expiresAt: null, contentHash: 'p', sourceRef: 'approved/p' },
];

test('accepts exactly the current approved Terms and Privacy versions and builds receipts', async () => {
  const service = createRegistrationPolicyService({ PolicyVersion: source(approved), clock: () => Date.parse('2026-10-14') });
  await expect(service.validateAndBuildReceipt({ policyVersions: { terms: 'terms-v1', privacy: 'privacy-v1' } }))
    .resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'terms', versionId: 'terms-v1', contentHash: 't' }),
      expect.objectContaining({ slug: 'privacy', versionId: 'privacy-v1', contentHash: 'p' }),
    ]));
});

test.each([
  { terms: 'terms-v1', privacy: 'missing' },
  { terms: 'terms-v1' },
  { terms: 'terms-v1', privacy: 'privacy-v1', extra: 'x' },
])('rejects stale, missing or extra version selections: %o', async policyVersions => {
  const service = createRegistrationPolicyService({ PolicyVersion: source(approved), clock: () => Date.parse('2026-10-14') });
  await expect(service.validateAndBuildReceipt({ policyVersions })).rejects.toMatchObject({ code: 'POLICY_NOT_AVAILABLE' });
});

test('rejects a draft, future or expired version', async () => {
  const rows = approved.map(row => ({ ...row }));
  rows[0].status = 'DRAFT';
  rows[1].expiresAt = new Date('2026-10-13');
  const service = createRegistrationPolicyService({ PolicyVersion: source(rows), clock: () => Date.parse('2026-10-14') });
  await expect(service.validateAndBuildReceipt({ policyVersions: { terms: 'terms-v1', privacy: 'privacy-v1' } }))
    .rejects.toMatchObject({ code: 'POLICY_NOT_AVAILABLE' });
});
