export const CHALLENGE_KEYS = new Set(['channel', 'contact', 'purpose']);
export const VERIFICATION_KEYS = new Set([
  'challengeId',
  'channel',
  'contact',
  'purpose',
  'code'
]);
export const REGISTRATION_VERIFICATION_KEYS = new Set([
  ...VERIFICATION_KEYS,
  'displayName',
  'policyVersions'
]);
