import { AppError } from '../utils/app-error.js';
export function createPublicPolicyCatalog({ PolicyVersion, clock = Date.now }) {
  return {
    async list() {
      const now = new Date(clock());
      const rows = PolicyVersion
        ? await PolicyVersion.aggregate([
            {
              $match: {
                status: 'APPROVED',
                approvedAt: { $ne: null, $lte: now },
                effectiveAt: { $lte: now },
                approvedBy: { $type: 'string', $ne: '' },
                sourceRef: { $type: 'string', $ne: '' },
                contentHash: { $type: 'string', $ne: '' },
                $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
              }
            },
            { $sort: { slug: 1, effectiveAt: -1, _id: 1 } },
            // Two rows retain the ambiguous latest-effective-time check.
            {
              $group: {
                _id: '$slug',
                candidates: { $firstN: { input: '$$ROOT', n: 2 } }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 201 }
          ]).option({ maxTimeMS: 2000 })
        : [];
      if (rows.length > 200)
        throw new AppError(
          503,
          'POLICY_CATALOG_UNAVAILABLE',
          'Policy catalog exceeds supported bounds'
        );
      const bySlug = new Map(rows.map((row) => [row._id, row.candidates]));
      const data = [...bySlug.values()].flatMap((candidates) => {
        if (
          candidates[1] &&
          candidates[0].effectiveAt.getTime() ===
            candidates[1].effectiveAt.getTime()
        )
          return [];
        const [row] = candidates;
        return [
          {
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
          }
        ];
      });

      return data;
    }
  };
}
