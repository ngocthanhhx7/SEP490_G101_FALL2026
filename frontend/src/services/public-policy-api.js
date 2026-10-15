export class PublicPolicyApiError extends Error {
  constructor(code, status = 0) { super(code); this.name = 'PublicPolicyApiError'; this.code = code; this.status = status; }
}

export async function loadPublicPolicies({ fetchImpl = (...args) => fetch(...args) } = {}) {
  let response;
  try {
    response = await fetchImpl('/api/v1/public/public-policies', {
      headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', redirect: 'error'
    });
  } catch { throw new PublicPolicyApiError('NETWORK_ERROR'); }
  let envelope;
  try { envelope = await response.json(); } catch { throw new PublicPolicyApiError('INVALID_RESPONSE', response.status); }
  if (!response.ok || envelope?.meta?.schemaVersion !== 1 || !Array.isArray(envelope?.data)) {
    throw new PublicPolicyApiError('INVALID_RESPONSE', response.status);
  }
  const now = Date.now();
  return envelope.data.filter(policy => policy?.status === 'APPROVED'
    && typeof policy.slug === 'string' && typeof policy.versionId === 'string' && policy.versionId.trim()
    && typeof policy.title === 'string' && typeof policy.purpose === 'string'
    && typeof policy.sourceRef === 'string' && policy.sourceRef.trim()
    && typeof policy.contentHash === 'string' && policy.contentHash.trim()
    && typeof policy.approvedBy === 'string' && policy.approvedBy.trim()
    && Array.isArray(policy.sections)
    && Number.isFinite(Date.parse(policy.effectiveAt))
    && Number.isFinite(Date.parse(policy.approvedAt))
    && Date.parse(policy.approvedAt) <= now
    && Date.parse(policy.effectiveAt) <= now
    && (policy.expiresAt === null || policy.expiresAt === undefined || Date.parse(policy.expiresAt) > now))
    .map(policy => ({
      ...policy,
      version: policy.version ?? policy.versionId,
      versionPath: policy.versionPath ?? policy.versionId,
      summary: policy.summary ?? policy.purpose,
      effectiveDate: policy.effectiveDate ?? policy.effectiveAt,
    }));
}
