import { Types } from 'mongoose';
import { sitterPublicProfileModels } from '../../models/sitter-public-profile.model.js';
import { userModel } from '../../models/user.model.js';
import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { AppError } from '../../utils/app-error.js';

export function createMongoSitterProfileRepository({ connection, cursorSecret }) {
  const { SitterPublicProfile: profiles } = sitterPublicProfileModels(connection);
  const users = userModel(connection);
  const { SitterStatus: statuses } = sitterApplicationModels(connection);
  const codec = createScopedCursor({ secret: cursorSecret, namespace: 'public-profile-directory-v1' });
  return Object.freeze({ async readSnapshot({ scope, query }) {
    if (!['sitter-profile', 'sitter-list'].includes(scope?.kind) || !Types.ObjectId.isValid(scope.userId)
      || scope.targetId !== scope.userId) return { ready: false };
    if (query.from || query.to) throw new AppError(422, 'VALIDATION_FAILED', 'Profile dates are not supported');
    const context = { scope, search: query.search ?? '', limit: query.limit };
    const match = { state: 'APPROVED' };
    if (scope.kind === 'sitter-profile') match.userId = new Types.ObjectId(scope.userId);
    if (query.cursor) {
      const last = codec.decode(query.cursor, context);
      if (!Types.ObjectId.isValid(last.userId)) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid profile cursor');
      match.$and = [{ userId: { $gt: new Types.ObjectId(last.userId) } }];
    }
    // Profiles remain readable when moderation is unavailable; ratings stay unknown.
    const registered = await connection.db.listCollections({ name: 'reviews' }, { nameOnly: true }).toArray();
    const reviewsAvailable = registered.length > 0;
    return connection.transaction(async session => {
      const pipeline = [{ $match: match },
        { $lookup: { from: users.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' }, { $match: { 'user.state': 'ACTIVE', 'user.roles': 'PET_SITTER' } },
        { $lookup: { from: statuses.collection.name, localField: 'userId', foreignField: 'userId', as: 'status' } },
        { $match: { 'status.status': 'ACTIVE' } }];
      if (query.search) pipeline.push({ $match: { 'user.displayName': {
        $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i'
      } } });
      pipeline.push({ $sort: { userId: 1 } }, { $limit: query.limit + 1 },
        { $project: { _id: 0, userId: 1, bio: 1, areas: 1, updatedAt: 1, reviewedAt: 1,
          displayName: '$user.displayName', userUpdatedAt: '$user.updatedAt', statusUpdatedAt: { $max: '$status.updatedAt' } } });
      const rows = await profiles.aggregate(pipeline).session(session).option({ maxTimeMS: 5000 });
      const page = rows.slice(0, query.limit);
      const ids = page.map(row => row.userId);
      const ratings = reviewsAvailable ? await connection.db.collection('reviews').aggregate([
        { $match: { direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', sitterId: { $in: [...ids, ...ids.map(String)] } } },
        { $group: { _id: { $toString: '$sitterId' }, count: { $sum: 1 }, rating: { $avg: '$rating' },
          invalid: { $sum: { $cond: [{ $and: [{ $isNumber: '$rating' }, { $gte: ['$rating', 1] },
            { $lte: ['$rating', 5] }, { $eq: [{ $mod: [{ $convert: { input: '$rating', to: 'double', onError: null, onNull: null } }, 1] }, 0] }] }, 0, 1] } },
          updatedAt: { $max: '$updatedAt' } } }
      ], { session, maxTimeMS: 5000 }).toArray() : [];
      if (ratings.some(row => row.invalid)) throw new AppError(503, 'INVALID_PROJECTION', 'Invalid published rating');
      const asOf = new Date();
      return { ready: true, scope, asOf: asOf.toISOString(), sourceVersion: `sitter-public-profile/v1/${asOf.toISOString()}`,
        metrics: [], items: page.map(row => {
          const rating = ratings.find(value => value._id === String(row.userId));
          return { id: String(row.userId), displayName: row.displayName, bio: row.bio, areas: row.areas,
            approved: true, reviewsAvailable, reviewCount: reviewsAvailable ? rating?.count ?? 0 : null, rating: rating?.rating ?? null };
        }), nextCursor: rows.length > query.limit ? codec.encode({ userId: String(page.at(-1).userId) }, context) : null };
    }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
  } });
}
