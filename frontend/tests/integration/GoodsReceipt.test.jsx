import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../src/services/api-client.js';
import { GoodsReceiptPage } from '../../src/pages/admin/GoodsReceiptPage.jsx';

const SUPPLIERS = [{ id: 's1', name: 'Công ty TNHH Thức ăn thú cưng Minh An' }, { id: 's2', name: 'Công ty CP Phụ kiện thú cưng Hoà Bình' }];
const P12 = { id: 'p12', code: 'SP-0012', name: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', visible: true };
const P14 = { id: 'p14', code: 'SP-0014', name: 'Thức ăn hạt cho mèo trưởng thành, 1,5 kg', visible: true };
const P36 = { id: 'p36', code: 'SP-0036', name: 'Áo mưa cho chó, cỡ S', visible: false };
const summary = (n, over = {}) => ({ id: `r${n}`, code: `PN-${String(n).padStart(4, '0')}`, supplierName: 'Công ty TNHH Thức ăn thú cưng Minh An',
  receivedOn: '2026-11-02', recordedAt: '2026-11-02T03:00:00.000Z', totalReceived: 10, totalAccepted: 10, totalRejected: 0, ...over });
const receiptOf = (over = {}) => ({ ...summary(11, { totalReceived: 12, totalAccepted: 10, totalRejected: 2 }), supplierId: 's1', recorderName: 'Ngô Thu Hằng',
  lines: [{ productId: 'p14', productCode: 'SP-0014', productName: P14.name, quantityReceived: 12, quantityAccepted: 10, quantityRejected: 2, rejectReason: 'Bao bì rách' }], ...over });

function fakeApi(over = {}) {
  return {
    listSuppliers: jest.fn().mockResolvedValue({ data: SUPPLIERS }),
    listProducts: jest.fn().mockImplementation(async () => ({ data: [P12, P14, P36] })),
    listRecent: jest.fn().mockResolvedValue({ data: [summary(11), summary(10, { totalReceived: 15, totalAccepted: 14, totalRejected: 1, receivedOn: '2026-10-31' })] }),
    readReceipt: jest.fn().mockImplementation(async (code) => receiptOf({ code })),
    createReceipt: jest.fn().mockResolvedValue(receiptOf({ code: 'PN-0012' })),
    ...over
  };
}
const FIXED_NOW = Date.parse('2026-11-04T03:00:00Z');
const show = (api = fakeApi(), url = '/admin/goods-receipts') => {
  render(<MemoryRouter initialEntries={[url]}><GoodsReceiptPage api={api} recorderName="Ngô Thu Hằng" clock={() => FIXED_NOW} /></MemoryRouter>);
  return api;
};
const supplierBox = () => screen.getByLabelText('Nhà cung cấp');
const pickSupplier = async (id = 's1') => {
  await waitFor(() => expect(within(supplierBox()).getAllByRole('option').length).toBeGreaterThan(1));
  fireEvent.change(supplierBox(), { target: { value: id } });
};
const addProduct = async (product = P12) => {
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
  fireEvent.click(await screen.findByRole('button', { name: `Thêm ${product.code} ${product.name}` }));
};
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (code, received, accepted, reason) => {
  type(`Số nhận ${code}`, received); type(`Nhận vào kho ${code}`, accepted);
  if (reason !== undefined) type(`Lý do từ chối ${code}`, reason);
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Lưu phiếu nhập' }));
const ready = async (api) => { await screen.findByText('PN-0011'); await waitFor(() => expect(api.listSuppliers).toHaveBeenCalled()); };

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

describe('the new receipt form', () => {
  test('shows the mockup: only the day and the recorder as read-only, the supplier box, the notice, zero totals and the recent receipts', async () => {
    const api = show();
    await ready(api);
    expect(screen.getByRole('heading', { level: 1, name: 'Nhập hàng' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Phiếu nhập mới' })).toBeVisible();
    expect(screen.getByLabelText('Ngày nhận')).toHaveValue('04/11/2026');
    expect(screen.getByLabelText('Ngày nhận')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Người ghi')).toHaveValue('Ngô Thu Hằng');
    expect(screen.getByLabelText('Người ghi')).toHaveAttribute('readonly');
    expect(within(supplierBox()).getAllByRole('option').map((option) => option.textContent)).toEqual(['Chọn nhà cung cấp', ...SUPPLIERS.map((s) => s.name)]);
    expect(screen.getByText('Hàng từ chối sẽ được báo cho Quản trị viên và trả lại nhà cung cấp ngoài PWC.')).toBeVisible();
    expect(screen.getByText('Nhận vào kho: 0')).toBeVisible();
    expect(screen.getByText('Từ chối: 0')).toBeVisible();
    expect(screen.getByText('Chưa có sản phẩm nào. Bấm Thêm sản phẩm để bắt đầu.')).toBeVisible();
    const recent = screen.getByRole('complementary', { name: 'Phiếu nhập gần đây' });
    expect(within(recent).getByText('PN-0011')).toBeVisible();
    expect(within(recent).getByText('02/11/2026 · Công ty TNHH Thức ăn thú cưng Minh An')).toBeVisible();
    expect(within(recent).getByText('Nhận 10 · Từ chối 0')).toBeVisible();
    expect(within(recent).getByText('Nhận 15 · Từ chối 1')).toBeVisible();
  });

  test('adds a product from the search, hidden ones too, and each product only once', async () => {
    const api = show();
    await ready(api);
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    expect(await screen.findByRole('button', { name: `Thêm SP-0036 ${P36.name}` })).toHaveTextContent('đang ẩn');
    fireEvent.click(screen.getByRole('button', { name: `Thêm SP-0012 ${P12.name}` }));
    const row = screen.getByText(P12.name).closest('tr');
    expect(within(row).getByText('SP-0012')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Kết quả tìm sản phẩm' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    expect(await screen.findByRole('button', { name: `Thêm SP-0012 ${P12.name}` })).toBeDisabled();
    expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }), expect.any(Object));
  });

  test('works out the rejected quantity and the totals; the reason opens only for a line that rejects goods', async () => {
    const api = show();
    await ready(api);
    await addProduct(P12);
    await addProduct(P14);
    expect(screen.getByLabelText('Từ chối SP-0012')).toHaveTextContent('—');
    expect(screen.getByLabelText('Lý do từ chối SP-0012')).toBeDisabled();
    expect(screen.getByLabelText('Nhận vào kho SP-0012')).toHaveValue('');
    fill('SP-0012', '10', '10');
    expect(screen.getByLabelText('Từ chối SP-0012')).toHaveTextContent('0');
    expect(screen.getByLabelText('Lý do từ chối SP-0012')).toBeDisabled();
    fill('SP-0014', '12', '10');
    expect(screen.getByLabelText('Từ chối SP-0014')).toHaveTextContent('2');
    expect(screen.getByLabelText('Lý do từ chối SP-0014')).toBeEnabled();
    expect(screen.getByText('Nhận vào kho: 20')).toBeVisible();
    expect(screen.getByText('Từ chối: 2')).toBeVisible();
    type('Nhận vào kho SP-0014', '13');
    expect(screen.getByLabelText('Từ chối SP-0014')).toHaveTextContent('—');
    expect(screen.getByText('Từ chối: 0')).toBeVisible();
  });

  test('the boxes stop at their limits', async () => {
    const api = show();
    await ready(api);
    await addProduct(P12);
    expect(screen.getByLabelText('Số nhận SP-0012')).toHaveAttribute('maxlength', '6');
    expect(screen.getByLabelText('Nhận vào kho SP-0012')).toHaveAttribute('maxlength', '6');
    expect(screen.getByLabelText('Lý do từ chối SP-0012')).toHaveAttribute('maxlength', '300');
  });

  test('removes a line with the cross', async () => {
    const api = show();
    await ready(api);
    await addProduct(P12);
    await addProduct(P14);
    fireEvent.click(screen.getByRole('button', { name: `Bỏ SP-0012 ${P12.name}` }));
    expect(screen.queryByText(P12.name)).not.toBeInTheDocument();
    expect(screen.getByText(P14.name)).toBeVisible();
  });

  test('AC-31 shows MSG01 for a missing supplier and asks for a product when there is none, sending nothing', async () => {
    const api = show();
    await ready(api);
    save();
    expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
    expect(screen.getByText('Chọn ít nhất một sản phẩm.')).toBeVisible();
    expect(supplierBox()).toHaveAttribute('aria-invalid', 'true');
    expect(api.createReceipt).not.toHaveBeenCalled();
  });

  test('AC-31 shows MSG113, MSG119 and MSG120 under the wrong boxes, sending nothing', async () => {
    const api = show();
    await ready(api);
    await pickSupplier();
    await addProduct(P12);
    await addProduct(P14);
    await addProduct(P36);
    fill('SP-0012', '0', '');
    fill('SP-0014', '10', '11');
    fill('SP-0036', '10', '4', '   ');
    save();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
    expect(within(rows[0]).getByText('Vui lòng nhập số nguyên từ 0 đến số lượng đã nhận.')).toBeVisible();
    expect(within(rows[1]).getByText('Vui lòng nhập số nguyên từ 0 đến số lượng đã nhận.')).toBeVisible();
    expect(within(rows[2]).getByText('Vui lòng ghi lý do hàng bị từ chối.')).toBeVisible();
    expect(screen.getByLabelText('Số nhận SP-0012')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createReceipt).not.toHaveBeenCalled();
  });

  test('a quantity above the limit has its own text, not MSG113', async () => {
    const api = show();
    await ready(api);
    await pickSupplier();
    await addProduct(P12);
    fill('SP-0012', '100001', '1');
    save();
    expect(await screen.findByText('Tối đa 100.000.')).toBeVisible();
    expect(screen.queryByText('Vui lòng nhập số nguyên lớn hơn 0.')).not.toBeInTheDocument();
  });
});

describe('saving', () => {
  const filled = async (api) => {
    await ready(api);
    await pickSupplier();
    await addProduct(P12);
    await addProduct(P14);
    fill('SP-0012', '10', '10', 'không dùng');
    fill('SP-0014', '12', '10', '  Bao bì rách ');
  };

  test('AC-31 sends the numbers, a reason only for a line that rejects, then shows MSG121, empties the form and reloads the recent list', async () => {
    const api = show();
    await filled(api);
    save();
    expect(await screen.findByText(/Phiếu nhập PN-0012 đã được lưu\./)).toBeVisible();
    expect(api.createReceipt).toHaveBeenCalledWith({ supplierId: 's1', lines: [
      { productId: 'p12', quantityReceived: 10, quantityAccepted: 10 },
      { productId: 'p14', quantityReceived: 12, quantityAccepted: 10, rejectReason: 'Bao bì rách' }
    ] }, expect.stringMatching(/^goods-receipt:.{8,}/));
    expect(supplierBox()).toHaveValue('');
    expect(screen.queryByText(P12.name)).not.toBeInTheDocument();
    expect(screen.getByText('Nhận vào kho: 0')).toBeVisible();
    await waitFor(() => expect(api.listRecent).toHaveBeenCalledTimes(2));
  });

  test('the saved receipt opens from the message', async () => {
    const api = show();
    await filled(api);
    save();
    fireEvent.click(await screen.findByRole('button', { name: 'Xem phiếu' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Phiếu nhập PN-0012' })).toBeVisible();
    expect(api.readReceipt).toHaveBeenCalledWith('PN-0012', expect.any(Object));
  });

  test('the message goes away when the form is edited again', async () => {
    const api = show();
    await filled(api);
    save();
    await screen.findByText(/Phiếu nhập PN-0012 đã được lưu\./);
    await addProduct(P36);
    expect(screen.queryByText(/Phiếu nhập PN-0012 đã được lưu\./)).not.toBeInTheDocument();
  });

  test('a save that is still running cannot be sent twice', async () => {
    let finish;
    const api = fakeApi({ createReceipt: jest.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })) });
    show(api);
    await filled(api);
    save(); save();
    expect(api.createReceipt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).toBeDisabled();
    finish(receiptOf({ code: 'PN-0012' }));
    expect(await screen.findByText(/Phiếu nhập PN-0012 đã được lưu\./)).toBeVisible();
  });

  test('shows what the API found wrong, by field and by line', async () => {
    const api = fakeApi({ createReceipt: jest.fn().mockRejectedValue(new ApiError('VALIDATION_FAILED', 422, {
      fields: { supplierId: 'INVALID' }, lineFields: { 0: { quantityReceived: 'INVALID' }, 1: { rejectReason: 'TOO_LONG', productId: 'DUPLICATE' } } })) });
    show(api);
    await filled(api);
    save();
    expect(await screen.findByText('Không tìm thấy nhà cung cấp này. Vui lòng chọn lại.')).toBeVisible();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
    expect(within(rows[1]).getByText('Tối đa 300 ký tự.')).toBeVisible();
    expect(within(rows[1]).getByText('Sản phẩm này đã có trong phiếu.')).toBeVisible();
    expect(screen.getByText(P12.name)).toBeVisible();
  });

  test('AC-30 a supplier that stopped meanwhile: says so, clears the choice and loads the suppliers again; the lines stay', async () => {
    const api = fakeApi({ createReceipt: jest.fn().mockRejectedValue(new ApiError('SUPPLIER_NOT_ACTIVE', 409)) });
    show(api);
    await filled(api);
    save();
    expect(await screen.findByText('Nhà cung cấp này đã ngừng hợp tác nên không chọn được. Vui lòng chọn nhà cung cấp khác.')).toBeVisible();
    expect(supplierBox()).toHaveValue('');
    await waitFor(() => expect(api.listSuppliers).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Số nhận SP-0012')).toHaveValue('10');
  });

  test.each([
    ['SUPPLIER_NOT_FOUND', 422, 'Không tìm thấy nhà cung cấp này. Vui lòng chọn lại.'],
    ['PRODUCT_NOT_FOUND', 422, 'Có sản phẩm không còn trong danh mục. Vui lòng bỏ dòng đó.'],
    ['RECEIPT_CODE_CONFLICT', 409, 'Mã phiếu bị trùng ở cùng thời điểm. Chưa lưu gì, vui lòng lưu lại.'],
    ['FORBIDDEN', 403, 'Bạn không có quyền ghi phiếu nhập.'],
    ['SOMETHING_ELSE', 400, 'Chưa thể hoàn tất. Vui lòng thử lại sau.']
  ])('says what happened for %s', async (code, status, text) => {
    const api = fakeApi({ createReceipt: jest.fn().mockRejectedValue(new ApiError(code, status)) });
    show(api);
    await filled(api);
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByLabelText('Số nhận SP-0012')).toHaveValue('10');
  });

  const NOT_SURE = /Chưa nhận được xác nhận lưu phiếu\./;
  const keyOf = (api, call) => api.createReceipt.mock.calls[call][1];

  test('when the answer may have been lost, it says saving again is safe, and reloads the recent receipts', async () => {
    const api = fakeApi({ createReceipt: jest.fn().mockRejectedValue(new ApiError('NETWORK_ERROR')) });
    show(api);
    await filled(api);
    save();
    expect(await screen.findByText(NOT_SURE)).toBeVisible();
    expect(screen.getByText(NOT_SURE)).toHaveTextContent('hệ thống trả lại đúng phiếu đó và không cộng tồn lần nữa');
    await waitFor(() => expect(api.listRecent).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).toBeEnabled();
  });

  test('D-218 saving again after a lost answer sends the same key, so the receipt already saved comes back and no second one is made', async () => {
    const api = fakeApi({ createReceipt: jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(receiptOf({ code: 'PN-0012' })) });
    show(api);
    await filled(api);
    save();
    await screen.findByText(NOT_SURE);
    save();
    expect(await screen.findByText(/Phiếu nhập PN-0012 đã được lưu\./)).toBeVisible();
    expect(api.createReceipt).toHaveBeenCalledTimes(2);
    expect(keyOf(api, 1)).toBe(keyOf(api, 0));
    expect(api.createReceipt.mock.calls[1][0]).toEqual(api.createReceipt.mock.calls[0][0]);
  });

  test('D-218 a form that was changed gets a new key, and so does the next receipt after a save', async () => {
    const api = fakeApi({ createReceipt: jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(receiptOf({ code: 'PN-0012' })) });
    show(api);
    await filled(api);
    save();
    await screen.findByText(NOT_SURE);
    type('Số nhận SP-0012', '11'); type('Nhận vào kho SP-0012', '11');
    save();
    await screen.findByText(/Phiếu nhập PN-0012 đã được lưu\./);
    expect(keyOf(api, 1)).not.toBe(keyOf(api, 0));
    await pickSupplier();
    await addProduct(P12);
    fill('SP-0012', '10', '10');
    save();
    await waitFor(() => expect(api.createReceipt).toHaveBeenCalledTimes(3));
    expect(keyOf(api, 2)).not.toBe(keyOf(api, 1));
  });
});

describe('suppliers and recent receipts', () => {
  test('without an active supplier it says so, and the box is empty', async () => {
    const api = show(fakeApi({ listSuppliers: jest.fn().mockResolvedValue({ data: [] }) }));
    expect(await screen.findByText('Chưa có nhà cung cấp nào đang hợp tác.')).toBeVisible();
    expect(supplierBox()).toBeDisabled();
    expect(api.listRecent).toHaveBeenCalled();
  });

  test('a supplier list that fails offers to try again', async () => {
    const listSuppliers = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue({ data: SUPPLIERS });
    show(fakeApi({ listSuppliers }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(within(supplierBox()).getAllByRole('option')).toHaveLength(3));
  });

  test('the recent list can be empty, fail, or be forbidden', async () => {
    const { unmount } = render(<MemoryRouter><GoodsReceiptPage api={fakeApi({ listRecent: jest.fn().mockResolvedValue({ data: [] }) })} /></MemoryRouter>);
    expect(await screen.findByText('Chưa có phiếu nhập nào.')).toBeVisible();
    unmount();
    const failing = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue({ data: [summary(1)] });
    const view = render(<MemoryRouter><GoodsReceiptPage api={fakeApi({ listRecent: failing })} /></MemoryRouter>);
    const recent = await screen.findByRole('complementary', { name: 'Phiếu nhập gần đây' });
    fireEvent.click(await within(recent).findByRole('button', { name: 'Thử lại' }));
    expect(await within(recent).findByText('PN-0001')).toBeVisible();
    view.unmount();
    render(<MemoryRouter><GoodsReceiptPage api={fakeApi({ listRecent: jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403)) })} /></MemoryRouter>);
    expect(await screen.findByText('Bạn không có quyền ghi phiếu nhập.')).toBeVisible();
  });
});

describe('opening a receipt', () => {
  test('AC-31 a link such as /admin/goods-receipts?receipt=PN-0011 (from a MSG122 notice) shows that receipt, read only', async () => {
    const api = show(fakeApi(), '/admin/goods-receipts?receipt=PN-0011');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phiếu nhập PN-0011' })).toBeVisible();
    expect(api.readReceipt).toHaveBeenCalledWith('PN-0011', expect.any(Object));
    expect(screen.getByText('Công ty TNHH Thức ăn thú cưng Minh An', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText('02/11/2026')).toBeVisible();
    expect(screen.getByText('Ngô Thu Hằng', { selector: 'dd' })).toBeVisible();
    const row = screen.getByText(P14.name).closest('tr');
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent.replace(/SP-0014$/u, '')).slice(1)).toEqual(['12', '10', '2', 'Bao bì rách']);
    expect(screen.getByText('Nhận vào kho: 10')).toBeVisible();
    expect(screen.getByText('Từ chối: 2')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Lưu phiếu nhập' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Số nhận/ })).not.toBeInTheDocument();
  });

  test('a line that rejected nothing shows a dash for the reason, and the recent card of the open receipt is marked', async () => {
    show(fakeApi({ readReceipt: jest.fn().mockResolvedValue(receiptOf({ lines: [{ ...receiptOf().lines[0], quantityAccepted: 12, quantityRejected: 0, rejectReason: '' }] })) }),
      '/admin/goods-receipts?receipt=PN-0011');
    const row = (await screen.findByText(P14.name)).closest('tr');
    expect(within(row).getAllByRole('cell')[4]).toHaveTextContent('—');
    expect(screen.getByRole('button', { name: 'Xem phiếu nhập PN-0011' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Xem phiếu nhập PN-0010' })).not.toHaveAttribute('aria-current');
  });

  test('a card of the recent list opens its receipt, and Ghi phiếu nhập mới goes back to the form with the draft kept', async () => {
    const api = show();
    await ready(api);
    await pickSupplier('s2');
    await addProduct(P12);
    fill('SP-0012', '5', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Xem phiếu nhập PN-0011' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Phiếu nhập PN-0011' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ghi phiếu nhập mới' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Phiếu nhập mới' })).toBeVisible();
    expect(supplierBox()).toHaveValue('s2');
    expect(screen.getByLabelText('Số nhận SP-0012')).toHaveValue('5');
  });

  test('an unknown receipt says so without a retry button; another failure offers one', async () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/admin/goods-receipts?receipt=PN-0099']}>
      <GoodsReceiptPage api={fakeApi({ readReceipt: jest.fn().mockRejectedValue(new ApiError('RESOURCE_NOT_FOUND', 404)) })} /></MemoryRouter>);
    expect(await screen.findByText('Không tìm thấy phiếu nhập này.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    unmount();
    const readReceipt = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(receiptOf());
    show(fakeApi({ readReceipt }), '/admin/goods-receipts?receipt=PN-0011');
    expect(await screen.findByText('Chưa tải được dữ liệu nhập hàng')).toBeVisible();
    const view = screen.getByRole('region', { name: 'Phiếu nhập' });
    fireEvent.click(within(view).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Phiếu nhập PN-0011' })).toBeVisible();
  });

  test('a receipt the Admin may not read says so', async () => {
    show(fakeApi({ readReceipt: jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403)) }), '/admin/goods-receipts?receipt=PN-0011');
    const view = await screen.findByRole('region', { name: 'Phiếu nhập' });
    expect(await within(view).findByText('Bạn không có quyền ghi phiếu nhập.')).toBeVisible();
  });
});
