import { AppError } from '../utils/app-error.js';

function publishedAt(now) {
  return {
    approvedAt: { $ne: null, $lte: now },
    effectiveAt: { $lte: now },
    approvedBy: { $type: 'string', $ne: '' },
    sourceRef: { $type: 'string', $ne: '' },
    contentHash: { $type: 'string', $ne: '' }
  };
}

function currentAt(now) {
  return {
    ...publishedAt(now),
    status: 'APPROVED',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  };
}

function unambiguousLatest([latest, alternate]) {
  if (!latest || (alternate && +latest.effectiveAt === +alternate.effectiveAt)) return null;
  return latest;
}

function project(row) {
  return {
    slug: row.slug,
    versionId: row.versionId,
    versionPath: row.versionId,
    status: row.status,
    title: row.title,
    purpose: row.purpose,
    effectiveAt: row.effectiveAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    sourceRef: row.sourceRef,
    contentHash: row.contentHash,
    sections: row.sections
  };
}

function versionNotFound() {
  return new AppError(404, 'POLICY_VERSION_NOT_FOUND', 'Policy version not found');
}

export function createPublicPolicyCatalog({ PolicyVersion, clock = Date.now }) {
  function storage() {
    if (!PolicyVersion) throw new AppError(503, 'POLICY_CATALOG_UNAVAILABLE', 'Policy storage unavailable');
    return PolicyVersion;
  }

  return {
    async list() {
      const rows = await storage().aggregate([
        { $match: currentAt(new Date(clock())) },
        { $sort: { slug: 1, effectiveAt: -1, _id: 1 } },
        // The second row detects ties without reading an entire slug history.
        { $group: { _id: '$slug', candidates: { $firstN: { input: '$$ROOT', n: 2 } } } },
        { $sort: { _id: 1 } },
        { $limit: 201 }
      ]).option({ maxTimeMS: 2000 });
      if (rows.length > 200) {
        throw new AppError(503, 'POLICY_CATALOG_UNAVAILABLE', 'Policy catalog exceeds supported bounds');
      }
      return rows.flatMap(({ candidates }) => {
        const latest = unambiguousLatest(candidates);
        return latest ? [project(latest)] : [];
      });
    },

    async readVersion(slug, versionId) {
      if (typeof slug !== 'string' || typeof versionId !== 'string'
        || !slug || slug.length > 80 || !versionId || versionId.length > 80) throw versionNotFound();
      const now = new Date(clock());
      const model = storage();
      const row = await model.findOne({
        ...publishedAt(now),
        slug,
        versionId,
        status: { $in: ['APPROVED', 'RETIRED'] }
      }).maxTimeMS(2000).lean();
      if (!row) throw versionNotFound();

      const candidates = await model.find({ ...currentAt(now), slug })
        .sort({ effectiveAt: -1, _id: 1 })
        .select({ versionId: 1, effectiveAt: 1 })
        .limit(2).maxTimeMS(2000).lean();
      const currentVersionId = unambiguousLatest(candidates)?.versionId ?? null;
      return { ...project(row), archived: currentVersionId !== row.versionId, currentVersionId };
    }
  };
}
