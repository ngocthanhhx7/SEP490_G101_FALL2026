import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../src/services/api-client.js';
import { SupplierManagementPage } from '../../src/pages/admin/SupplierManagementPage.jsx';

const COUNTS = { ACTIVE: 3, STOPPED: 1, ALL: 4 };
const P12 = { id: 'p12', code: 'SP-0012', name: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', visible: true };
const P36 = { id: 'p36', code: 'SP-0036', name: 'Xương gặm sạch răng cho chó', visible: false };
const supplier = (over = {}) => ({ id: 's1', name: 'Công ty TNHH Thức ăn thú cưng Minh An', contactName: 'Đỗ Văn Toàn', phone: '0936452118',
  email: 'kinhdoanh@minhanpet.vn', status: 'ACTIVE', productCount: 1, version: 0, ...over });
const detail = (over = {}) => ({ ...supplier(over), products: [P12], productCount: 1 });
const second = (over = {}) => supplier({ id: 's2', name: 'Công ty CP Phụ kiện thú cưng Hoà Bình', contactName: 'Lương Thị Hoa', phone: '0904778120', productCount: 2, ...over });
const listOf = (items, over = {}) => ({ data: items, meta: { page: { page: 1, limit: 20, total: items.length, ...over }, counts: COUNTS } });

function fakeApi(over = {}) {
  return {
    listSuppliers: jest.fn().mockResolvedValue(listOf([supplier(), second()])),
    readSupplier: jest.fn().mockImplementation(async (id) => (id === 's2' ? { ...second(), products: [P12, P36] } : detail())),
    createSupplier: jest.fn().mockResolvedValue({ ...detail({ id: 's9', name: 'Cơ sở Phúc Lộc', version: 0 }), products: [] , productCount: 0 }),
    updateSupplier: jest.fn().mockResolvedValue(detail({ version: 1 })),
    stopSupplier: jest.fn().mockResolvedValue(detail({ status: 'STOPPED', version: 1 })),
    resumeSupplier: jest.fn().mockResolvedValue(detail({ status: 'ACTIVE', version: 2 })),
    ...over
  };
}
const fakeProductApi = (items = [P12, P36]) => ({
  listProducts: jest.fn().mockImplementation(async () => ({ data: items.map((item) => ({ ...item, category: 'FOOD', petType: 'DOG', description: '', photos: [], sellingPrice: 1, version: 0 })),
    meta: { page: { page: 1, limit: 10, total: items.length } } }))
});
beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
const form = () => screen.getByRole('complementary', { name: /nhà cung cấp/ });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const show = (api = fakeApi(), productApi = fakeProductApi()) => { render(<SupplierManagementPage api={api} productApi={productApi} />); return { api, productApi }; };
const open = async (api, name = 'Công ty TNHH Thức ăn thú cưng Minh An') => {
  show(api);
  fireEvent.click(await screen.findByRole('button', { name: `Sửa nhà cung cấp ${name}` }));
  await screen.findByRole('complementary', { name: 'Sửa nhà cung cấp' });
};
const fillNew = ({ name = 'Cơ sở Phúc Lộc', phone = '0975 310 442', email = '' } = {}) => {
  type('Tên nhà cung cấp', name); type('Số điện thoại', phone); type('Email', email);
};

describe('Supplier Management list', () => {
  test('shows the tabs with their counts, Đang hợp tác first, and the suppliers with contact, phone, products and status', async () => {
    const { api } = show();
    expect(await screen.findByRole('button', { name: 'Đang hợp tác (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ngừng hợp tác (1)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tất cả (4)' })).toBeVisible();
    expect(api.listSuppliers).toHaveBeenCalledWith({ status: 'ACTIVE', page: 1, limit: 20 }, expect.any(Object));
    const row = screen.getByText('Công ty TNHH Thức ăn thú cưng Minh An').closest('tr');
    expect(within(row).getByText('Người liên hệ: Đỗ Văn Toàn')).toBeVisible();
    expect(within(row).getByText('0936 452 118')).toBeVisible();
    expect(within(row).getByText('1 sản phẩm')).toBeVisible();
    expect(within(row).getByText('Đang hợp tác')).toBeVisible();
    expect(screen.getByText('Hiển thị 1–2 trên 2 nhà cung cấp')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Nhà cung cấp' })).toBeVisible();
  });

  test('a supplier without a phone shows a dash, and one that stopped says so', async () => {
    show(fakeApi({ listSuppliers: jest.fn().mockResolvedValue(listOf([supplier({ phone: '', contactName: '', status: 'STOPPED' })])) }));
    const row = (await screen.findByText('Công ty TNHH Thức ăn thú cưng Minh An')).closest('tr');
    expect(within(row).getByText('—')).toBeVisible();
    expect(within(row).getByText('Ngừng hợp tác')).toHaveClass('pwc-shop-status--muted');
    expect(within(row).queryByText(/Người liên hệ/)).toBeNull();
  });

  test('switches tab starting again from page 1, and pages with Trước and Sau', async () => {
    const api = fakeApi({ listSuppliers: jest.fn().mockResolvedValue(listOf([supplier()], { total: 45 })) });
    show(api);
    expect(await screen.findByText('Hiển thị 1–20 trên 45 nhà cung cấp')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith({ status: 'ACTIVE', page: 2, limit: 20 }, expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: /^Ngừng hợp tác/ }));
    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith({ status: 'STOPPED', page: 1, limit: 20 }, expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: /^Tất cả/ }));
    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith({ status: 'ALL', page: 1, limit: 20 }, expect.any(Object)));
  });

  test('an empty tab says so and keeps its counts; an error offers a retry; no permission is said', async () => {
    const empty = show(fakeApi({ listSuppliers: jest.fn().mockResolvedValue(listOf([], { total: 0 })) }));
    expect(await screen.findByText('Chưa có nhà cung cấp nào trong mục này.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tất cả (4)' })).toBeVisible();
    expect(empty.api.listSuppliers).toHaveBeenCalledTimes(1);
  });

  test('a failed load can be retried', async () => {
    show(fakeApi({ listSuppliers: jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(listOf([supplier()])) }));
    expect(await screen.findByText('Chưa tải được danh sách nhà cung cấp')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Công ty TNHH Thức ăn thú cưng Minh An')).toBeVisible();
  });

  test('no permission is said in words', async () => {
    show(fakeApi({ listSuppliers: jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403)) }));
    expect(await screen.findByText('Bạn không có quyền quản lý nhà cung cấp.')).toBeVisible();
  });
});

