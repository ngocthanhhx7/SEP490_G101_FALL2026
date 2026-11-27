import { notificationTarget } from '../../src/utils/notifications.js';

const DEFAULT_FALLBACK = '/account/notifications';

describe('FE-NOTIFY-01 notificationTarget', () => {
  test('returns an authorized internal notification deep link unchanged', () => {
    // Arrange
    const item = { id: 'notice-1', type: 'BOOKING', deepLink: '/account/bookings' };

    // Act
    const result = notificationTarget(item);

    // Assert
    expect(result).toBe('/account/bookings');
    expect(item).toEqual({ id: 'notice-1', type: 'BOOKING', deepLink: '/account/bookings' });
  });

  test('preserves a valid internal deep link with query and hash references', () => {
    // Arrange
    const item = { type: 'ORDER', deepLink: '/customer/product-orders?status=PAID#latest' };

    // Act
    const result = notificationTarget(item);

    // Assert
    expect(result).toBe('/customer/product-orders?status=PAID#latest');
  });

  test('accepts the root path as the lower boundary of an internal link', () => {
    // Arrange
    const item = { deepLink: '/' };

    // Act
    const result = notificationTarget(item);

    // Assert
    expect(result).toBe('/');
  });

  test('accepts an encoded internal path without changing its reference', () => {
    // Arrange
    const item = { deepLink: '/account/pets/%C3%A1nh' };

    // Act
    const result = notificationTarget(item);

    // Assert
    expect(result).toBe('/account/pets/%C3%A1nh');
  });

  test('returns the caller-provided fallback for an unsupported deep link', () => {
    // Arrange
    const item = { deepLink: 'account/bookings' };
    const fallback = '/account';

    // Act
    const result = notificationTarget(item, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  test.each([
    ['missing item', undefined],
    ['null item', null],
    ['missing deepLink', {}],
    ['non-string deepLink', { deepLink: 42 }],
    ['empty deepLink', { deepLink: '' }],
    ['relative deepLink', { deepLink: 'account/notifications' }],
    ['absolute external URL', { deepLink: 'https://example.test/account' }],
    ['protocol-relative URL', { deepLink: '//example.test/account' }],
    ['whitespace-containing deepLink', { deepLink: '/account/notifications?tab=all tabs' }],
    ['backslash-containing deepLink', { deepLink: '/account\\notifications' }],
  ])('returns the default fallback for %s', (_description, item) => {
    // Arrange
    const expected = DEFAULT_FALLBACK;

    // Act
    const result = notificationTarget(item);

    // Assert
    expect(result).toBe(expected);
  });

  test('propagates an exception when reading a throwing deepLink property', () => {
    // Arrange
    const error = new Error('notification fixture getter failed');
    const item = Object.defineProperty({}, 'deepLink', { get: () => { throw error; } });

    // Act / Assert
    expect(() => notificationTarget(item)).toThrow(error);
  });
});
