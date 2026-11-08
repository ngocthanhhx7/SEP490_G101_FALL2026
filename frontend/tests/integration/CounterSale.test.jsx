import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CounterSalePage } from '../../src/pages/admin/CounterSalePage.jsx';
import { ApiError } from '../../src/services/api-client.js';

const p = { id: 'p1', code: 'SP-0001', name: 'Hạt cho mèo', sellingPrice: 125000, available: 6 };
const line = { productId: p.id, productCode: p.code, productName: p.name, quantity: 1, unitPrice: 125000, lineTotal: 125000, available: 6 };
const order = (more = {}) => ({ id: 'o1', code: 'DH-0010', status: 'AWAITING_PAYMENT', paid: false, customer: null,
  lines: [line], subtotal: 125000, tierDiscount: 0, total: 125000, cashPayment: null, ...more });
const page = data => ({ data, meta: { page: { page: 1, limit: 20, total: data.length } } });
function api(over = {}) {
  return { products: jest.fn().mockResolvedValue(page([p, { ...p, id: 'p2', code: 'SP-0002', name: 'Dây dắt', available: 0 }])),
    openOrders: jest.fn().mockResolvedValue(page([])), lookup: jest.fn().mockResolvedValue({ customer: { id: 'c1', displayName: 'Khách tổng hợp' } }),
    preview: jest.fn().mockImplementation(async body => ({ lines: body.lines.map(l => ({ ...line, quantity: l.quantity })), subtotal: 333000, tierDiscount: 0, total: body.lines.length ? 333000 : 0 })),
    create: jest.fn().mockResolvedValue(order()), read: jest.fn().mockResolvedValue(order()),
    recordCash: jest.fn().mockResolvedValue(order({ status: 'PAID', paid: true, cashPayment: { amount: 125000, receivedAt: '2026-11-08T03:20:00Z' } })),
    complete: jest.fn().mockResolvedValue(order({ status: 'COMPLETED', paid: true })),
    cancel: jest.fn().mockResolvedValue(order({ status: 'CANCELLED' })), ...over };
}
const mount = (service, url = '/admin/counter-sale') => render(<MemoryRouter initialEntries={[url]}><CounterSalePage api={service} /></MemoryRouter>);
const add = async () => fireEvent.click(await screen.findByRole('button', { name: `Thêm ${p.name}` }));
async function draft(service = api()) { mount(service); await add(); await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeEnabled()); return service; }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test.each(['AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED'])('AC-28 locks all anonymous order inputs after restore in %s', async status => {
  const service = api({ read: jest.fn().mockResolvedValue(order({ status, paid: ['PAID', 'COMPLETED'].includes(status),
    lines: [{ ...line, quantity: 2, lineTotal: 250000 }], subtotal: 250000, total: 250000 })) });
  mount(service, '/admin/counter-sale?order=o1'); await screen.findByRole('heading', { name: 'Đơn DH-0010' });
  expect(screen.getByRole('group', { name: 'Cách thanh toán' })).toBeVisible();
  expect(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Tìm' })).toBeDisabled();
  for (const name of ['Thêm Hạt cho mèo', 'Hết hàng Dây dắt', 'Giảm số lượng', 'Tăng số lượng']) {
    const button = await screen.findByRole('button', { name }); expect(button).toBeDisabled(); fireEvent.click(button);
  }
  expect(screen.queryByRole('button', { name: 'Bỏ Hạt cho mèo' })).not.toBeInTheDocument();
  expect(service.create).not.toHaveBeenCalled(); expect(service.lookup).not.toHaveBeenCalled();
});

test.each(['AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED'])('AC-27 keeps only the checked customer name after restoring a linked order in %s', async status => {
  const service = api({ read: jest.fn().mockResolvedValue(order({ status, paid: ['PAID', 'COMPLETED'].includes(status),
    customer: { id: 'c1', displayName: 'Khách tổng hợp' } })) });
  mount(service, '/admin/counter-sale?order=o1');
  const band = (await screen.findByText('Khách tổng hợp')).closest('.counter-customer');
  expect(band.querySelector('svg.lucide-check')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('textbox', { name: 'Số điện thoại hoặc email của khách (không bắt buộc)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Tìm' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Thêm Hạt cho mèo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
  expect(screen.getByRole('group', { name: 'Cách thanh toán' })).toBeVisible();
});

test('AC-26 shows product search, backend availability, disabled out-of-stock, cash selected and VietQR disabled', async () => {
  const service = api(); mount(service);
  expect(await screen.findByRole('button', { name: 'Thêm Hạt cho mèo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Hết hàng Dây dắt' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'Tiền mặt' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'VietQR' })).toBeDisabled();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SP-0001' } });
  await waitFor(() => expect(service.products).toHaveBeenLastCalledWith({ search: 'SP-0001', page: 1 }, expect.any(Object)));
});
test('AC-26 adds, changes and removes draft lines, renders backend totals and sends no client prices', async () => {
  const service = await draft();
  expect(screen.getByText('333.000 đ', { selector: '.counter-total strong' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
  await waitFor(() => expect(service.preview).toHaveBeenLastCalledWith({ lines: [{ productId: 'p1', quantity: 2 }] }, expect.any(Object)));
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ Hạt cho mèo' }));
  expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeDisabled();
});
test('AC-27 finds only a customer name and clears it as soon as the contact changes', async () => {
  const service = await draft();
  fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)'), { target: { value: '0912345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  expect(await screen.findByText('Khách tổng hợp')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)'), { target: { value: 'other@example.test' } });
  expect(screen.queryByText('Khách tổng hợp')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn' }));
  await waitFor(() => expect(service.create).toHaveBeenCalledWith({ lines: [{ productId: 'p1', quantity: 1 }] }, expect.any(String)));
});
test('AC-27 MSG110 permits an anonymous sale and leaves the tier discount at zero', async () => {
  const service = await draft(api({ lookup: jest.fn().mockResolvedValue({ customer: null }) }));
  fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)'), { target: { value: '0999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  expect(await screen.findByText('Không tìm thấy khách. Đơn vẫn bán nhưng không giảm theo hạng.')).toBeVisible();
  expect(within(screen.getByTestId('counter-discount')).getByText('0 đ')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeEnabled();
  expect(service.create).not.toHaveBeenCalled();
});
test('ignores an old customer lookup after the contact has changed', async () => {
  const late = deferred(); await draft(api({ lookup: jest.fn().mockReturnValue(late.promise) }));
  const input = screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)');
  fireEvent.change(input, { target: { value: '0912345678' } }); fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  fireEvent.change(input, { target: { value: '0999999999' } }); late.resolve({ customer: { id: 'c1', displayName: 'Khách cũ' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm' })).toBeEnabled());
  expect(screen.queryByText('Khách cũ')).not.toBeInTheDocument();
});
test('AC-28 creates once on double click, locks order content and records full cash before completing', async () => {
  const create = deferred(), service = await draft(api({ create: jest.fn().mockReturnValue(create.promise) }));
  const button = screen.getByRole('button', { name: 'Tạo đơn' }); fireEvent.click(button); fireEvent.click(button);
  expect(service.create).toHaveBeenCalledTimes(1); create.resolve(order());
  expect(await screen.findByText('Chờ thanh toán')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
  expect(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Đã nhận đủ tiền mặt' }));
  expect(await screen.findByText('Đã nhận 125.000 đ tiền mặt lúc 10:20')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất bán' }));
  expect(await screen.findByText('Đơn DH-0010 đã hoàn tất.')).toBeVisible();
});
test('retains the same body and key after a lost creation response and freezes draft edits until retry', async () => {
  const service = await draft(api({ create: jest.fn().mockRejectedValueOnce(new ApiError('TIMEOUT')).mockResolvedValue(order()) }));
  fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn' }));
  const retry = await screen.findByRole('button', { name: 'Thử lại tạo đơn' });
  expect(screen.getByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
  fireEvent.click(retry); await screen.findByText('Chờ thanh toán');
  expect(service.create.mock.calls[1]).toEqual(service.create.mock.calls[0]);
});
test('AC-28 cancels an unpaid sale and starts an empty new draft while retaining MSG112', async () => {
  const service = api(); mount(service, '/admin/counter-sale?order=o1');
  fireEvent.click(await screen.findByRole('button', { name: 'Huỷ đơn' }));
  expect(await screen.findByText('Đơn DH-0010 đã được huỷ. Hàng đã được trả lại để bán.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn mới' }));
  expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeDisabled();
  expect(screen.getByText('Đơn DH-0010 đã được huỷ. Hàng đã được trả lại để bán.')).toBeVisible();
});
test('restores a paid order by URL and can complete without creating or taking money again', async () => {
  const service = api({ read: jest.fn().mockResolvedValue(order({ status: 'PAID', paid: true, cashPayment: { amount: 125000, receivedAt: '2026-11-08T03:20:00Z' } })) });
  mount(service, '/admin/counter-sale?order=o1'); fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tất bán' }));
  await screen.findByText('Đơn DH-0010 đã hoàn tất.'); expect(service.create).not.toHaveBeenCalled(); expect(service.recordCash).not.toHaveBeenCalled();
});
test('MSG58 uses current server availability including zero instead of stale product data', async () => {
  const service = await draft(api({ create: jest.fn().mockRejectedValue(new ApiError('PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', 409, { available: 0, productId: 'p1' })) }));
  fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn' }));
  expect(await screen.findByText('Chỉ còn 0 sản phẩm. Vui lòng giảm số lượng.')).toBeVisible();
  expect(service.create).toHaveBeenCalledTimes(1);
});

test('opens an unfinished sale from the inline list and ignores a late preview from the previous draft', async () => {
  const late = deferred(), service = api({ openOrders: jest.fn().mockResolvedValue(page([order()])), preview: jest.fn().mockReturnValue(late.promise) });
  mount(service); fireEvent.click(await screen.findByRole('button', { name: 'Mở DH-0010' }));
  await screen.findByRole('button', { name: 'Đã nhận đủ tiền mặt' });
  await act(async () => late.resolve({ lines: [], subtotal: 999, tierDiscount: 0, total: 999 }));
  expect(screen.queryByText('999 đ')).not.toBeInTheDocument();
  expect(service.read).toHaveBeenCalledWith('o1', expect.any(Object));
});
test('caps a line at 99 without reporting a false stock shortage', async () => {
  await draft(api({ products: jest.fn().mockResolvedValue(page([{ ...p, available: 120 }])) }));
  for (let i = 1; i < 99; i++) fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
  expect(await screen.findByText('Mỗi dòng tối đa 99 sản phẩm.')).toBeVisible();
  expect(screen.getByLabelText('Số lượng Hạt cho mèo', { selector: 'output' })).toHaveTextContent('99');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeEnabled());
});
test('invalid and empty customer searches report at the contact field and do not prevent anonymous sales', async () => {
  const service = await draft(api({ lookup: jest.fn().mockRejectedValue(new ApiError('VALIDATION_FAILED', 422, { fields: { contact: 'PHONE' } })) }));
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible(); expect(service.lookup).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)'), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  expect(await screen.findByText('Vui lòng nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0).')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeEnabled();
});
test('clears an ineligible selected customer after server recheck and allows finding again or selling anonymously', async () => {
  const service = await draft(api({ create: jest.fn().mockRejectedValue(new ApiError('COUNTER_CUSTOMER_UNAVAILABLE', 422)) }));
  fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email của khách (không bắt buộc)'), { target: { value: '0912345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' })); await screen.findByText('Khách tổng hợp');
  fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn' }));
  await screen.findByText('Khách đã chọn không còn khả dụng. Vui lòng tìm lại hoặc bán không gắn khách.');
  expect(screen.queryByText('Khách tổng hợp')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeEnabled());
  expect(service.create.mock.calls[0][0].customerId).toBe('c1');
});
test('refreshes authoritative state after a lost cash response without automatically recording again', async () => {
  const paid = order({ status: 'PAID', paid: true, cashPayment: { amount: 125000, receivedAt: '2026-11-08T03:20:00Z' } });
  const service = api({ read: jest.fn().mockResolvedValueOnce(order()).mockResolvedValue(paid), recordCash: jest.fn().mockRejectedValue(new ApiError('TIMEOUT')) });
  mount(service, '/admin/counter-sale?order=o1'); fireEvent.click(await screen.findByRole('button', { name: 'Đã nhận đủ tiền mặt' }));
  expect(await screen.findByRole('button', { name: 'Hoàn tất bán' })).toBeEnabled(); expect(service.recordCash).toHaveBeenCalledTimes(1);
});

test('discards a creation response from the previous account after the private page unmounts', async () => {
  const late = deferred(), old = api({ create: jest.fn().mockReturnValue(late.promise) });
  const oldPage = mount(old); await add();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn' })); oldPage.unmount();
  const fresh = api(); mount(fresh);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo đơn' })).toBeDisabled());
  await act(async () => late.resolve(order({ customer: { id: 'old', displayName: 'Khách của tài khoản cũ' } })));
  expect(screen.queryByText('Khách của tài khoản cũ')).not.toBeInTheDocument();
  expect(screen.queryByText('Đơn DH-0010')).not.toBeInTheDocument(); expect(fresh.read).not.toHaveBeenCalled();
});
