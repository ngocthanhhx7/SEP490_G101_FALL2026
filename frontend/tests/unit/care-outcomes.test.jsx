import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssignedCare } from '../../src/pages/sitter/AssignedCare.jsx';
import { VerifiedVisitRating } from '../../src/pages/customer/VerifiedVisitRating.jsx';

test('assigned care requires an acknowledged snapshot before requesting private notes', async () => {
  const data = { capturedAt: '2026-10-30T03:00:00Z', version: 'a'.repeat(64), acknowledged: false,
    pets: [{ id: 'pet', name: 'Milo', weightKg: 4, ageMonths: null, careProfile: { allergies: { status: 'UNKNOWN' } } }] };
  const api = { care: jest.fn().mockResolvedValueOnce({ data }).mockResolvedValue({ data: { ...data, acknowledged: true } }),
    acknowledgeCare: jest.fn().mockResolvedValue({ data: { acknowledged: true } }),
    accessNotes: jest.fn().mockResolvedValue({ data: { privateAccessNotes: 'Ghi chú riêng tổng hợp', expiresAt: '2099-01-01T00:00:00Z' } }) };
  render(<AssignedCare api={api} visitId="visit" />);
  fireEvent.click(screen.getByText('Hồ sơ chăm sóc'));
  await screen.findByText('Milo');
  expect(screen.getByText('Mở ghi chú ra vào')).toBeDisabled(); expect(api.accessNotes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Xác nhận đã đọc hồ sơ'));
  await waitFor(() => expect(screen.getByText('Mở ghi chú ra vào')).toBeEnabled());
  expect(api.acknowledgeCare).toHaveBeenCalledWith('visit', data.version, expect.stringMatching(/^schedule:/));
  fireEvent.click(screen.getByText('Mở ghi chú ra vào'));
  await screen.findByText('Ghi chú riêng tổng hợp');
  fireEvent.click(screen.getByText('Đóng hồ sơ')); expect(screen.queryByText('Ghi chú riêng tổng hợp')).toBeNull();
});

test('rating preserves the same payload and key after an uncertain response', async () => {
  const api = { rateVisit: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValue({ data: { review: { id: 'review' } } }) };
  render(<VerifiedVisitRating api={api} visit={{ id: 'visit', version: 4, serviceName: 'Chăm sóc' }} />);
  fireEvent.change(screen.getByLabelText('Mức hài lòng'), { target: { value: '4' } });
  fireEvent.submit(screen.getByText('Gửi đánh giá').closest('form'));
  await screen.findByText('Kiểm tra lại đánh giá'); expect(screen.getByLabelText('Mức hài lòng')).toBeDisabled();
  fireEvent.submit(screen.getByText('Kiểm tra lại đánh giá').closest('form'));
  await screen.findByText('Đã ghi nhận đánh giá của bạn.');
  expect(api.rateVisit.mock.calls[0]).toEqual(api.rateVisit.mock.calls[1]);
  expect(api.rateVisit.mock.calls[0][1]).toEqual({ rating: 4, expectedVersion: 4 });
});
