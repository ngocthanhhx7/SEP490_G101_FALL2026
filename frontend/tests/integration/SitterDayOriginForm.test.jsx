import { jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SitterDayOriginForm } from '../../src/pages/sitter/SitterDayOriginForm.jsx';
jest.mock('../../src/components/common/VietmapView.jsx', () => ({ VietmapView: ({ onSelect, disabled }) => <button type="button" disabled={disabled} onClick={() => onSelect([105.86, 21.02])}>Chọn ghim thử</button> }));
test('self declaration sends chosen pin and Vietnam day bounds, preserving the same uncertain operation', async () => {
  const api = { getOrigins: jest.fn().mockResolvedValue({ data: { version: 2, capabilityReady: true, items: [] } }), saveOrigin: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValueOnce({ data: { version: 3 } }) };
  render(<SitterDayOriginForm api={api} />);
  const save = await screen.findByRole('button', { name: 'Lưu điểm xuất phát' }); expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Ngày làm việc/), { target: { value: '2026-11-10' } }); fireEvent.click(screen.getByRole('button', { name: 'Chọn ghim thử' }));
  fireEvent.submit(save.closest('form'));
  await screen.findByText(/Chưa xác nhận được kết quả/);
  expect(screen.getByLabelText(/Ngày làm việc/)).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: 'Kiểm tra lại thao tác' }).closest('form'));
  await waitFor(() => expect(api.saveOrigin).toHaveBeenCalledTimes(2));
  expect(api.saveOrigin.mock.calls[1]).toEqual(api.saveOrigin.mock.calls[0]);
  expect(api.saveOrigin.mock.calls[0][0]).toEqual({ expectedVersion: 2, localDate: '2026-11-10', coordinates: [105.86, 21.02], availableFrom: '2026-11-10T08:00:00+07:00', availableUntil: '2026-11-10T18:00:00+07:00' });
});
test('employee without verified capability sees the next onboarding step', async () => {
  render(<SitterDayOriginForm api={{ getOrigins: jest.fn().mockResolvedValue({ data: { version: 0, capabilityReady: false, items: [] } }) }} />);
  await screen.findByText(/Nhờ Staff xác minh năng lực/); expect(screen.queryByRole('button', { name: 'Lưu điểm xuất phát' })).not.toBeInTheDocument();
});
