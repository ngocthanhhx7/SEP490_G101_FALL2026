import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HandoverConfirmationPage } from '../../src/pages/sitter/HandoverConfirmationPage.jsx';

const visitId = '507f1f77bcf86cd799439011';
const row = {
  visitId, state: 'PENDING', version: 3, bookingCode: 'BK-42', serviceName: 'Dắt chó đi dạo', serviceAddress: 'Địa chỉ thử',
  startAt: '2026-11-24T01:00:00Z', endAt: '2026-11-24T02:00:00Z', accessOpensAt: '2026-11-24T00:00:00Z',
  checkInOpensAt: '2026-11-24T00:30:00Z', assignedAt: '2026-11-23T05:00:00Z',
  note: { reasonCode: 'ILLNESS', previousSitterName: 'Lê Văn Minh', previousVisitCount: 2 },
  care: { version: 'a'.repeat(64), revision: 1, confirmedAt: '2026-11-22T03:00:00Z', pets: [], tasks: [] },
  reports: [], pets: [{ name: 'Milo', breed: 'Corgi' }]
};
const apiFor = (urgent = false) => ({
  handover: jest.fn().mockResolvedValue({ data: { ...row, urgent } }),
  confirmHandover: jest.fn().mockResolvedValue({ data: { state: 'CONFIRMED', acceptedAt: '2026-11-23T06:00:00Z',
    checkInOpensAt: row.checkInOpensAt } })
});
const show = api => render(<MemoryRouter><HandoverConfirmationPage api={api} visitId={visitId} /></MemoryRouter>);

test('UC-41 shows the handover data and requires the checkbox before submitting once and showing MSG81', async () => {
  const api = apiFor();
  show(api);
  expect(await screen.findByText(/Hãy đọc và xác nhận trước 07:00 ngày 24\/11/)).toBeInTheDocument();
  for (const section of ['Ghi chú bàn giao', 'Hướng dẫn chăm sóc đã xác nhận', 'Báo cáo các buổi trước', 'Thú cưng'])
    expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
  expect(screen.getByText('Ốm, không đi được')).toBeInTheDocument();
  expect(screen.getByText('Chưa có buổi nào xong trong lịch này.')).toBeInTheDocument();
  const submit = screen.getByRole('button', { name: 'Xác nhận bàn giao' });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã đọc hướng dẫn chăm sóc và ghi chú bàn giao.' }));
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(await screen.findByText('Đã xác nhận bàn giao. Bạn check-in được từ 07:30.')).toBeInTheDocument();
  expect(api.confirmHandover).toHaveBeenCalledTimes(1);
  expect(api.confirmHandover).toHaveBeenCalledWith(visitId, { expectedVersion: 3, careVersion: row.care.version, acknowledged: true }, expect.any(String));
});

test('UC-41 GBR-24 an urgent assignment asks the sitter to confirm immediately', async () => {
  show(apiFor(true));
  expect(await screen.findByText('Buổi được giao cho bạn khi còn chưa đầy 1 giờ. Hãy đọc và xác nhận ngay, trước khi check-in.')).toBeInTheDocument();
});
