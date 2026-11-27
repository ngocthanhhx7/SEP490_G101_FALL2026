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

test('shows the replacement sitter the customer’s additional tasks before confirmation', async () => {
  const api = apiFor();
  api.handover.mockResolvedValue({ data: { ...row, care: { ...row.care,
    tasks: ['Việc trong quy trình'],
    additionalTasks: [{ itemId: 'custom-task-1', label: 'Thay nước sạch', required: true },
      { itemId: 'custom-task-2', label: 'Chơi bóng', required: false }]
  } } });
  show(api);
  expect(await screen.findByText('Thay nước sạch')).toBeVisible();
  expect(screen.getByText('Chơi bóng (Tuỳ chọn)')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Xác nhận bàn giao' })).toBeDisabled();
});

test('UC-41 GBR-24 an urgent assignment asks the sitter to confirm immediately', async () => {
  show(apiFor(true));
  expect(await screen.findByText('Buổi được giao cho bạn khi còn chưa đầy 1 giờ. Hãy đọc và xác nhận ngay, trước khi check-in.')).toBeInTheDocument();
});

describe('the line under the confirm button names only the times that have not passed yet', () => {
  // accessOpensAt 07:00 and checkInOpensAt 07:30 (Vietnam time) on 24/11/2026.
  const at = iso => jest.spyOn(Date, 'now').mockReturnValue(Date.parse(iso));
  afterEach(() => jest.restoreAllMocks());

  test('both times still ahead: both are shown', async () => {
    at('2026-11-23T05:00:00Z'); show(apiFor());
    expect(await screen.findByText('Sau khi xác nhận, ghi chú vào nhà hiện từ 07:00 và bạn check-in được từ 07:30.')).toBeInTheDocument();
  });

  test('both times already passed (urgent or replaced after the start): the sitter can use both at once', async () => {
    at('2026-11-24T01:10:00Z'); show(apiFor(true));
    expect(await screen.findByText('Sau khi xác nhận, bạn xem ghi chú vào nhà và check-in được ngay.')).toBeInTheDocument();
    expect(screen.queryByText(/hiện từ 07:00/)).not.toBeInTheDocument();
  });

  test('only the house note time has passed: the check-in time is kept', async () => {
    at('2026-11-24T00:10:00Z'); show(apiFor(true));
    expect(await screen.findByText('Sau khi xác nhận, bạn xem ghi chú vào nhà được ngay và bạn check-in được từ 07:30.')).toBeInTheDocument();
  });
});

