import { Types } from 'mongoose';
import { identityModels } from '../../models/identity.model.js';
import { payrollContractListInput } from '../../validators/payroll.validator.js';
import { vietnamDate } from '../../utils/vietnam-date.js';
import { normalizeVietnamPhone } from '../sms-template.service.js';

const PAGE_SIZE = 20;
const DAY_MS = 86400000;
const escapeRegex = value => value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');
const order = { effectiveAt: -1, version: -1, _id: -1 };

export function createContractDirectory({ connection, Contract, phoneLookup }) {
  return async function listContracts(query, asOf) {
    const { userId, tab, search, employmentType, page } = payrollContractListInput(query);
    const phone = search && normalizeVietnamPhone(search);
    const contact = phone && phoneLookup
      ? await identityModels(connection).Contact.findOne({ channel: 'PHONE', state: 'VERIFIED', lookupKey: phoneLookup(phone) })
        .select('userId').maxTimeMS(5000).lean()
      : null;
    const match = { supersededAt: null, signedAt: { $lte: asOf }, ...(userId && { employeeId: new Types.ObjectId(userId) }) };
    const searchPattern = search && new RegExp(escapeRegex(search), 'i');
    const [result] = await Contract.aggregate([
      { $match: match },
      { $project: { employeeId: 1, employeeCode: 1, employmentType: 1, monthlyBaseVnd: 1, effectiveAt: 1, endsAt: 1, endsOn: 1, version: 1 } },
      { $setWindowFields: {
        partitionBy: '$employeeId', sortBy: { effectiveAt: 1, version: 1 },
        output: {
          nextEffectiveAt: { $shift: { output: '$effectiveAt', by: 1, default: null } },
          sitterCode: { $max: '$employeeCode', window: { documents: ['unbounded', 'unbounded'] } }
        }
      } },
      { $lookup: { from: 'users', localField: 'employeeId', foreignField: '_id', pipeline: [
        { $match: { roles: 'PET_SITTER', synthetic: { $ne: true } } }, { $project: { displayName: 1 } }
      ], as: 'employee' } },
      { $unwind: '$employee' },
      { $set: { employeeCode: { $ifNull: ['$employeeCode', '$sitterCode', { $toUpper: { $substrBytes: [{ $toString: '$employeeId' }, 18, 6] } }] } } },
      ...(employmentType ? [{ $match: { employmentType } }] : []),
      ...(searchPattern ? [{ $match: { $or: [
        { 'employee.displayName': searchPattern }, { employeeCode: searchPattern }, ...(contact ? [{ employeeId: contact.userId }] : [])
      ] } }] : []),
      { $set: { status: { $switch: { branches: [
        { case: { $gt: ['$effectiveAt', asOf] }, then: 'UPCOMING' },
        { case: { $or: [
          { $and: [{ $ne: [{ $ifNull: ['$endsAt', null] }, null] }, { $lte: ['$endsAt', asOf] }] },
          { $and: [{ $ne: ['$nextEffectiveAt', null] }, { $lte: ['$nextEffectiveAt', asOf] }] }
        ] }, then: 'ENDED' }
      ], default: 'ACTIVE' } } } },
      { $facet: {
        counts: [{ $group: { _id: '$status', total: { $sum: 1 } } }],
        items: [
          ...(tab === 'ALL' ? [] : [{ $match: { status: tab } }]),
          { $sort: order }, { $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE }
        ]
      } }
    ]).option({ maxTimeMS: 5000, allowDiskUse: true });

    const counts = { active: 0, ended: 0, all: 0 };
    for (const count of result.counts) {
      counts.all += count.total;
      if (count._id !== 'UPCOMING') counts[count._id.toLowerCase()] = count.total;
    }
    const items = result.items.map(row => {
      const replacementEndsRow = row.nextEffectiveAt && (!row.endsAt || row.nextEffectiveAt <= row.endsAt);
      const endsOn = row.endsOn ?? (replacementEndsRow
        ? vietnamDate(new Date(row.nextEffectiveAt.getTime() - DAY_MS))
        : row.endsAt ? vietnamDate(row.endsAt) : null);
      return {
        id: String(row._id), employeeId: String(row.employeeId), employeeName: row.employee.displayName ?? '—',
        employeeCode: row.employeeCode, employmentType: row.employmentType, monthlyBaseVnd: row.monthlyBaseVnd,
        effectiveOn: vietnamDate(row.effectiveAt), endsOn, status: row.status
      };
    });
    return { items, counts, asOf, page, pageSize: PAGE_SIZE };
  };
}
