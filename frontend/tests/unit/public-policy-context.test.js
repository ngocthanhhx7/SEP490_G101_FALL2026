import { registrationPolicyReadiness } from '../../src/contexts/PublicPolicyContext.jsx';

const now = Date.parse('2026-10-15T00:00:00Z');
const policy = (slug, patch = {}) => ({
  slug,
  versionId: `${slug}-v1`,
  status: 'APPROVED',
  approvedAt: '2026-10-01T00:00:00Z',
  effectiveAt: '2026-10-10T00:00:00Z',
  ...patch,
});
const readyCatalog = () => ['terms', 'privacy'].map(slug => policy(slug));

test('FE-POLICY-01 TC01 returns current terms and privacy versions for an approved effective catalog', () => {
  // Arrange
  const policies = readyCatalog();

  // Act
  const result = registrationPolicyReadiness(policies, now);

  // Assert
  expect(result).toEqual({
    ready: true,
    versions: { terms: 'terms-v1', privacy: 'privacy-v1' },
    key: JSON.stringify({ terms: 'terms-v1', privacy: 'privacy-v1' }),
  });
});

test('FE-POLICY-01 TC02 selects the latest effective version for each required policy', () => {
  // Arrange
  const policies = [
    policy('terms', { versionId: 'terms-v1', effectiveAt: '2026-10-01T00:00:00Z' }),
    policy('terms', { versionId: 'terms-v2', effectiveAt: '2026-10-10T00:00:00Z' }),
    policy('privacy'),
  ];

  // Act
  const result = registrationPolicyReadiness(policies, now);

  // Assert
  expect(result).toEqual(expect.objectContaining({ ready: true, versions: { terms: 'terms-v2', privacy: 'privacy-v1' } }));
});

test('FE-POLICY-01 TC03 fails closed when the catalog is null, undefined, or not an array', () => {
  // Act and assert
  for (const policies of [null, undefined, {}]) {
    expect(registrationPolicyReadiness(policies, now)).toEqual({ ready: false, key: '' });
  }
});

test('FE-POLICY-01 TC04 fails closed when now is NaN or Infinity', () => {
  // Act and assert
  for (const invalidNow of [NaN, Infinity]) {
    expect(registrationPolicyReadiness(readyCatalog(), invalidNow)).toEqual({ ready: false, key: '' });
  }
});

test('FE-POLICY-01 TC08 fails closed when a required policy is missing', () => {
  // Act
  const result = registrationPolicyReadiness([policy('terms')], now);

  // Assert
  expect(result).toEqual({ ready: false, key: '' });
});

test.each([
  ['TC09', { status: 'DRAFT' }],
  ['TC10', { versionId: '   ' }],
  ['TC11', { approvedAt: 'invalid' }],
  ['TC12', { effectiveAt: 'invalid' }],
])('FE-POLICY-01 %s fails closed for a required policy with invalid approval metadata', (_, patch) => {
  // Arrange
  const policies = [policy('terms', patch), policy('privacy')];

  // Act
  const result = registrationPolicyReadiness(policies, now);

  // Assert
  expect(result).toEqual({ ready: false, key: '' });
});

test.each([
  ['TC13', { approvedAt: '2026-10-15T00:00:00.001Z' }],
  ['TC14', { effectiveAt: '2026-10-15T00:00:00.001Z' }],
])('FE-POLICY-01 %s fails closed before approval or effective time', (_, patch) => {
  // Arrange
  const policies = [policy('terms', patch), policy('privacy')];

  // Act
  const result = registrationPolicyReadiness(policies, now);

  // Assert
  expect(result).toEqual({ ready: false, key: '' });
});

test.each([
  ['TC15', '2026-10-15T00:00:00Z'],
  ['TC16', '2026-10-14T23:59:59.999Z'],
  ['TC17', 'invalid'],
])('FE-POLICY-01 %s fails closed when a required policy expires at or before now', (_, expiresAt) => {
  // Arrange
  const policies = [policy('terms', { expiresAt }), policy('privacy')];

  // Act
  const result = registrationPolicyReadiness(policies, now);

  // Assert
  expect(result).toEqual({ ready: false, key: '' });
});

test('FE-POLICY-01 TC18 fails closed when two current versions share the latest effective time', () => {
  // Arrange
  const policies = [...readyCatalog(), policy('terms', { versionId: 'terms-v2' })];

  // Act
  const result = registrationPolicyReadiness(policies, now);

  // Assert
  expect(result).toEqual({ ready: false, key: '' });
});
