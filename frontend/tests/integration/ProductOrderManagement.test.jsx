import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../src/services/api-client.js';
import { ProductOrderManagementPage } from '../../src/pages/admin/ProductOrderManagementPage.jsx';

const SEARCH_LABEL = 'Tìm theo mã đơn, tên khách hoặc số điện thoại';
const COUNTS ={ PREPARE: 3, AWAITING_PICKUP: 1, IN_TRANSIT: 2, RETURNING: 1 };
const line = { productId: 'p1', productCode: 'SP-0014', productName: 'Thức ăn hạt cho mèo trưởng thành, 1,5 kg', quantity: 2, unitPrice: 210000, lineTotal: 420000 };
const order = (over = {}) => ({ id: 'o1', code: 'DH-0032', createdAt: '2026-11-01T03:00:00.000Z', receiveMethod: 'DELIVERY', paymentMethod: 'COD', paid: false,
  status: 'PLACED', trackingCode: null, deliveryAddress: { label: 'Nhà', location: '45 Láng Hạ, Đống Đa, Hà Nội', areaCode: 'DISTRICT_DONG_DA' },
  lines: [line], subtotal: 420000, shippingFee: 25000, total: 445000, customer: { id: 'u1', displayName: 'Hoàng Thị Mai', phone: '0912345678' }, ...over });
const pickup = (over = {}) => order({ id: 'o3', code: 'DH-0034', receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', deliveryAddress: null,
  shippingFee: 0, subtotal: 185000, total: 185000, customer: { id: 'u3', displayName: 'Lý Quốc Huy' }, ...over });

function fakeApi(over = {}) {
  return {
    listOrders: jest.fn().mockResolvedValue({ data: [order(), pickup()], meta: { counts: COUNTS } }),
    handToCarrier: jest.fn().mockResolvedValue(order({ status: 'HANDED_TO_CARRIER' })),
    markReady: jest.fn().mockResolvedValue(pickup({ status: 'READY' })),
    recordPayment: jest.fn().mockResolvedValue(pickup({ status: 'READY', paid: true })),
    handToCustomer: jest.fn().mockResolvedValue(pickup({ status: 'PICKED_UP', paid: true })),
    ...over
  };
}
const detail = (code) => screen.getByRole('complementary', { name: `Chi tiết đơn ${code}` });

