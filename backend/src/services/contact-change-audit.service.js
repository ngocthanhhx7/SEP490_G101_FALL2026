import { Types } from 'mongoose';

const ACTIONS = new Set(['CONTACT_LINKED', 'CONTACT_REPLACED']);
const CHANNELS = new Set(['EMAIL', 'PHONE']);

export function createContactChangeAuditService({ connection } = {}) {
  if (typeof connection?.collection !== 'function') throw new TypeError('A MongoDB connection is required');
  const events = connection.collection('account_contact_audit_events');

  async function record({ eventId, actorId, contactId, action, channel, occurredAt, session } = {}) {
    if (typeof eventId !== 'string' || !eventId || !Types.ObjectId.isValid(actorId)
      || !Types.ObjectId.isValid(contactId) || !ACTIONS.has(action) || !CHANNELS.has(channel)
      || !(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime()) || !session) {
      throw new TypeError('Contact audit event is invalid');
    }
    await events.insertOne({
      _id: eventId,
      eventId,
      logicalOperationId: eventId,
      correlationId: eventId,
      schemaVersion: 1,
      type: action,
      aggregateType: 'CONTACT',
      aggregateId: new Types.ObjectId(contactId),
      aggregateVersion: 1,
      actorRef: { userId: new Types.ObjectId(actorId) },
      occurredAt,
      payload: { channel }
    }, { session });
  }

  return Object.freeze({ record });
}
