import { describe, expect, jest, test } from '@jest/globals';
import { createNotificationService } from '../../src/services/notifications/notification.service.js';

const actor = { userId: 'customer-001', state: 'ACTIVE', roles: ['CUSTOMER'] };
const row = (overrides = {}) => ({ id: 'notice-1', recipientId: actor.userId, role: 'CUSTOMER', eventType: 'VISIT_REMINDER', title: 'Lịch sắp tới', message: 'Bạn có lịch chăm sóc sắp bắt đầu.', createdAt: '2026-10-15T00:00:00.000Z', ...overrides });

function makeRepository(overrides = {}) {
  return {
    list: jest.fn(async () => ({ items: [row(), row({ id: 'other', recipientId: 'other-user' })], nextCursor: 'next', unreadCount: 1 })),
    markRead: jest.fn(async () => ({ status: 'READ', readAt: '2026-10-15T01:00:00.000Z' })),
    createEvent: jest.fn(async () => ({ status: 'CREATED', notificationIds: ['notice-1'] })),
    ...overrides
  };
}

describe('notification service', () => {
  test('lists only the authenticated recipient and passes the safe projection scope', async () => {
    const repository = makeRepository();
    const service = createNotificationService({ repository, clock: () => new Date('2026-10-15T01:00:00.000Z') });
    await expect(service.list({ actor, unreadOnly: true, cursor: 'cursor', limit: 10 })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'notice-1', readAt: null })], nextCursor: 'next', unreadCount: 1
    });
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ recipientId: actor.userId, roles: ['CUSTOMER'], unreadOnly: true, limit: 10, projection: 'NOTIFICATION_SAFE_V1' }));
  });

  test('marks a notification read with a stable idempotency key and never accepts another user scope', async () => {
    const repository = makeRepository();
    const service = createNotificationService({ repository, clock: () => new Date('2026-10-15T01:00:00.000Z') });
    await expect(service.markRead({ actor, notificationId: 'notice-1' })).resolves.toMatchObject({ status: 'READ', notificationId: 'notice-1' });
    expect(repository.markRead).toHaveBeenCalledWith(expect.objectContaining({ recipientId: actor.userId, notificationId: 'notice-1', idempotencyKey: 'notification-read:customer-001:notice-1' }));
    await expect(service.markRead({ actor: { ...actor, userId: 'other-user' }, notificationId: 'notice-1' })).resolves.toBeDefined();
    expect(repository.markRead).toHaveBeenLastCalledWith(expect.objectContaining({ recipientId: 'other-user' }));
  });

  test('deduplicates concurrent event publication and rejects private metadata', async () => {
    let resolve;
    const repository = makeRepository({ createEvent: jest.fn(() => new Promise(done => { resolve = done; })) });
    const service = createNotificationService({ repository, clock: () => new Date('2026-10-15T01:00:00.000Z') });
    const command = { eventId: 'visit-event-1', eventType: 'VISIT_REMINDER', title: 'Nhắc lịch', message: 'Lịch của bạn sắp bắt đầu.', recipients: [{ recipientId: actor.userId, role: 'CUSTOMER' }], metadata: { visitId: 'visit-1' } };
    const first = service.publish(command);
    const second = service.publish(command);
    await Promise.resolve();
    expect(repository.createEvent).toHaveBeenCalledTimes(1);
    resolve({ status: 'CREATED', notificationIds: ['notice-1'] });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'CREATED', eventId: 'visit-event-1', notificationIds: ['notice-1'] },
      { status: 'CREATED', eventId: 'visit-event-1', notificationIds: ['notice-1'] }
    ]);
    await expect(service.publish({ ...command, eventId: 'visit-event-2', metadata: { accessCode: 'secret' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('fails closed for unsupported push and preserves opt-out result', async () => {
    const repository = makeRepository({ savePushSubscription: jest.fn(async () => ({ status: 'OPTED_OUT' })) });
    const service = createNotificationService({ repository, pushSupport: async () => true });
    const subscription = { endpoint: 'https://push.example/subscription', keys: { p256dh: 'public', auth: 'auth' } };
    await expect(service.registerPushSubscription({ actor, subscription })).rejects.toMatchObject({ code: 'PUSH_OPTED_OUT' });
    const unsupported = createNotificationService({ repository, pushSupport: async () => false });
    await expect(unsupported.registerPushSubscription({ actor, subscription })).rejects.toMatchObject({ code: 'PUSH_UNSUPPORTED' });
  });

  test('rejects malformed actor and unsafe deep links', async () => {
    const service = createNotificationService({ repository: makeRepository() });
    await expect(service.list({ actor: { userId: 'x', state: 'EXPIRED', roles: ['CUSTOMER'] } })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(service.publish({ eventId: 'event-1', eventType: 'SYSTEM', title: 'Title', message: 'Message', deepLink: 'https://evil.example', recipients: [actor.userId] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
