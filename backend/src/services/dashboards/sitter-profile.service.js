import { createProjectionReader, ID, fail, text, integer } from './read-projection.js';
export function createSitterProfileService({ repository } = {}) {
  return createProjectionReader({ kind: 'sitter-profile', roles: ["PET_SITTER"], repository,
    project: (snapshot, scope) => ({ metrics: [], items: snapshot.items.map(row => {
      if (!ID.test(row.id ?? '') || !text(row.displayName, 100) || !row.displayName
        || !text(row.bio, 1000) || !Array.isArray(row.areas) || row.areas.length > 30
        || !row.areas.every(area => text(area, 100))
        || row.approved !== true || row.id !== scope.userId) fail(503, 'INVALID_PROJECTION');
      const reviewCount = row.reviewsAvailable === false && row.reviewCount === null && row.rating === null ? null : integer(row.reviewCount);
      if (reviewCount > 0 && (!Number.isFinite(row.rating) || row.rating < 1 || row.rating > 5)) fail(503, 'INVALID_PROJECTION');
      return { id: row.id, displayName: row.displayName, bio: row.bio, areas: [...row.areas],
        reviewCount, rating: reviewCount ? row.rating : null, ...(reviewCount === null ? { reviewsAvailable: false } : {}) };
    }) }) });
}
