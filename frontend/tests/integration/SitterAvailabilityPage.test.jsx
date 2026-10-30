import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getSitterCalendarRange, SitterAvailabilityPage } from '../../src/pages/sitter/SitterAvailabilityPage.jsx';

const currentAvailability = { zone: 'Asia/Ho_Chi_Minh', expectedVersion: 4, effectiveFrom: '2026-10-14',
  workingWindows: [{ weekday: 1, startLocalTime: '09:00', endLocalTime: '12:00' }], areas: ['HCMC:D1'], dayOffDates: [] };

function buildApi({ data = currentAvailability, saveAvailability = jest.fn(async () => ({ status: 200, data })) } = {}) {
  return { getAvailability: jest.fn(async () => ({ data })), saveAvailability };
}

describe('SitterAvailabilityPage', () => {
  test('shows the Sitter schedule in the canonical local timezone', async () => {
    render(<SitterAvailabilityPage api={buildApi()} />);
    expect(await screen.findByRole('heading', { name: 'Giờ có thể nhận việc' })).toBeInTheDocument();
    expect(screen.getAllByText(/Asia\/Saigon/)).toHaveLength(2);
    expect(await screen.findByLabelText('Ngày trong tuần')).toHaveValue('1');
    expect(screen.getByLabelText(/Bắt đầu/)).toHaveValue('09:00');
    expect(screen.getByLabelText(/Kết thúc/)).toHaveValue('12:00');
    expect(await screen.findByText(/API lịch ngày chưa được kết nối/)).toBeInTheDocument();
    expect(screen.queryByText(/customer|địa chỉ/i)).not.toBeInTheDocument();
  });

  test('loads and displays an inclusive 31-day calendar in the Sitter timezone', async () => {
    const now = new Date('2026-10-31T18:00:00.000Z');
    expect(getSitterCalendarRange(now)).toEqual({ fromLocalDate: '2026-11-01', toLocalDate: '2026-12-01' });
    const listCalendar = jest.fn(async ({ fromLocalDate }) => ({ data: [
      { localDate: fromLocalDate, available: true, isDayOff: false,
        windows: [{ weekday: 7, startLocalTime: '09:00', endLocalTime: '12:00' }] },
    ] }));
    const api = { ...buildApi(), listCalendar };
    const { container } = render(<SitterAvailabilityPage api={api} now={now} />);
    await waitFor(() => expect(listCalendar).toHaveBeenCalledWith({
      fromLocalDate: '2026-11-01', toLocalDate: '2026-12-01', signal: expect.anything(),
    }));
    const displayedDate = container.querySelector('.sitter-availability__calendar-day time');
    expect(displayedDate).toHaveAttribute('dateTime', '2026-11-01');
    expect(screen.getByText('Có thể nhận việc')).toBeInTheDocument();
    expect(screen.getByText(/09:00.*12:00/)).toBeInTheDocument();
  });

  test('sends local intervals, current version and an idempotency key, then reloads server state', async () => {
    const updated = { ...currentAvailability, expectedVersion: 5,
      workingWindows: [{ weekday: 1, startLocalTime: '10:00', endLocalTime: '13:00' }] };
    const api = buildApi({ saveAvailability: jest.fn(async () => ({ status: 200, data: updated })) });
    render(<SitterAvailabilityPage api={api} now={new Date('2026-10-30T03:00:00Z')} createOperationKey={() => 'operation-key-0001'} />);
    await screen.findByRole('heading', { name: 'Giờ có thể nhận việc' });
    await screen.findByLabelText(/Bắt đầu/);
    fireEvent.change(screen.getByLabelText(/Bắt đầu/), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText(/Kết thúc/), { target: { value: '13:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch' }));
    await waitFor(() => expect(api.saveAvailability).toHaveBeenCalledWith({
      zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-10-30', expectedVersion: 4,
      idempotencyKey: 'operation-key-0001',
      workingWindows: [{ weekday: 1, startLocalTime: '10:00', endLocalTime: '13:00' }]
    }));
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Máy chủ đã xác nhận thay đổi lịch.')).toBeInTheDocument();
  });

  test('keeps the old schedule and directs confirmed-visit conflicts to Staff', async () => {
    const saveAvailability = jest.fn(async () => {
      const error = new Error('CONFIRMED_VISIT_CONFLICT');
      error.status = 409;
      error.code = 'CONFIRMED_VISIT_CONFLICT';
      throw error;
    });
    const api = buildApi({ saveAvailability });
    render(<SitterAvailabilityPage api={api} createOperationKey={() => 'operation-key-0002'} />);
    await screen.findByRole('heading', { name: 'Giờ có thể nhận việc' });
    await screen.findByLabelText(/Bắt đầu/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch' }));
    expect(await screen.findByText(/Staff cần xem và xử lý xung đột/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bắt đầu/)).toHaveValue('09:00');
    expect(screen.queryByText('Máy chủ đã xác nhận thay đổi lịch.')).not.toBeInTheDocument();
    expect(api.getAvailability).toHaveBeenCalledTimes(1);
  });

  test('shows empty, loading integration, error and forbidden states without a mock success', async () => {
    const emptyApi = buildApi({ data: null });
    render(<SitterAvailabilityPage api={emptyApi} />);
    expect(await screen.findByText('Bạn chưa khai báo giờ làm việc')).toBeInTheDocument();
    expect(screen.getByText('Thêm các khung giờ lặp hằng tuần. Ngày nghỉ và khu vực phục vụ được quản lý riêng.')).toBeInTheDocument();

    const { unmount } = render(<SitterAvailabilityPage />);
    expect(await screen.findByText(/API lịch Sitter chưa được kết nối/)).toBeInTheDocument();
    unmount();

    const forbiddenApi = { getAvailability: jest.fn(async () => { const error = new Error(); error.status = 403; throw error; }) };
    render(<SitterAvailabilityPage api={forbiddenApi} />);
    expect(await screen.findByText('Chỉ Sitter được phép xem lịch của chính mình.')).toBeInTheDocument();

    const failingApi = { getAvailability: jest.fn(async () => { throw new Error('offline'); }) };
    render(<SitterAvailabilityPage api={failingApi} />);
    expect(await screen.findByText('Lịch chưa được tải; không có dữ liệu Customer trong màn hình này.')).toBeInTheDocument();
  });

  test('reuses the same operation key after an uncertain acknowledgement', async () => {
    const api = buildApi({ saveAvailability: jest.fn()
      .mockRejectedValueOnce({ code: 'TIMEOUT' })
      .mockResolvedValueOnce({ expectedVersion: 5, status: 200 }) });
    render(<SitterAvailabilityPage api={api} createOperationKey={() => 'stable-operation-key'} />);
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: /l.*u l.*ch/i }));
    expect(await screen.findByRole('button', { name: /ki.*m tra y.*u c.*u/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /ki.*m tra y.*u c.*u/i }));
    await waitFor(() => expect(api.saveAvailability).toHaveBeenCalledTimes(2));
    expect(api.saveAvailability.mock.calls[0][0].idempotencyKey).toBe('stable-operation-key');
    expect(api.saveAvailability.mock.calls[1][0].idempotencyKey).toBe('stable-operation-key');
  });

  test('announces a 202 response as pending instead of success', async () => {
    const api = buildApi({ saveAvailability: jest.fn(async () => ({ status: 202, pending: true })) });
    render(<SitterAvailabilityPage api={api} createOperationKey={() => 'operation-key-0003'} />);
    await screen.findByRole('heading', { name: 'Giờ có thể nhận việc' });
    await screen.findByLabelText(/Bắt đầu/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch' }));
    expect(await screen.findByRole('button', { name: /ki.*m tra y.*u c.*u/i })).toBeEnabled();
    expect(screen.queryByText('Máy chủ đã xác nhận thay đổi lịch.')).not.toBeInTheDocument();
  });

  test('keeps a future effective date and explains the missing contract without claiming a save', async () => {
    const api = buildApi({ data: { ...currentAvailability, effectiveFrom: '2026-11-05' },
      saveAvailability: jest.fn().mockRejectedValue({ status: 409, code: 'CONTRACT_REQUIRED' }) });
    render(<SitterAvailabilityPage api={api} now={new Date('2026-10-30T03:00:00Z')} />);
    const date = await screen.findByLabelText(/Áp dụng từ ngày/);
    await waitFor(() => expect(date).toHaveValue('2026-11-05'));
    expect(date).toHaveAttribute('min', '2026-10-30');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch' }));
    expect(await screen.findByText(/Hãy liên hệ Admin để xác minh hợp đồng/)).toBeVisible();
    expect(screen.queryByText('Máy chủ đã xác nhận thay đổi lịch.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Bắt đầu/)).toHaveValue('09:00');
  });
});
