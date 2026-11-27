import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CounterBookingPage } from '../../src/pages/admin/CounterBookingPage.jsx';

const customer = {
  id: 'customer-1', displayName: 'Trần Thị Lan', tierCode: 'SILVER',
  pets: [
    { id: 'pet-1', name: 'Mít', species: 'DOG', breedName: 'Poodle', weightKg: 6 },
    { id: 'pet-2', name: 'Bơ', species: 'CAT', breedName: 'Anh lông ngắn', weightKg: 4 }
  ],
  addresses: [{ id: 'address-1', label: 'Số 12 thôn Bình Xá, xã Bình Yên, Thạch Thất' }]
};
const catalog = [
  { id: 'svc-1', name: 'Tắm và vệ sinh thú cưng', priceVnd: 100000, locations: ['FACILITY'], spa: true },
  { id: 'svc-2', name: 'Cắt móng', priceVnd: 50000, locations: ['HOME', 'FACILITY'], spa: true },
  { id: 'svc-3', name: 'Chăm sóc tại gia', priceVnd: 120000, locations: ['HOME'], spa: false }
];
const base = () => ({
  catalog: jest.fn().mockResolvedValue(catalog),
  lookup: jest.fn().mockResolvedValue({ customer }),
  createCustomer: jest.fn().mockResolvedValue({ ...customer, id: 'customer-created' }),
  createPet: jest.fn().mockResolvedValue({ id: 'new-pet', name: 'Mướp', species: 'DOG', breedName: 'Poodle', weightKg: 3 }),
  petCatalog: jest.fn().mockResolvedValue({ breeds: [{ code: 'dog-poodle', name: 'Poodle', species: 'DOG' }], traits: [] }),
  slots: jest.fn().mockResolvedValue({ slots: ['08:00', '09:00', '10:00'] }),
  pickupQuote: jest.fn().mockResolvedValue({ allowed: true, distanceKm: 6.8, feeVnd: 40000 }),
  preview: jest.fn().mockResolvedValue({ previewId: 'synthetic-preview', subtotalVnd: 150000, tierDiscountVnd: 7500, pickupFeeVnd: 40000, totalVnd: 182500 }),
  checkout: jest.fn().mockResolvedValue({ paid: true })
});
async function initialize(api = base()) {
  render(<CounterBookingPage api={api} initialDate="2026-11-28" initialPhone="0912345678" />);
  await screen.findByText('Tắm và vệ sinh thú cưng');
  fireEvent.click(screen.getByRole('button', { name: 'Tìm khách' }));
  await screen.findByText(/Trần Thị Lan · hạng Bạc/);
  fireEvent.click(screen.getByRole('checkbox', { name: /Mít/ }));
  return api;
}
test('counter booking mockup: search customer, pick pet, add services and choose pickup', async () => {
  const api = await initialize();
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Nơi làm Cắt móng' }), { target: { value: 'FACILITY' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Có cắn hoặc cào khi bị giữ không/ }), { target: { value: 'YES' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Có bệnh da hoặc vết thương không/ }), { target: { value: 'NO' } });
  expect(screen.getByRole('heading', { name: 'Giỏ dịch vụ' })).toBeInTheDocument();
  expect(screen.getByText('2 dịch vụ')).toBeInTheDocument();
  expect(screen.getAllByTestId('counter-booking-cart-line')).toHaveLength(2);
  fireEvent.click(screen.getByRole('checkbox', { name: /Đón và trả tận nhà/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Địa chỉ đón' }), { target: { value: 'address-1' } });
  await waitFor(() => expect(api.pickupQuote).toHaveBeenCalledWith({ customerId: customer.id, addressId: 'address-1' }));
  expect(await screen.findByText('6,8 km')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Đã nhận đủ tiền mặt · Đặt lịch' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Đã nhận đủ tiền mặt · Đặt lịch' }));
  await waitFor(() => expect(api.checkout).toHaveBeenCalledTimes(1));
  expect(api.checkout.mock.calls[0][0]).toEqual({ previewId: 'synthetic-preview' });
  expect(api.preview.mock.calls.at(-1)[0]).toMatchObject({
    customerId: customer.id, petIds: ['pet-1'], paymentMethod: 'COUNTER_CASH',
    pickup: { enabled: true, addressId: 'address-1' }
  });
  expect(await screen.findByText(/Đã đặt lịch và thu tiền/)).toBeInTheDocument();
  expect(screen.getByText('0 dịch vụ')).toBeInTheDocument();
});

test('VietQR keeps cart and both pending orders until verified or cancelled', async () => {
  const api = base();
  api.checkout.mockResolvedValue({ status: 'PENDING', paid: false, receiptId: 'a'.repeat(64),
    checkoutUrl: 'https://pay.payos.vn/web/synthetic-counter' });
  api.cancelPayment = jest.fn().mockResolvedValue({ status: 'CANCELLED' });
  await initialize(api);
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  fireEvent.change(screen.getByRole('combobox', { name: /Có cắn hoặc cào khi bị giữ không/ }),
    { target: { value: 'NO' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Có bệnh da hoặc vết thương không/ }),
    { target: { value: 'NO' } });
  fireEvent.click(screen.getByRole('radio', { name: 'VietQR' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo mã VietQR' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Tạo mã VietQR' }));
  expect(await screen.findByText('Đã giữ chỗ trong 15 phút. Đang chờ payOS xác nhận thanh toán.')).toBeInTheDocument();
  expect(screen.getByText('1 dịch vụ')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tạo mã VietQR' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Huỷ VietQR' }));
  await waitFor(() => expect(api.cancelPayment).toHaveBeenCalledWith('a'.repeat(64)));
  expect(await screen.findByText('Đã huỷ mã VietQR và nhả chỗ. Giỏ dịch vụ được giữ nguyên.')).toBeInTheDocument();
  expect(screen.getByText('1 dịch vụ')).toBeInTheDocument();
});
test('cannot take money without backend quote and verified slots', async () => {
  const api = base();
  api.slots.mockRejectedValue({ status: 404 });
  api.preview.mockRejectedValue({ status: 404 });
  await initialize(api);
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  expect(screen.getByRole('button', { name: 'Đã nhận đủ tiền mặt · Đặt lịch' })).toBeDisabled();
  expect(api.checkout).not.toHaveBeenCalled();
  expect(screen.getByText(/Chưa xác minh được khung giờ/)).toBeInTheDocument();
});
test('new phone reveals customer creation form with exact message', async () => {
  const api = base();
  api.lookup.mockResolvedValue({ customer: null });
  render(<CounterBookingPage api={api} initialPhone="0912345678" />);
  fireEvent.click(screen.getByRole('button', { name: 'Tìm khách' }));
  expect(await screen.findByText('Chưa có khách hàng dùng số này. Nhập họ tên để tạo hồ sơ khách.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Họ tên' }), { target: { value: 'Khách mới' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ khách' }));
  await waitFor(() => expect(api.createCustomer).toHaveBeenCalledWith({ phone: '0912345678', displayName: 'Khách mới' }));
});
test('pickup out of range blocks payment and shows exact user guidance', async () => {
  const api = base();
  api.pickupQuote.mockResolvedValue({ allowed: false, distanceKm: 12.2, maxKm: 10 });
  await initialize(api);
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  fireEvent.click(screen.getByRole('checkbox', { name: /Đón và trả tận nhà/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Địa chỉ đón' }), { target: { value: 'address-1' } });
  expect(await screen.findByText('Địa chỉ này cách cửa hàng 12.2 km, quá 10 km. Không đón được; vui lòng mang thú cưng đến cửa hàng.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Đã nhận đủ tiền mặt · Đặt lịch' })).toBeDisabled();
});
test('cart removes one selected service without affecting others', async () => {
  await initialize();
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm' })[0]);
  const rows = screen.getAllByTestId('counter-booking-cart-line');
  fireEvent.click(within(rows[0]).getByRole('button', { name: /Bỏ Tắm và vệ sinh thú cưng/ }));
  expect(screen.getByText('1 dịch vụ')).toBeInTheDocument();
  expect(screen.getAllByTestId('counter-booking-cart-line')).toHaveLength(1);
});
test('new pet uses the existing breed catalog and confirms care needs before the backend write', async () => {
  const api = await initialize();
  fireEvent.click(screen.getByRole('button', { name: /Thêm thú cưng/ }));
  const modal = await screen.findByRole('dialog', { name: 'Thêm thú cưng' });
  await within(modal).findByRole('option', { name: 'Poodle' });
  fireEvent.change(within(modal).getByRole('textbox', { name: 'Tên thú cưng' }), { target: { value: 'Mướp' } });
  fireEvent.change(within(modal).getByRole('combobox', { name: 'Giống' }), { target: { value: 'dog-poodle' } });
  fireEvent.change(within(modal).getByRole('spinbutton', { name: 'Cân nặng (kg)' }), { target: { value: '3' } });
  expect(within(modal).getByRole('button', { name: 'Lưu thú cưng' })).toBeDisabled();
  fireEvent.click(within(modal).getByRole('checkbox', { name: 'Đã xác nhận nhu cầu chăm sóc' }));
  fireEvent.click(within(modal).getByRole('button', { name: 'Lưu thú cưng' }));
  await waitFor(() => expect(api.createPet).toHaveBeenCalledWith(customer.id, {
    name: 'Mướp', species: 'DOG', breedCode: 'dog-poodle',
    traits: [], weightKg: 3, careNeedsConfirmed: true
  }));
});