describe('Supplier Management edit', () => {
  test('opens a supplier with its details and the products it supplies, hidden ones marked', async () => {
    const api = fakeApi();
    show(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nhà cung cấp Công ty CP Phụ kiện thú cưng Hoà Bình' }));
    const panel = await screen.findByRole('complementary', { name: 'Sửa nhà cung cấp' });
    expect(api.readSupplier).toHaveBeenCalledWith('s2');
    expect(within(panel).getByLabelText('Tên nhà cung cấp')).toHaveValue('Công ty CP Phụ kiện thú cưng Hoà Bình');
    expect(within(panel).getByLabelText('Người liên hệ')).toHaveValue('Lương Thị Hoa');
    expect(within(panel).getByLabelText('Số điện thoại')).toHaveValue('0904 778 120');
    expect(within(panel).getByLabelText('Email')).toHaveValue('kinhdoanh@minhanpet.vn');
    const products = within(panel).getByRole('list', { name: 'Sản phẩm cung cấp' });
    expect(within(products).getByText(/SP-0012 · Thức ăn hạt cho chó/)).toBeVisible();
    expect(within(products).getByText(/SP-0036 · Xương gặm sạch răng cho chó/)).toBeVisible();
    expect(within(products).getByText('(đang ẩn)')).toBeVisible();
    expect(within(panel).queryByText(/chỉ để ghi nhận/)).not.toBeInTheDocument();
  });

  test('AC-30 saves the changes with the version the Admin saw, the phone as typed and the products by id, and says MSG117', async () => {
    const api = fakeApi();
    await open(api);
    type('Người liên hệ', 'Nguyễn Văn B');
    type('Số điện thoại', '0912.345.678');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith('s1', {
      version: 0, name: 'Công ty TNHH Thức ăn thú cưng Minh An', contactName: 'Nguyễn Văn B', phone: '0912345678', email: 'kinhdoanh@minhanpet.vn', productIds: ['p12']
    }));
    expect(await screen.findByText('Nhà cung cấp Công ty TNHH Thức ăn thú cưng Minh An đã được lưu.')).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Sửa nhà cung cấp' })).toBeVisible();
  });

  test('AC-30 MSG01, MSG03 and MSG02 show under their fields, and nothing is sent', async () => {
    const api = fakeApi();
    await open(api);
    type('Tên nhà cung cấp', '   ');
    type('Số điện thoại', '+84936452118');
    type('Email', 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0).')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập địa chỉ email hợp lệ.')).toBeVisible();
    expect(screen.getByLabelText('Tên nhà cung cấp')).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateSupplier).not.toHaveBeenCalled();
  });

  test('AC-30 MSG125 is shown once when neither a phone nor an email is given', async () => {
    const api = fakeApi();
    await open(api);
    type('Số điện thoại', '');
    type('Email', '');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findAllByText('Vui lòng nhập số điện thoại hoặc email.')).toHaveLength(1);
    expect(screen.getByLabelText('Số điện thoại')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateSupplier).not.toHaveBeenCalled();
  });

  test('AC-30 MSG116 when the name is already used, on the name field, and the form keeps what was typed', async () => {
    const api = fakeApi({ updateSupplier: jest.fn().mockRejectedValue(new ApiError('SUPPLIER_NAME_TAKEN', 409)) });
    await open(api);
    type('Tên nhà cung cấp', 'Công ty Hòa Bình');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã có nhà cung cấp với tên này.')).toBeVisible();
    expect(screen.getByLabelText('Tên nhà cung cấp')).toHaveValue('Công ty Hòa Bình');
  });

  test('shows the reasons of a 422 from the API under the right fields', async () => {
    const api = fakeApi({ updateSupplier: jest.fn().mockRejectedValue(new ApiError('VALIDATION_FAILED', 422, { fields: { name: 'REQUIRED', phone: 'INVALID', email: 'INVALID' } })) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0).')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập địa chỉ email hợp lệ.')).toBeVisible();
  });

  test('the save button is locked while a save is under way, so a double click sends one request', async () => {
    let finish;
    const api = fakeApi({ updateSupplier: jest.fn(() => new Promise((resolve) => { finish = resolve; })) });
    await open(api);
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(api.updateSupplier).toHaveBeenCalledTimes(1);
    finish(detail({ version: 1 }));
    expect(await screen.findByText(/đã được lưu/)).toBeVisible();
  });

  test('a conflict says the supplier was changed and Tải lại shows the latest version', async () => {
    const api = fakeApi({ updateSupplier: jest.fn().mockRejectedValue(new ApiError('VERSION_CONFLICT', 409)),
      readSupplier: jest.fn().mockResolvedValueOnce(detail()).mockResolvedValue(detail({ version: 5, contactName: 'Người mới' })) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText(/Nhà cung cấp vừa được người khác sửa/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(screen.getByLabelText('Người liên hệ')).toHaveValue('Người mới'));
    expect(screen.queryByText(/vừa được người khác sửa/)).toBeNull();
  });

  test('a lost answer keeps the form and refreshes the list', async () => {
    const api = fakeApi({ updateSupplier: jest.fn().mockRejectedValue(new ApiError('TIMEOUT')) });
    await open(api);
    const before = api.listSuppliers.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.')).toBeVisible();
    await waitFor(() => expect(api.listSuppliers.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('Supplier Management products', () => {
  test('adds a product from the catalog, a hidden one too, and sends its id; one already chosen cannot be added again', async () => {
    const api = fakeApi();
    const { productApi } = show(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nhà cung cấp Công ty TNHH Thức ăn thú cưng Minh An' }));
    await screen.findByRole('complementary', { name: 'Sửa nhà cung cấp' });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    const results = await screen.findByRole('list', { name: 'Kết quả tìm sản phẩm' });
    expect(productApi.listProducts).toHaveBeenCalledWith({ search: '', limit: 10 }, expect.any(Object));
    expect(within(results).getByRole('button', { name: /Thêm SP-0012/ })).toBeDisabled();
    expect(within(results).getByText('(đang ẩn)')).toBeVisible();
    fireEvent.click(within(results).getByRole('button', { name: /Thêm SP-0036/ }));
    expect(within(screen.getByRole('list', { name: 'Sản phẩm cung cấp' })).getByText(/SP-0036/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith('s1', expect.objectContaining({ productIds: ['p12', 'p36'] })));
  });

  test('searches the catalog by name or code', async () => {
    const { productApi } = show();
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm nhà cung cấp' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Tìm sản phẩm theo tên hoặc mã' }), { target: { value: ' sp-00 ' } });
    await waitFor(() => expect(productApi.listProducts).toHaveBeenLastCalledWith({ search: 'sp-00', limit: 10 }, expect.any(Object)));
  });

  test('a product is removed with its cross and the list then sends without it', async () => {
    const api = fakeApi();
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: /^Bỏ SP-0012/ }));
    expect(screen.getByText('Chưa chọn sản phẩm nào.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith('s1', expect.objectContaining({ productIds: [] })));
  });

  test('says when no product matches, and a refused product is reported', async () => {
    const productApi = fakeProductApi([]);
    const api = fakeApi({ createSupplier: jest.fn().mockRejectedValue(new ApiError('PRODUCT_NOT_FOUND', 422)) });
    show(api, productApi);
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm nhà cung cấp' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    expect(await screen.findByText('Không tìm thấy sản phẩm nào.')).toBeVisible();
    fillNew({ email: 'a@example.test' });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nhà cung cấp' }));
    expect(await screen.findByText('Có sản phẩm không còn trong danh mục. Vui lòng chọn lại.')).toBeVisible();
  });
});

describe('Supplier Management create', () => {
  test('AC-30 the form starts empty with no products and saves a new supplier, saying MSG117', async () => {
    const api = fakeApi();
    show(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm nhà cung cấp' }));
    const panel = screen.getByRole('complementary', { name: 'Thêm nhà cung cấp' });
    expect(within(panel).getByLabelText('Tên nhà cung cấp')).toHaveValue('');
    expect(within(panel).getByText('Chưa chọn sản phẩm nào.')).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Ngừng hợp tác' })).toBeNull();
    fillNew({ name: ' Cơ sở Phúc Lộc ', phone: '0975 310 442' });
    type('Người liên hệ', 'Mai Văn Lộc');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nhà cung cấp' }));
    await waitFor(() => expect(api.createSupplier).toHaveBeenCalledWith({
      name: ' Cơ sở Phúc Lộc ', contactName: 'Mai Văn Lộc', phone: '0975310442', email: '', productIds: [] }));
    expect(await screen.findByText('Nhà cung cấp Cơ sở Phúc Lộc đã được lưu.')).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Sửa nhà cung cấp' })).toBeVisible();
  });

  test('AC-30 MSG01 and MSG125 for an empty form, with no request', async () => {
    const api = fakeApi();
    show(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm nhà cung cấp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nhà cung cấp' }));
    expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập số điện thoại hoặc email.')).toBeVisible();
    expect(api.createSupplier).not.toHaveBeenCalled();
  });

  test('Đóng closes the form', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm nhà cung cấp' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Thêm nhà cung cấp' })).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('complementary', { name: 'Thêm nhà cung cấp' })).toBeNull();
  });
});

describe('Supplier Management stop and resume', () => {
  test('AC-30 Ngừng hợp tác asks MSG118 first, and Không ngừng changes nothing', async () => {
    const api = fakeApi();
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng hợp tác' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Ngừng hợp tác với Công ty TNHH Thức ăn thú cưng Minh An? Nhà cung cấp này sẽ không còn được chọn ở phiếu nhập mới. Các phiếu nhập cũ được giữ nguyên.')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Không ngừng' }));
    expect(api.stopSupplier).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('AC-30 confirming stops the supplier with the version it saw, then the form offers Hợp tác lại', async () => {
    const api = fakeApi();
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng hợp tác' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ngừng hợp tác' }));
    await waitFor(() => expect(api.stopSupplier).toHaveBeenCalledWith('s1', 0));
    expect(await screen.findByRole('button', { name: 'Hợp tác lại' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ngừng hợp tác' })).toBeNull();
    expect(await screen.findByText(/đã được lưu/)).toBeVisible();
  });

  test('AC-30 Hợp tác lại works at once, with no confirmation', async () => {
    const api = fakeApi({ readSupplier: jest.fn().mockResolvedValue(detail({ status: 'STOPPED', version: 1 })) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Hợp tác lại' }));
    await waitFor(() => expect(api.resumeSupplier).toHaveBeenCalledWith('s1', 1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Ngừng hợp tác' })).toBeVisible();
  });

  test('a supplier that stopped can still be saved', async () => {
    const api = fakeApi({ readSupplier: jest.fn().mockResolvedValue(detail({ status: 'STOPPED', version: 1 })) });
    await open(api);
    type('Người liên hệ', 'Người khác');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith('s1', expect.objectContaining({ version: 1, contactName: 'Người khác' })));
  });

  test('the status button is locked while the form has changes not saved, with a hint', async () => {
    const api = fakeApi();
    await open(api);
    expect(screen.getByRole('button', { name: 'Ngừng hợp tác' })).toBeEnabled();
    type('Người liên hệ', 'Đang gõ dở');
    expect(screen.getByRole('button', { name: 'Ngừng hợp tác' })).toBeDisabled();
    expect(screen.getByText('Lưu hoặc bỏ thay đổi trước khi đổi trạng thái hợp tác.')).toBeVisible();
    type('Người liên hệ', 'Đỗ Văn Toàn');
    expect(screen.getByRole('button', { name: 'Ngừng hợp tác' })).toBeEnabled();
  });

  test('a repeated step says the state changed and offers Tải lại', async () => {
    const api = fakeApi({ stopSupplier: jest.fn().mockRejectedValue(new ApiError('SUPPLIER_STATE_CONFLICT', 409)) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng hợp tác' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ngừng hợp tác' }));
    expect(await screen.findByText(/Trạng thái hợp tác vừa được thay đổi/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeVisible();
  });

  test('a supplier that cannot be opened is reported and the list refreshes', async () => {
    const api = fakeApi({ readSupplier: jest.fn().mockRejectedValue(new ApiError('RESOURCE_NOT_FOUND', 404)) });
    show(api);
    const before = api.listSuppliers.mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nhà cung cấp Công ty TNHH Thức ăn thú cưng Minh An' }));
    expect(await screen.findByText('Không tìm thấy nhà cung cấp này.')).toBeVisible();
    await waitFor(() => expect(api.listSuppliers.mock.calls.length).toBeGreaterThan(before));
  });
});
