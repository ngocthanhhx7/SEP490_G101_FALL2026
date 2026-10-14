import { AppError } from '../utils/app-error.js';
import { publicPolicyVersionModel } from '../models/public-policy-version.model.js';

const REQUIRED_SLUGS = ['terms', 'privacy'];

function invalidPolicy() {
  throw new AppError(409, 'POLICY_NOT_AVAILABLE', 'Required policies are not available for consent');
}

function exactVersionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== REQUIRED_SLUGS.slice().sort().join('|')) return null;
  if (REQUIRED_SLUGS.some(slug => typeof value[slug] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value[slug]))) return null;
  return value;
}

export function createRegistrationPolicyService({ connection, PolicyVersion = publicPolicyVersionModel(connection), clock = Date.now } = {}) {
  if (!PolicyVersion || typeof PolicyVersion.find !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Policy version source is required');
  }

  async function validateAndBuildReceipt({ policyVersions, session, now = clock() } = {}) {
    const requested = exactVersionMap(policyVersions);
    if (!requested || !Number.isFinite(now)) invalidPolicy();
    const rows = await PolicyVersion.find({ slug: { $in: REQUIRED_SLUGS }, versionId: { $in: REQUIRED_SLUGS.map(slug => requested[slug]) } })
      .session(session).lean();
    const bySlug = new Map(rows.map(row => [`${row.slug}:${row.versionId}`, row]));
    const receipts = [];
    for (const slug of REQUIRED_SLUGS) {
      const row = bySlug.get(`${slug}:${requested[slug]}`);
      const approvedAt = row?.approvedAt?.getTime?.();
      const effectiveAt = row?.effectiveAt?.getTime?.();
      const expiresAt = row?.expiresAt?.getTime?.() ?? Infinity;
      if (!row || row.status !== 'APPROVED' || typeof row.contentHash !== 'string' || !row.contentHash.trim()
        || typeof row.sourceRef !== 'string' || !row.sourceRef.trim() || typeof row.approvedBy !== 'string' || !row.approvedBy.trim()
        || !Number.isFinite(approvedAt) || !Number.isFinite(effectiveAt)
        || approvedAt > now || effectiveAt > now || now >= expiresAt) invalidPolicy();
      receipts.push({ slug, versionId: row.versionId, contentHash: row.contentHash,
        effectiveAt: row.effectiveAt, consentedAt: new Date(now), sourceRef: row.sourceRef });
    }
    return Object.freeze(receipts);
  }

  return Object.freeze({ validateAndBuildReceipt });
}
