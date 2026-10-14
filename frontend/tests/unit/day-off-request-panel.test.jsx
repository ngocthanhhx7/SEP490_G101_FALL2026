import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest, test, expect } from '@jest/globals';
import { DayOffRequestPanel, getServiceCalendarDate } from '../../src/pages/sitter/DayOffRequestPanel.jsx';

const SERVICE_NOW = new Date('2026-10-14T17:00:00.000Z');
const VISIT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function successResult(overrides = {}) {
  return {
    request: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', state: 'PENDING', startDate: '2026-10-20', endDate: '2026-10-22' },
    conflicts: { count: 0, visitIds: [] },
    availabilityChanged: false,
    ...overrides
  };
}

function renderPanel({ load, submitDayOffRequest, ...props } = {}) {
  const api = {
    load: load ?? jest.fn().mockResolvedValue({ data: { expectedVersion: 4, requests: [] } }),
    submitDayOffRequest: submitDayOffRequest ?? jest.fn().mockResolvedValue(successResult())
  };
  const view = render(<DayOffRequestPanel api={api} now={SERVICE_NOW}
    idempotencyKeyFactory={() => 'synthetic-request-key'} {...props} />);
  return { ...view, api };
}

function fillValidDates() {
  fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/), { target: { value: '2026-10-20' } });
  fireEvent.change(screen.getByLabelText(/Ngày kết thúc/), { target: { value: '2026-10-22' } });
}

test('uses the canonical Vietnam service zone when choosing the local calendar day', () => {
  expect(getServiceCalendarDate(new Date('2026-10-14T16:59:59.999Z'))).toBe('2026-10-14');
  expect(getServiceCalendarDate(new Date('2026-10-14T17:00:00.000Z'))).toBe('2026-10-15');
});

test('shows loading and then the empty state with labeled date controls', async () => {
  let resolveLoad;
  const load = jest.fn(() => new Promise(resolve => { resolveLoad = resolve; }));
  renderPanel({ load });
  expect(screen.getByRole('status')).toHaveTextContent('Đang lấy lịch');
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  resolveLoad({ data: { expectedVersion: 4, requests: [] } });
  expect(await screen.findByText('Chưa có yêu cầu ngày nghỉ')).toBeVisible();
  expect(screen.getByLabelText(/Ngày bắt đầu/)).toHaveAttribute('min', '2026-10-15');
  expect(screen.getByLabelText(/Ngày kết thúc/)).toHaveAttribute('min', '2026-10-15');
});

test('shows a forbidden state for a denied read and an actionable error state for other failures', async () => {
  const denied = renderPanel({ load: jest.fn().mockRejectedValue(Object.assign(new Error('private'), { status: 403 })) });
  expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ Pet Sitter');
  denied.unmount();

  const retry = jest.fn().mockResolvedValue({ data: { expectedVersion: 4, requests: [] } });
  const load = jest.fn().mockRejectedValueOnce(Object.assign(new Error('private'), { status: 503 })).mockImplementation(retry);
  renderPanel({ load });
  expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được lịch');
  fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Chưa có yêu cầu ngày nghỉ')).toBeVisible();
});

test('does not treat a pending read acknowledgement as an empty or submitted request', async () => {
  renderPanel({ load: jest.fn().mockResolvedValue({ pending: true, data: { expectedVersion: 4, requests: [] } }) });
  expect(await screen.findByText('Máy chủ chưa xác nhận dữ liệu lịch. Yêu cầu chưa được xem là đã gửi.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Gửi yêu cầu ngày nghỉ' })).not.toBeInTheDocument();
});

test('validates local date ranges before calling the injected API', async () => {
  const { api } = renderPanel();
  await screen.findByText('Chưa có yêu cầu ngày nghỉ');
  fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/), { target: { value: '2026-10-14' } });
  fireEvent.change(screen.getByLabelText(/Ngày kết thúc/), { target: { value: '2026-10-13' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu ngày nghỉ' }));
  expect(await screen.findByText('Ngày bắt đầu không được ở trong quá khứ theo giờ Việt Nam.')).toBeVisible();
  expect(screen.getByText('Ngày kết thúc phải cùng ngày hoặc sau ngày bắt đầu.')).toBeVisible();
  expect(api.submitDayOffRequest).not.toHaveBeenCalled();
});

test('submits the current availability version and shows the server-confirmed pending state', async () => {
  const submitDayOffRequest = jest.fn().mockResolvedValue(successResult());
  const { api } = renderPanel({ submitDayOffRequest });
  await screen.findByText('Chưa có yêu cầu ngày nghỉ');
  fillValidDates();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu ngày nghỉ' }));

  expect(await screen.findByText('Yêu cầu đang chờ nhân viên duyệt. Lịch hiện có được giữ nguyên cho đến khi có quyết định.')).toBeVisible();
  expect(submitDayOffRequest).toHaveBeenCalledWith({
    startDate: '2026-10-20', endDate: '2026-10-22', expectedVersion: 4, idempotencyKey: 'synthetic-request-key'
  });
  expect(screen.getByText('Yêu cầu gần đây')).toBeVisible();
  expect(screen.getByText('2026-10-20 đến 2026-10-22')).toBeVisible();
  expect(screen.getByText('Chờ nhân viên duyệt')).toBeVisible();
});

test('shows only the number of confirmed visit conflicts, without exposing customer data or visit IDs', async () => {
  const submitDayOffRequest = jest.fn().mockResolvedValue(successResult({
    conflicts: { count: 2, visitIds: [VISIT_ID, 'cccccccccccccccccccccccc'] },
    syntheticCustomer: 'Private Customer Name',
    address: 'Private home address'
  }));
  renderPanel({ submitDayOffRequest });
  await screen.findByText('Chưa có yêu cầu ngày nghỉ');
  fillValidDates();
  fireEvent.submit(document.querySelector('form'));

  expect(await screen.findByText('2 lịch đã xác nhận cần nhân viên xử lý. Thông tin khách hàng không hiển thị ở đây.')).toBeVisible();
  expect(screen.queryByText(VISIT_ID)).not.toBeInTheDocument();
  expect(screen.queryByText('Private Customer Name')).not.toBeInTheDocument();
  expect(screen.queryByText('Private home address')).not.toBeInTheDocument();
});

test('retries an unacknowledged command with the same idempotency key', async () => {
  const submitDayOffRequest = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'NETWORK_ERROR', status: 0 }))
    .mockResolvedValueOnce(successResult());
  renderPanel({ submitDayOffRequest });
  await screen.findByText('Chưa có yêu cầu ngày nghỉ');
  fillValidDates();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu ngày nghỉ' }));
  expect(await screen.findByText('Chưa có xác nhận từ máy chủ. Nếu gửi lại, hệ thống sẽ kiểm tra cùng một yêu cầu.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại cùng yêu cầu' }));

  await waitFor(() => expect(submitDayOffRequest).toHaveBeenCalledTimes(2));
  expect(submitDayOffRequest.mock.calls[0][0].idempotencyKey).toBe('synthetic-request-key');
  expect(submitDayOffRequest.mock.calls[1][0].idempotencyKey).toBe('synthetic-request-key');
  expect(await screen.findByText('Yêu cầu đang chờ nhân viên duyệt. Lịch hiện có được giữ nguyên cho đến khi có quyết định.')).toBeVisible();
});
