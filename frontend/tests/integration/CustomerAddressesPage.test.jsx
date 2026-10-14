import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CustomerAddressesPage } from '../../src/pages/customer/CustomerAddressesPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const CUSTOMER_ADDRESS = 'aaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
afterEach(() => {
  cleanup();
  delete globalThis.fetch;
});

function address(overrides = {}) {
  return {
    id: CUSTOMER_ADDRESS, label: 'Home', location: '12 Synthetic Road\nWard 3',
    privateAccessNotes: 'Ring the blue bell', isDefault: true, state: 'ACTIVE', version: 4,
    ...overrides
  };
}

function renderPage(addressAdapter) {
  return render(<SessionProvider adapter={{ resolve: async () => ({ status: 'authenticated', user: { role: 'CUSTOMER' } }) }}>
    <CustomerAddressesPage addressAdapter={addressAdapter} />
  </SessionProvider>);
}

function response(addresses = [], nextCursor = null, pending = false) {
  return { data: { addresses, nextCursor, limit: 20 }, pending };
}

test('loads customer-only address details and uses bounded cursor navigation', async () => {
  const firstPage = Array.from({ length: 20 }, (_item, index) => address({
    id: `${String(index + 1).padStart(24, '0')}`, label: `Home ${index + 1}`
  }));
  const adapter = {
    list: jest.fn(({ cursor }) => Promise.resolve(cursor
      ? response([address({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', label: 'Office' })])
      : response(firstPage, 'cursor-1')))
  };
  renderPage(adapter);
  expect((await screen.findAllByText('Ring the blue bell')).length).toBe(20);
  expect(screen.getAllByRole('article')).toHaveLength(20);
  expect(adapter.list).toHaveBeenCalledWith({ cursor: null, signal: expect.any(globalThis.AbortSignal) });
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  expect(await screen.findByText('Office')).toBeVisible();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(adapter.list).toHaveBeenLastCalledWith({ cursor: 'cursor-1', signal: expect.any(globalThis.AbortSignal) });
  fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
  expect(await screen.findByText('Home 1')).toBeVisible();
});

test('shows loading, empty, forbidden, error and pending states', async () => {
  const waiting = renderPage({ list: () => new Promise(() => {}) });
  expect(screen.getByRole('status', { name: 'Đang tải địa chỉ' })).toBeVisible();
  waiting.unmount();

  const emptyView = renderPage({ list: jest.fn().mockResolvedValue(response()) });
  expect(await screen.findByRole('heading', { name: 'Chưa có địa chỉ phục vụ' })).toBeVisible();
  emptyView.unmount();

  const forbiddenView = renderPage({ list: jest.fn().mockRejectedValue({ status: 403 }) });
  expect(await screen.findByRole('heading', { name: 'Không có quyền xem địa chỉ' })).toBeVisible();
  forbiddenView.unmount();

  const errorView = renderPage({ list: jest.fn().mockRejectedValue({ status: 500, code: 'SERVER_ERROR' }) });
  expect(await screen.findByRole('heading', { name: 'Không tải được địa chỉ' })).toBeVisible();
  errorView.unmount();

  renderPage({ list: jest.fn().mockResolvedValue(response([], null, true)) });
  expect(await screen.findByRole('heading', { name: 'Đang chờ máy chủ xác nhận danh sách' })).toBeVisible();
});

test('keeps its API resource stable while the page form changes', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ data: { addresses: [], nextCursor: null, limit: 20 }, meta: { schemaVersion: 1 } })
  });
  renderPage(undefined);
  expect(await screen.findByRole('heading', { name: 'Chưa có địa chỉ phục vụ' })).toBeVisible();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(within(document.querySelector('.customer-addresses-heading'))
    .getByRole('button', { name: 'Thêm địa chỉ' }));
  expect(await screen.findByRole('dialog', { name: 'Thêm địa chỉ' })).toBeVisible();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test('creates an address with normalized fields and reports a failed save without discarding the draft', async () => {
  const adapter = {
    list: jest.fn().mockResolvedValue(response()),
    create: jest.fn().mockRejectedValue({ status: 422, code: 'VALIDATION_FAILED' })
  };
  renderPage(adapter);
  expect(await screen.findByRole('heading', { name: 'Chưa có địa chỉ phục vụ' })).toBeVisible();
  fireEvent.click(within(document.querySelector('.customer-addresses-heading'))
    .getByRole('button', { name: 'Thêm địa chỉ' }));
  const formDialog = within(await screen.findByRole('dialog', { name: 'Thêm địa chỉ' }));
  fireEvent.change(formDialog.getByLabelText(/Tên gợi nhớ/), { target: { value: '  Nhà   riêng ' } });
  fireEvent.change(formDialog.getByLabelText(/Địa chỉ phục vụ/), { target: { value: '  12   Synthetic Road  \r\n Ward  3 ' } });
  fireEvent.change(formDialog.getByLabelText(/Ghi chú ra vào riêng/), { target: { value: ' Ring   blue bell ' } });
  fireEvent.click(formDialog.getByRole('button', { name: 'Lưu địa chỉ' }));
  expect(await screen.findByRole('heading', { name: 'Chưa lưu được địa chỉ' })).toBeVisible();
  expect(adapter.create).toHaveBeenCalledWith({
    label: 'Nhà riêng', location: '12 Synthetic Road\nWard 3', privateAccessNotes: 'Ring blue bell'
  });
  expect(formDialog.getByLabelText(/Tên gợi nhớ/)).toHaveValue('  Nhà   riêng ');
});

test('asks before changing an address used by an open booking and retries with explicit confirmation', async () => {
  const updated = address({ location: '28 Example Street', version: 5 });
  const impactError = Object.assign(new Error('confirm'), { status: 409, code: 'ADDRESS_BOOKING_CONFIRMATION_REQUIRED' });
  const adapter = {
    list: jest.fn().mockResolvedValueOnce(response([address()])).mockResolvedValueOnce(response([updated])),
    update: jest.fn().mockRejectedValueOnce(impactError).mockRejectedValueOnce(impactError)
      .mockResolvedValueOnce({ data: updated, pending: false })
  };
  renderPage(adapter);
  fireEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
  const formDialog = within(screen.getByRole('dialog', { name: 'Sửa địa chỉ' }));
  fireEvent.change(formDialog.getByLabelText(/Địa chỉ phục vụ/), { target: { value: '28 Example Street' } });
  fireEvent.click(formDialog.getByRole('button', { name: 'Lưu địa chỉ' }));
  expect(await screen.findByRole('alertdialog', { name: 'Xác nhận ảnh hưởng booking đang mở' })).toBeVisible();
  expect(screen.getByText(/booking hiện có tiếp tục dùng snapshot/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
  const editDialogAfterBack = within(screen.getByRole('dialog', { name: 'Sửa địa chỉ' }));
  expect(editDialogAfterBack.getByLabelText(/Địa chỉ phục vụ/)).toHaveValue('28 Example Street');
  fireEvent.click(editDialogAfterBack.getByRole('button', { name: 'Lưu địa chỉ' }));
  expect(await screen.findByRole('alertdialog', { name: 'Xác nhận ảnh hưởng booking đang mở' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận và tiếp tục' }));
  await waitFor(() => expect(adapter.update).toHaveBeenCalledTimes(3));
  expect(adapter.update).toHaveBeenNthCalledWith(1, CUSTOMER_ADDRESS, expect.objectContaining({ expectedVersion: 4 }));
  expect(adapter.update).toHaveBeenNthCalledWith(3, CUSTOMER_ADDRESS,
    expect.objectContaining({ expectedVersion: 4, confirmOpenBookingImpact: true }));
  await waitFor(() => expect(document.querySelector('.customer-address-location')).toHaveTextContent('28 Example Street'));
});

test('archives softly after explicit booking impact confirmation and exposes default action', async () => {
  const impactError = Object.assign(new Error('confirm'), { status: 409, code: 'ADDRESS_BOOKING_CONFIRMATION_REQUIRED' });
  const adapter = {
    list: jest.fn().mockResolvedValueOnce(response([address()])).mockResolvedValueOnce(response([address({
      id: 'bbbbbbbbbbbbbbbbbbbbbbbb', label: 'Other', isDefault: false
    })])).mockResolvedValue(response([address({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', label: 'Other', isDefault: false })])),
    archive: jest.fn().mockRejectedValueOnce(impactError).mockResolvedValueOnce({ data: { id: CUSTOMER_ADDRESS, state: 'ARCHIVED' } }),
    update: jest.fn().mockResolvedValue({ data: address({ isDefault: true }), pending: false })
  };
  renderPage(adapter);
  fireEvent.click(await screen.findByRole('button', { name: 'Ẩn địa chỉ' }));
  const archiveDialog = screen.getByRole('alertdialog', { name: 'Ẩn địa chỉ này?' });
  fireEvent.click(within(archiveDialog).getByRole('button', { name: 'Ẩn địa chỉ' }));
  expect(await screen.findByRole('alertdialog', { name: 'Xác nhận ảnh hưởng booking đang mở' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận và tiếp tục' }));
  await waitFor(() => expect(adapter.archive).toHaveBeenCalledTimes(2));
  expect(adapter.archive).toHaveBeenNthCalledWith(2, CUSTOMER_ADDRESS,
    expect.objectContaining({ expectedVersion: 4, confirmOpenBookingImpact: true }));
  expect(await screen.findByText('Other')).toBeVisible();
  const otherCard = screen.getByText('Other').closest('article');
  fireEvent.click(within(otherCard).getByRole('button', { name: 'Đặt làm mặc định' }));
  expect(await screen.findByRole('heading', { name: 'Đã gửi thay đổi' })).toBeVisible();
});
