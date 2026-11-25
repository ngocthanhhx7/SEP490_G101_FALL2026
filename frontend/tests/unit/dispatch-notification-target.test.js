import { notificationTarget } from '../../src/utils/notifications.js';

const first = 'a'.repeat(24), second = 'b'.repeat(24);
test.each(['/staff/dispatch', '/admin/dispatch'])('legacy dispatch notices select their own visit at %s', deepLink => {
  for (const visitId of [first, second]) {
    expect(notificationTarget({ eventType: 'DispatchReviewRequired', deepLink, metadata: { visitId } }))
      .toBe('/staff/dispatch?visitId=' + visitId);
  }
});
test('legacy links preserve the specific action and incomplete notices only open the board', () => {
  for (const key of ['closureId', 'withdrawalId']) {
    expect(notificationTarget({ deepLink: '/admin/dispatch?' + key + '=' + first })).toBe('/staff/dispatch?' + key + '=' + first);
  }
  expect(notificationTarget({ deepLink: '/admin/dispatch', eventType: 'DispatchReviewRequired' })).toBe('/staff/dispatch');
});
