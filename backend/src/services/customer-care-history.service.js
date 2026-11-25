import { Types } from 'mongoose';

const HEX24 = /^[a-f0-9]{24}$/i;
const oid = (value) => new Types.ObjectId(value);

function petMatchFilter(petIds) {
  if (!Array.isArray(petIds) || !petIds.length) return {};
  const strings = [...new Set(petIds.map(String).filter(Boolean))];
  const values = [...strings, ...strings.filter((id) => HEX24.test(id)).map(oid)];
  return {
    $or: [
      { petIds: { $in: values } },
      { 'snapshots.pets.id': { $in: strings } }
    ]
  };
}

// A completed care visit is real service history, including a completed visit in a multi-visit booking.
export async function hasCompletedCustomerCare(db, customerId) {
  return Boolean(
    await db
      .collection('visits')
      .findOne({ customerId: oid(customerId), state: 'COMPLETED' }, { projection: { _id: 1 }, maxTimeMS: 5000 })
  );
}

// GBR-12: customer may only request an active, approved pet sitter who previously completed care for one of the chosen pets.
export async function hasPreviousPetSitter(db, customerId, sitterId, petIds, session = null) {
  if (!HEX24.test(String(customerId)) || !HEX24.test(String(sitterId))) return false;
  const query = {
    customerId: oid(customerId),
    sitterId: oid(sitterId),
    state: 'COMPLETED',
    ...petMatchFilter(petIds)
  };
  const options = { projection: { _id: 1 }, maxTimeMS: 5000, ...(session ? { session } : {}) };
  return Boolean(await db.collection('visits').findOne(query, options));
}

export async function listPreviousPetSitters(db, customerId, petIds = null, session = null) {
  if (!HEX24.test(String(customerId))) return [];
  const query = {
    customerId: oid(customerId),
    state: 'COMPLETED',
    sitterId: { $type: 'objectId' },
    ...petMatchFilter(petIds)
  };
  const options = { projection: { sitterId: 1 }, maxTimeMS: 5000, ...(session ? { session } : {}) };
  const visits = await db.collection('visits').find(query, options).limit(500).toArray();
  const sitterOids = [...new Map(visits.map((row) => [String(row.sitterId), row.sitterId])).values()];
  if (!sitterOids.length) return [];

  const [users, profiles, statuses] = await Promise.all([
    db
      .collection('users')
      .find(
        { _id: { $in: sitterOids }, state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } },
        { projection: { displayName: 1 }, maxTimeMS: 5000, ...(session ? { session } : {}) }
      )
      .toArray(),
    db
      .collection('sitterpublicprofiles')
      .find(
        { userId: { $in: sitterOids }, state: 'APPROVED' },
        { projection: { userId: 1 }, maxTimeMS: 5000, ...(session ? { session } : {}) }
      )
      .toArray(),
    db
      .collection('sitterstatuses')
      .find(
        { userId: { $in: sitterOids }, status: 'ACTIVE' },
        { projection: { userId: 1 }, maxTimeMS: 5000, ...(session ? { session } : {}) }
      )
      .toArray()
  ]);

  const approvedIds = new Set(profiles.map((row) => String(row.userId)));
  const activeIds = new Set(statuses.map((row) => String(row.userId)));
  return users
    .filter((user) => approvedIds.has(String(user._id)) && activeIds.has(String(user._id)))
    .map((user) => ({ id: String(user._id), displayName: user.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi') || a.id.localeCompare(b.id));
}
