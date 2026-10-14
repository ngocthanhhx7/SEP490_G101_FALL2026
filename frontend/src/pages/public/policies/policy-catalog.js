// Only approved and effective policies may enter this catalog. P17's public
// policy source is not integrated yet, so guests currently receive no articles.
export const publicPolicies = Object.freeze([]);

const pendingPolicySlugs = new Set([
  'terms',
  'privacy',
  'contact-verification',
  'service-areas',
  'booking',
  'payments',
  'cancellations-refunds',
  'care-evidence',
  'safety-complaints',
  'sitter-onboarding',
  'settlement-and-ratings',
  'pwa',
]);

export function policyHref(slug, versionPath = 'draft-v1') {
  return `/policies/${slug}/${versionPath}`;
}

export function findPolicy(slug, version, policies = publicPolicies) {
  return policies.find(policy => policy.slug === slug
    && (!version || policy.versionPath === version)) || null;
}

export function isUnpublishedPolicyPath(slug, version) {
  return pendingPolicySlugs.has(slug)
    && (!version || version === 'draft-v1')
    && !findPolicy(slug, version);
}
