import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HandoverConfirmationPage } from '../../src/pages/sitter/HandoverConfirmationPage.jsx';

const visitId = '507f1f77bcf86cd799439011';
const earlierVisitId = '507f1f77bcf86cd799439022';
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
  handoverEarlierReport: jest.fn(),
  readEvidence: jest.fn(),
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
  expect(screen.getByText('Chưa có báo cáo buổi trước.')).toBeInTheDocument();
  const submit = screen.getByRole('button', { name: 'Xác nhận bàn giao' });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã đọc hướng dẫn chăm sóc và ghi chú bàn giao.' }));
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(await screen.findByText('Đã xác nhận bàn giao. Bạn check-in được từ 07:30.')).toBeInTheDocument();
  expect(api.confirmHandover).toHaveBeenCalledTimes(1);
  expect(api.confirmHandover).toHaveBeenCalledWith(visitId, { expectedVersion: 3, careVersion: row.care.version, acknowledged: true }, expect.any(String));
});

test('UC-19 a replacement after a suspension reads why the previous sitter left', async () => {
  const api = apiFor();
  api.handover.mockResolvedValue({ data: { ...row,
    note: { reasonCode: 'SITTER_SUSPENDED', reasonText: null, previousSitterName: 'Lê Văn Minh', previousVisitCount: 0 } } });
  show(api);
  expect(await screen.findByText('Người chăm sóc trước tạm ngưng nhận việc')).toBeInTheDocument();
  expect(screen.queryByText('Chưa ghi nhận')).not.toBeInTheDocument();
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

describe('UC-41 / UC-45 earlier care reports table and View dialog', () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:handover-earlier-report');
    globalThis.URL.revokeObjectURL = jest.fn();
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  });

  test('renders earlier reports with a View button that lazily loads Care Report and photos, and supports retry on error', async () => {
    const api = apiFor();
    api.handover.mockResolvedValue({
      data: {
        ...row,
        reports: [{
          visitId: earlierVisitId,
          startAt: '2026-11-23T01:00:00Z',
          endAt: '2026-11-23T02:00:00Z',
          sitterName: 'Lê Văn Minh',
          mine: false,
          requiredTasksComplete: true,
          photoCount: 2
        }]
      }
    });
    api.readEvidence.mockResolvedValue({ blob: new globalThis.Blob(['sample'], { type: 'image/png' }) });
    api.handoverEarlierReport
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        data: {
          id: earlierVisitId,
          startAt: '2026-11-23T01:00:00Z',
          endAt: '2026-11-23T02:00:00Z',
          checkInAt: '2026-11-23T01:02:00Z',
          checkOutAt: '2026-11-23T01:58:00Z',
          sitterName: 'Lê Văn Minh',
          customerNote: 'Milo ăn hết bát và ngủ ngoan.',
          checklist: [
            { itemId: 'feed', label: 'Cho ăn đúng khẩu phần', status: 'DONE' },
            { itemId: 'walk', label: 'Đi dạo nhẹ', status: 'SKIPPED', reason: 'Trời mưa' }
          ],
          evidence: [{ kind: 'CHECK_IN', mediaId: 'b'.repeat(64) }]
        }
      });

    show(api);
    const viewButton = await screen.findByRole('button', { name: 'Xem' });
    expect(screen.getByText('23/11')).toBeInTheDocument();
    expect(screen.getByText('08:00 – 09:00')).toBeInTheDocument();
    expect(screen.getByText('Đủ việc bắt buộc · 2 ảnh')).toBeInTheDocument();
    expect(api.handoverEarlierReport).not.toHaveBeenCalled();

    fireEvent.click(viewButton);
    expect(await screen.findByText('Chưa tải được báo cáo buổi chăm sóc.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Cho ăn đúng khẩu phần')).toBeVisible();
    expect(screen.getByText(/Trời mưa/)).toBeVisible();
    expect(screen.getByText('Milo ăn hết bát và ngủ ngoan.')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Xem trước Ảnh check-in' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /khiếu nại|đánh giá/i })).not.toBeInTheDocument();
    expect(api.handoverEarlierReport).toHaveBeenCalledWith(visitId, earlierVisitId, expect.objectContaining({ signal: expect.any(Object) }));

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:handover-earlier-report'));
  });
});

