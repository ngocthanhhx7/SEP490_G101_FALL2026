import { fail } from '../../validators/pet-care.validator.js';

// Public, service-registered employees. Eligibility is evaluated separately for the requested visit.
export async function readDirectedSitterPage(db, serviceId, page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) fail('VALIDATION_FAILED', 'Invalid sitter page');
  const rows = await db.collection('sitterpublicprofiles').aggregate([
    { $match: { state: 'APPROVED' } },
    { $lookup: { from: 'aisitterprofiles', localField: 'userId', foreignField: 'userId', as: 'capability' } },
    { $match: { capability: { $elemMatch: { active: true, serviceIds: serviceId } } } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } }, { $unwind: '$user' },
    { $match: { 'user.state': 'ACTIVE', 'user.roles': 'PET_SITTER', 'user.synthetic': { $ne: true } } },
    { $lookup: { from: 'sitterstatuses', localField: 'userId', foreignField: 'userId', as: 'status' } },
    { $match: { 'status.status': 'ACTIVE' } },
    { $lookup: { from: 'reviews', let: { sitter: '$userId', sitterText: { $toString: '$userId' } }, pipeline: [
      { $match: { direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', $expr: { $or: [
        { $eq: ['$sitterId', '$$sitter'] }, { $eq: ['$sitterId', '$$sitterText'] }
      ] } } },
      { $group: { _id: null, rating: { $avg: '$rating' }, reviewCount: { $sum: 1 },
        invalid: { $sum: { $cond: [{ $and: [{ $isNumber: '$rating' }, { $gte: ['$rating', 1] },
          { $lte: ['$rating', 5] }, { $eq: [{ $mod: [{ $convert: { input: '$rating', to: 'double', onError: null, onNull: null } }, 1] }, 0] }] }, 0, 1] } } } }
    ], as: 'reviews' } },
    { $set: { rating: { $ifNull: [{ $first: '$reviews.rating' }, null] }, reviewCount: { $ifNull: [{ $first: '$reviews.reviewCount' }, 0] },
      invalid: { $ifNull: [{ $first: '$reviews.invalid' }, 0] } } },
    { $sort: { rating: -1, userId: 1 } }, { $skip: (page - 1) * 20 }, { $limit: 21 },
    { $project: { _id: 0, id: { $toString: '$userId' }, displayName: '$user.displayName', rating: 1, reviewCount: 1, invalid: 1 } }
  ], { maxTimeMS: 5000 }).toArray();
  if (rows.some(row => row.invalid)) fail('INVALID_PROJECTION', 'Invalid published rating', 503);
  return { sitters: rows.slice(0, 20).map(({ invalid: _invalid, ...row }) => row), nextPage: rows.length > 20 ? page + 1 : null };
}
