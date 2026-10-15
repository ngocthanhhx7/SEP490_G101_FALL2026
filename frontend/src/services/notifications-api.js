export function createNotificationsApi({ request } = {}) {
  if (typeof request !== 'function') throw new TypeError('A request function is required');
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value) ? value : (() => { throw new TypeError('Invalid notification id'); })();
  return Object.freeze({
    list({ cursor = null, unreadOnly = false, limit = 20, signal } = {}) {
      const params = new globalThis.URLSearchParams({ unreadOnly: String(unreadOnly), limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request(`/notifications?${params.toString()}`, { signal });
    },
    markRead(notificationId, idempotencyKey) {
      return request(`/notifications/${id(notificationId)}/read-receipts`, { method: 'POST', idempotencyKey });
    },
    updatePreferences(preferences, idempotencyKey) {
      return request('/notifications/preferences', { method: 'PATCH', body: { preferences }, idempotencyKey });
    },
    subscribe(subscription, idempotencyKey) {
      return request('/notifications/subscriptions', { method: 'POST', body: { subscription }, idempotencyKey });
    }
  });
}

export function createWebPushAdapter({ windowRef = globalThis, navigatorRef = globalThis.navigator } = {}) {
  const supported = () => Boolean(windowRef?.Notification && navigatorRef?.serviceWorker
    && windowRef.PushManager);
  return Object.freeze({
    supported,
    async requestPermission() {
      if (!supported()) return Object.freeze({ status: 'UNSUPPORTED' });
      const permission = await windowRef.Notification.requestPermission();
      return Object.freeze({ status: permission === 'granted' ? 'GRANTED' : permission === 'denied' ? 'DENIED' : 'DEFAULT' });
    }
  });
}