describe('Order Management', () => {
  test('shows the tabs with their counts, the orders to prepare and the first order in detail', async () => {
    const api = fakeApi();
    render(<ProductOrderManagementPage api={api} />);
    expect(await screen.findByRole('button', { name: 'Cần chuẩn bị (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Chờ khách lấy (1)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đang giao (2)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đang hoàn về (1)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tất cả' })).toBeVisible();
    expect(api.listOrders).toHaveBeenCalledWith({ tab: 'PREPARE', search: '' }, expect.any(Object));
    const panel = detail('DH-0032');
    expect(within(panel).getByText('Hoàng Thị Mai')).toBeVisible();
    expect(within(panel).getByText('45 Láng Hạ, Đống Đa, Hà Nội')).toBeVisible();
    expect(within(panel).getByText('Tổng thu khi giao')).toBeVisible();
    expect(within(panel).getByText('445.000 đ')).toBeVisible();
    // Admin sees a new order as work to do, in the warning tone.
    expect(within(panel).getByText('Cần chuẩn bị')).toHaveClass('pwc-shop-status--warn');
  });

  test('switches tab and searches, and shows another order when chosen', async () => {
    const api = fakeApi();
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByRole('button', { name: 'Cần chuẩn bị (3)' });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đơn DH-0034' }));
    expect(detail('DH-0034')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đang giao (2)' }));
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith({ tab: 'IN_TRANSIT', search: '' }, expect.any(Object)));
    fireEvent.change(screen.getByRole('searchbox', { name: SEARCH_LABEL }), { target: { value: ' mai ' } });
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith({ tab: 'IN_TRANSIT', search: 'mai' }, expect.any(Object)));
  });

  test('AC-19 searches by phone number and shows the customer phone in the order detail', async () => {
    const api = fakeApi();
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByRole('button', { name: 'Cần chuẩn bị (3)' });
    expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveAttribute('placeholder', SEARCH_LABEL);
    expect(within(detail('DH-0032')).getByText('Số điện thoại')).toBeVisible();
    expect(within(detail('DH-0032')).getByText('0912345678')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: SEARCH_LABEL }), { target: { value: ' 0912 345 678 ' } });
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith({ tab: 'PREPARE', search: '0912 345 678' }, expect.any(Object)));
  });

  test('AC-19 says so when the customer has no phone number', async () => {
    const api = fakeApi({ listOrders: jest.fn().mockResolvedValue({ data: [order({ customer: { id: 'u1', displayName: 'Hoàng Thị Mai', phone: null } })],
      meta: { counts: COUNTS } }) });
    render(<ProductOrderManagementPage api={api} />);
    expect(await within(await screen.findByRole('complementary', { name: 'Chi tiết đơn DH-0032' })).findByText('Chưa có')).toBeVisible();
  });

  test('hands a delivery order to the carrier with the tracking code and confirms with MSG106', async () => {
    const api = fakeApi();
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByText('Mã vận đơn');
    fireEvent.change(screen.getByLabelText('Mã vận đơn'), { target: { value: 'VN7290018342' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao cho hãng vận chuyển' }));
    await waitFor(() => expect(api.handToCarrier).toHaveBeenCalledWith('o1', 'VN7290018342'));
    expect(await screen.findByText('Đơn hàng DH-0032 đã được cập nhật.')).toBeVisible();
    await waitFor(() => expect(api.listOrders).toHaveBeenCalledTimes(2));
  });

  test('shows MSG103 when the backend rejects a missing tracking code and does not reload', async () => {
    const api = fakeApi({ handToCarrier: jest.fn().mockRejectedValue(new ApiError('TRACKING_CODE_REQUIRED', 422)) });
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByText('Mã vận đơn');
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao cho hãng vận chuyển' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập mã vận đơn.');
    expect(api.listOrders).toHaveBeenCalledTimes(1);
  });

  test('sends a request only once while it is in flight', async () => {
    let finish;
    const api = fakeApi({ handToCarrier: jest.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; })) });
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByText('Mã vận đơn');
    fireEvent.change(screen.getByLabelText('Mã vận đơn'), { target: { value: 'VN7290018342' } });
    const button = screen.getByRole('button', { name: 'Đã giao cho hãng vận chuyển' });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.handToCarrier).toHaveBeenCalledTimes(1);
    finish(order({ status: 'HANDED_TO_CARRIER' }));
    await screen.findByText('Đơn hàng DH-0032 đã được cập nhật.');
  });

  test('marks a pickup order ready', async () => {
    const api = fakeApi();
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByRole('button', { name: 'Cần chuẩn bị (3)' });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đơn DH-0034' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu sẵn sàng' }));
    await waitFor(() => expect(api.markReady).toHaveBeenCalledWith('o3'));
    expect(await screen.findByText('Đơn hàng DH-0034 đã được cập nhật.')).toBeVisible();
  });

  test('asks for payment (MSG105) before a ready pickup order is handed over, and takes payment first', async () => {
    const api = fakeApi({
      listOrders: jest.fn().mockResolvedValue({ data: [pickup({ status: 'READY' })], meta: { counts: COUNTS } }),
      handToCustomer: jest.fn().mockRejectedValue(new ApiError('ORDER_NOT_PAID', 409))
    });
    render(<ProductOrderManagementPage api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Giao cho khách' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn hàng này chưa được thanh toán đủ. Vui lòng thu tiền trước.');
    fireEvent.click(screen.getByRole('button', { name: 'Đã thu tiền' }));
    await waitFor(() => expect(api.recordPayment).toHaveBeenCalledWith('o3'));
  });

  test('offers no payment step once a pickup order is paid, and hands it over', async () => {
    const api = fakeApi({ listOrders: jest.fn().mockResolvedValue({ data: [pickup({ status: 'READY', paid: true })], meta: { counts: COUNTS } }) });
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByRole('button', { name: 'Giao cho khách' });
    expect(screen.queryByRole('button', { name: 'Đã thu tiền' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Giao cho khách' }));
    await waitFor(() => expect(api.handToCustomer).toHaveBeenCalledWith('o3'));
  });

  test('offers no step for an order that already left the shop', async () => {
    const api = fakeApi({ listOrders: jest.fn().mockResolvedValue({ data: [order({ status: 'HANDED_TO_CARRIER', trackingCode: 'VN7290018342' })], meta: { counts: COUNTS } }) });
    render(<ProductOrderManagementPage api={api} />);
    const panel = await screen.findByRole('complementary', { name: 'Chi tiết đơn DH-0032' });
    expect(within(panel).getByText('VN7290018342')).toBeVisible();
    expect(within(panel).queryByRole('button')).toBeNull();
  });

  test('reloads when the order changed status under the Admin', async () => {
    const api = fakeApi({ handToCarrier: jest.fn().mockRejectedValue(new ApiError('ORDER_STATE_CONFLICT', 409)) });
    render(<ProductOrderManagementPage api={api} />);
    await screen.findByText('Mã vận đơn');
    fireEvent.change(screen.getByLabelText('Mã vận đơn'), { target: { value: 'VN7290018342' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đã giao cho hãng vận chuyển' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn hàng đã đổi trạng thái');
    await waitFor(() => expect(api.listOrders).toHaveBeenCalledTimes(2));
  });

  test('says so when a tab is empty and does not present a failed load as empty', async () => {
    const empty = fakeApi({ listOrders: jest.fn().mockResolvedValue({ data: [], meta: { counts: { ...COUNTS, PREPARE: 0 } } }) });
    const { unmount } = render(<ProductOrderManagementPage api={empty} />);
    expect(await screen.findByText('Không có đơn hàng nào trong mục này.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cần chuẩn bị (0)' })).toBeVisible();
    unmount();
    const failing = fakeApi({ listOrders: jest.fn().mockRejectedValue(new ApiError('HTTP_ERROR', 500)) });
    render(<ProductOrderManagementPage api={failing} />);
    expect(await screen.findByText('Chưa tải được đơn hàng')).toBeVisible();
    expect(screen.queryByText('Không có đơn hàng nào trong mục này.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });
});
