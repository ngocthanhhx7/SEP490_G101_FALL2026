import { fireEvent, render, screen, within } from '@testing-library/react';
import { BookingSitterRatings } from '../../src/pages/customer/BookingSitterRatings.jsx';

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

const shift = (id, sitterId, sitterName, state = 'COMPLETED') => ({ id, sitterId, sitterName, state, version: 3 });
const booking = (extra = {}) => ({
  ratingDeadlineAt: '2099-01-08T00:00:00Z', ratedSitterIds: ['rated'],
  careShifts: [shift('first', 'an', 'An'), shift('second', 'an', 'An'), shift('third', 'binh', 'Bình', 'ASSIGNED'),
    shift('fourth', 'rated', 'Chi')], ...extra
});

test('ST-BKG-10: one button per pet sitter who finished a visit, hidden after the rating is saved', async () => {
  const api = { rateVisit: jest.fn(async () => ({ data: { review: { id: 'review' } } })) };
  render(<BookingSitterRatings api={api} booking={booking()} />);
  expect(screen.getAllByRole('button', { name: /^Đánh giá người chăm sóc/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Đánh giá người chăm sóc: An' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Để sau' })).toBeInTheDocument();
  fireEvent.submit(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }).closest('form'));
  expect(await screen.findByText('Cảm ơn bạn. Đánh giá của bạn đã được lưu.')).toBeInTheDocument();
  expect(api.rateVisit).toHaveBeenCalledWith('second', { rating: 5, comment: '', expectedVersion: 3 }, expect.any(String));
  expect(screen.queryByRole('button', { name: /^Đánh giá người chăm sóc/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('ST-BKG-10: later keeps the button without sending a rating', () => {
  const api = { rateVisit: jest.fn() };
  render(<BookingSitterRatings api={api} booking={booking()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Đánh giá người chăm sóc: An' }));
  fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Đánh giá người chăm sóc: An' })).toBeInTheDocument();
  expect(api.rateVisit).not.toHaveBeenCalled();
});

test.each([
  ['the booking has not ended', { ratingDeadlineAt: null }],
  ['the seven days are over', { ratingDeadlineAt: '2020-01-01T00:00:00Z' }]
])('ST-BKG-10: no rating button when %s', (_label, extra) => {
  render(<BookingSitterRatings api={{}} booking={booking(extra)} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
