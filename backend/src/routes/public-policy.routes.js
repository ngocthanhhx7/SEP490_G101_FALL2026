import { Router } from 'express';
import { metadata } from '../utils/app-error.js';
import { publicPolicyVersionModel } from '../models/public-policy-version.model.js';

export function publicPolicyModule({ connection, clock = Date.now } = {}) {
  const PolicyVersion = connection?.models && typeof connection.model === 'function'
    ? publicPolicyVersionModel(connection) : null;
  const router = Router();
  router.get('/public-policies', async (req, res) => {
    const now = new Date(clock());
    const rows = PolicyVersion
      ? await PolicyVersion.find({ status: 'APPROVED', approvedAt: { $ne: null, $lte: now }, effectiveAt: { $lte: now },
        approvedBy: { $type: 'string', $ne: '' }, sourceRef: { $type: 'string', $ne: '' }, contentHash: { $type: 'string', $ne: '' },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] })
        .sort({ slug: 1, effectiveAt: -1 }).lean()
      : [];
    const bySlug = new Map();
    for (const row of rows) {
      const candidates = bySlug.get(row.slug) || [];
      candidates.push(row);
      bySlug.set(row.slug, candidates);
    }
    const data = [...bySlug.values()].flatMap(candidates => {
      if (candidates[1] && candidates[0].effectiveAt.getTime() === candidates[1].effectiveAt.getTime()) return [];
      const [row] = candidates;
      return [{
        slug: row.slug, versionId: row.versionId, versionPath: row.versionId,
        status: row.status, title: row.title, purpose: row.purpose,
        effectiveAt: row.effectiveAt.toISOString(),
        approvedAt: row.approvedAt?.toISOString() ?? null,
        approvedBy: row.approvedBy,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        sourceRef: row.sourceRef, contentHash: row.contentHash, sections: row.sections,
      }];
    });
    res.status(200).json({ data, meta: metadata(req) });
  });
  return { name: 'public-policy', mount: '/api/v1/public', router };
}
