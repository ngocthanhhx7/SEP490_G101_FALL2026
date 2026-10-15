import { describe, expect, jest, test } from '@jest/globals';
import { createNotificationsApi, createWebPushAdapter } from '../../src/services/notifications-api.js';

describe('notifications API adapter', () => {
  test('builds scoped list and idempotent read requests', async () => {
    const request = jest.fn(async () => ({ data: [] }));
    const api = createNotificationsApi({ request });
    await api.list({ cursor: 'next', unreadOnly: true, limit: 10, signal: 'signal' });
    expect(request).toHaveBeenCalledWith('/notifications?unreadOnly=true&limit=10&cursor=next', { signal: 'signal' });
    await api.markRead('notice-1', 'read-key');
    expect(request).toHaveBeenLastCalledWith('/notifications/notice-1/read-receipts', { method: 'POST', idempotencyKey: 'read-key' });
    expect(() => api.markRead('../private', 'key')).toThrow(TypeError);
  });

  test('does not request browser push permission when unsupported', async () => {
    const adapter = createWebPushAdapter({ windowRef: {}, navigatorRef: {} });
    expect(adapter.supported()).toBe(false);
    await expect(adapter.requestPermission()).resolves.toEqual({ status: 'UNSUPPORTED' });
  });
});
