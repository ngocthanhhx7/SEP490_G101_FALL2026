import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../src/services/api-client.js';
import { ProductManagementPage } from '../../src/pages/admin/ProductManagementPage.jsx';

const SEARCH_LABEL = 'Tìm theo tên hoặc mã sản phẩm';
const product = (over = {}) => ({ id: 'p12', code: 'SP-0012', name: 'Dây dắt chó', category: 'ACCESSORY', petType: 'DOG', description: 'Dây dù bản 2 cm',
  photos: [], sellingPrice: 250000, visible: true, version: 0, ...over });
const hidden = (over = {}) => product({ id: 'p13', code: 'SP-0013', name: 'Cát vệ sinh cho mèo', category: 'FOOD', petType: 'CAT', sellingPrice: 95000, visible: false, ...over });
const listOf = (items, over = {}) => ({ data: items, meta: { page: { page: 1, limit: 20, total: items.length, ...over } } });

function fakeApi(over = {}) {
  return {
    listProducts: jest.fn().mockResolvedValue(listOf([product(), hidden()], { total: 9 })),
    readProduct: jest.fn().mockResolvedValue(product({ version: 5, name: 'Dây dắt chó (bản mới)' })),
    createProduct: jest.fn().mockResolvedValue(product({ id: 'p38', code: 'SP-0038', name: 'Vòng cổ', visible: false })),
    updateProduct: jest.fn().mockResolvedValue(product({ version: 1 })),
    ...over
  };
}
beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
const form = (name) => screen.getByRole('complementary', { name });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const open = async (api, code = 'SP-0012') => {
  render(<ProductManagementPage api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: `Sửa sản phẩm ${code}` }));
};
const fillNew = ({ name = 'Vòng cổ', category = 'ACCESSORY', petType = 'DOG', price = '60.000' } = {}) => {
  type('Tên sản phẩm', name);
  if (category) type('Danh mục', category);
  if (petType) type('Dành cho', petType);
  type('Giá bán (đ)', price);
};

describe('Product Management list', () => {
  test('lists every product with its category, pet type, price and whether it shows on the shop', async () => {
    const api = fakeApi();
    render(<ProductManagementPage api={api} />);
    expect(await screen.findByText('Dây dắt chó')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Sản phẩm' })).toBeVisible();
    expect(api.listProducts).toHaveBeenCalledWith({ search: '', category: '', petType: '', page: 1, limit: 20 }, expect.any(Object));
    const row = screen.getByText('SP-0013').closest('tr');
    expect(within(row).getByText('Cát vệ sinh cho mèo')).toBeVisible();
    expect(within(row).getByText('Thức ăn')).toBeVisible();
    expect(within(row).getByText('Mèo')).toBeVisible();
    expect(within(row).getByText('95.000 đ')).toBeVisible();
    expect(within(row).getByText('Đang ẩn')).toBeVisible();
    expect(within(screen.getByText('SP-0012').closest('tr')).getByText('Đang hiện')).toBeVisible();
    expect(screen.getByText('Hiển thị 1–9 trên 9 sản phẩm')).toBeVisible();
  });

  test('searches by a part of the name or code and filters by category and pet, starting again from page 1', async () => {
    const api = fakeApi();
    render(<ProductManagementPage api={api} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.change(screen.getByRole('searchbox', { name: SEARCH_LABEL }), { target: { value: ' sp-00 ' } });
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith({ search: 'sp-00', category: '', petType: '', page: 1, limit: 20 }, expect.any(Object)));
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo danh mục' }), { target: { value: 'FOOD' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo loại thú cưng' }), { target: { value: 'CAT' } });
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith({ search: 'sp-00', category: 'FOOD', petType: 'CAT', page: 1, limit: 20 }, expect.any(Object)));
  });

  test('pages with Trước and Sau, 20 products at a time', async () => {
    const api = fakeApi({ listProducts: jest.fn().mockResolvedValue(listOf([product()], { total: 45 })) });
    render(<ProductManagementPage api={api} />);
    expect(await screen.findByText('Hiển thị 1–20 trên 45 sản phẩm')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith({ search: '', category: '', petType: '', page: 2, limit: 20 }, expect.any(Object)));
  });

  test('MSG97 when nothing matches, an error with a retry, and no permission', async () => {
    const empty = fakeApi({ listProducts: jest.fn().mockResolvedValue(listOf([], { total: 0 })) });
    const { unmount } = render(<ProductManagementPage api={empty} />);
    expect(await screen.findByText('Không tìm thấy sản phẩm nào.')).toBeVisible();
    unmount();
    const failing = fakeApi({ listProducts: jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(listOf([product()])) });
    const second = render(<ProductManagementPage api={failing} />);
    expect(await screen.findByText('Chưa tải được danh sách sản phẩm')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Dây dắt chó')).toBeVisible();
    second.unmount();
    render(<ProductManagementPage api={fakeApi({ listProducts: jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403)) })} />);
    expect(await screen.findByText('Bạn không có quyền quản lý sản phẩm.')).toBeVisible();
  });
});

describe('Product Management edit', () => {
  test('opens a product with its code read-only, no stock, and the photos note', async () => {
    await open(fakeApi());
    const panel = form('Sửa sản phẩm SP-0012');
    expect(within(panel).getByLabelText('Mã sản phẩm')).toHaveValue('SP-0012');
    expect(within(panel).getByLabelText('Mã sản phẩm')).toHaveAttribute('readonly');
    expect(within(panel).getByLabelText('Tên sản phẩm')).toHaveValue('Dây dắt chó');
    expect(within(panel).getByLabelText('Danh mục')).toHaveValue('ACCESSORY');
    expect(within(panel).getByLabelText('Dành cho')).toHaveValue('DOG');
    expect(within(panel).getByLabelText('Giá bán (đ)')).toHaveValue('250.000');
    expect(within(panel).getByLabelText('Mô tả')).toHaveValue('Dây dù bản 2 cm');
    expect(within(panel).getByRole('switch', { name: 'Hiện trên trang Sản phẩm' })).toBeChecked();
    expect(within(panel).getByLabelText('Thêm ảnh sản phẩm')).toBeEnabled();
    expect(within(panel).queryByText(/tồn kho/i)).toBeNull();
  });

  test('D-249 puts the photo row inside the form between the description and the show switch, and its buttons do not save the form', async () => {
    const api = fakeApi({ listProducts: jest.fn().mockResolvedValue(listOf([product({ photos: ['/assets/products/a.webp', '/assets/products/b.webp'] })])) });
    await open(api);
    const panel = form('Sửa sản phẩm SP-0012');
    const photos = within(panel).getByRole('region', { name: 'Quản lý ảnh sản phẩm' });
    const after = (a, b) => Boolean(a.compareDocumentPosition(b) & window.Node.DOCUMENT_POSITION_FOLLOWING);
    expect(panel.querySelector('form')).toContainElement(photos);
    expect(after(within(panel).getByLabelText('Mô tả'), photos)).toBe(true);
    expect(after(photos, within(panel).getByRole('switch', { name: 'Hiện trên trang Sản phẩm' }))).toBe(true);
    expect(within(photos).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(photos).getByRole('button', { name: 'Xóa ảnh 2' }));
    expect(within(photos).getByText('Xóa ảnh 2 khỏi sản phẩm?')).toBeVisible();
    expect(api.updateProduct).not.toHaveBeenCalled();
  });

  test('AC-29 saves the changes with the version the Admin saw and says MSG115', async () => {
    const api = fakeApi();
    await open(api);
    type('Tên sản phẩm', ' Dây dắt chó lớn ');
    type('Giá bán (đ)', '300000');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith('p12', {
      version: 0, name: ' Dây dắt chó lớn ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 300000, description: 'Dây dù bản 2 cm', visible: true
    }));
    expect(await screen.findByText('Sản phẩm SP-0012 đã được lưu.')).toBeVisible();
    // The form now holds what was saved, with its next version.
    expect(screen.getByRole('complementary', { name: 'Sửa sản phẩm SP-0012' })).toBeVisible();
  });

  test('AC-29 MSG01 for a blank name and MSG113 for a price that is not a whole number above 0, with no request', async () => {
    const api = fakeApi();
    await open(api);
    type('Tên sản phẩm', '   ');
    type('Giá bán (đ)', '12,5');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateProduct).not.toHaveBeenCalled();
    for (const bad of ['0', '-3', '1.5', 'abc', '']) {
      type('Giá bán (đ)', bad);
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      expect(await screen.findByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
    }
    expect(api.updateProduct).not.toHaveBeenCalled();
  });

  test('a price over the limit has its own text, not MSG113, and the box takes at most 11 characters', async () => {
    const api = fakeApi();
    await open(api);
    expect(screen.getByLabelText('Giá bán (đ)')).toHaveAttribute('maxlength', '11');
    type('Giá bán (đ)', '999.999.999');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Giá bán tối đa 100.000.000 đ.')).toBeVisible();
    expect(screen.queryByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeNull();
    expect(api.updateProduct).not.toHaveBeenCalled();
  });

  test('shows the reasons of a 422 from the API under the right fields', async () => {
    const api = fakeApi({ updateProduct: jest.fn().mockRejectedValue(new ApiError('VALIDATION_FAILED', 422, { fields: { name: 'REQUIRED', sellingPrice: 'TOO_LARGE' } })) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
    expect(screen.getByText('Giá bán tối đa 100.000.000 đ.')).toBeVisible();
  });

  test('AC-29 hiding asks MSG114 first, and Không ẩn changes nothing', async () => {
    const api = fakeApi();
    await open(api);
    fireEvent.click(screen.getByRole('switch', { name: 'Hiện trên trang Sản phẩm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Ẩn Dây dắt chó? Khách hàng sẽ không còn thấy và đặt được sản phẩm này. Các đơn đã đặt không thay đổi.')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Không ẩn' }));
    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('AC-29 confirming MSG114 saves the product as hidden', async () => {
    const api = fakeApi({ updateProduct: jest.fn().mockResolvedValue(product({ visible: false, version: 1 })) });
    await open(api);
    fireEvent.click(screen.getByRole('switch', { name: 'Hiện trên trang Sản phẩm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ẩn sản phẩm' }));
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith('p12', expect.objectContaining({ version: 0, visible: false })));
    expect(await screen.findByText('Sản phẩm SP-0012 đã được lưu.')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Hiện trên trang Sản phẩm' })).not.toBeChecked();
  });

  test('showing a hidden product needs no confirmation', async () => {
    const api = fakeApi({ updateProduct: jest.fn().mockResolvedValue(hidden({ visible: true, version: 1 })) });
    await open(api, 'SP-0013');
    fireEvent.click(screen.getByRole('switch', { name: 'Hiện trên trang Sản phẩm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith('p13', expect.objectContaining({ visible: true })));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('the save button is locked while a save is under way, so a double click sends one request', async () => {
    let finish;
    const api = fakeApi({ updateProduct: jest.fn(() => new Promise((resolve) => { finish = resolve; })) });
    await open(api);
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(api.updateProduct).toHaveBeenCalledTimes(1);
    finish(product({ version: 1 }));
    expect(await screen.findByText('Sản phẩm SP-0012 đã được lưu.')).toBeVisible();
  });

  test('a conflict says the product was changed and Tải lại shows the latest version', async () => {
    const api = fakeApi({ updateProduct: jest.fn().mockRejectedValue(new ApiError('VERSION_CONFLICT', 409)) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText(/Sản phẩm vừa được người khác sửa/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Dây dắt chó (bản mới)'));
    expect(api.readProduct).toHaveBeenCalledWith('p12');
    expect(screen.queryByText(/Sản phẩm vừa được người khác sửa/)).toBeNull();
  });

  test('other failures keep the form and say it could not be completed', async () => {
    const api = fakeApi({ updateProduct: jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403)) });
    await open(api);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Bạn không có quyền quản lý sản phẩm.')).toBeVisible();
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Dây dắt chó');
  });
});

describe('Product Management create', () => {
  test('AC-29 the form has no code yet, starts hidden and cannot be switched on', async () => {
    render(<ProductManagementPage api={fakeApi()} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    const panel = form('Thêm sản phẩm');
    expect(within(panel).getByLabelText('Mã sản phẩm')).toHaveValue('');
    expect(within(panel).getByLabelText('Mã sản phẩm')).toHaveAttribute('placeholder', 'Mã sản phẩm do hệ thống cấp khi lưu.');
    expect(within(panel).getByRole('switch', { name: 'Hiện trên trang Sản phẩm' })).not.toBeChecked();
    expect(within(panel).getByRole('switch', { name: 'Hiện trên trang Sản phẩm' })).toBeDisabled();
    expect(within(panel).getByText(/lưu ở trạng thái ẩn/)).toBeVisible();
  });

  test('AC-29 MSG01 for every missing required field, with no request', async () => {
    const api = fakeApi();
    render(<ProductManagementPage api={api} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    expect(await screen.findAllByText('Vui lòng nhập thông tin này.')).toHaveLength(3);
    expect(screen.getByText('Vui lòng nhập số nguyên lớn hơn 0.')).toBeVisible();
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  test('AC-29 saves a new product with the price as a number and says MSG115 with the code the system gave', async () => {
    const api = fakeApi();
    render(<ProductManagementPage api={api} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    fillNew({ price: '60.000' });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    await waitFor(() => expect(api.createProduct).toHaveBeenCalledWith({ name: 'Vòng cổ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 60000, description: '' }));
    expect(await screen.findByText('Sản phẩm SP-0038 đã được lưu.')).toBeVisible();
    // The form now edits the saved product, and the list goes to the page that holds the new code (9 + 1 products: still page 1).
    const panel = form('Sửa sản phẩm SP-0038');
    expect(within(panel).getByLabelText('Mã sản phẩm')).toHaveValue('SP-0038');
    expect(within(panel).getByRole('switch', { name: 'Hiện trên trang Sản phẩm' })).not.toBeChecked();
    expect(api.listProducts.mock.calls.length).toBeGreaterThan(1);
  });

  test('after a save the list jumps to the last page, where the highest code is', async () => {
    const api = fakeApi({ listProducts: jest.fn().mockResolvedValue(listOf([product()], { total: 40 })) });
    render(<ProductManagementPage api={api} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    fillNew();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith({ search: '', category: '', petType: '', page: 3, limit: 20 }, expect.any(Object)));
  });

  test('an answer that is lost keeps the form and refreshes the list instead of saving twice', async () => {
    const api = fakeApi({ createProduct: jest.fn().mockRejectedValue(new ApiError('TIMEOUT')) });
    render(<ProductManagementPage api={api} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    fillNew();
    const before = api.listProducts.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    expect(await screen.findByText('Chưa thể hoàn tất. Vui lòng thử lại sau.')).toBeVisible();
    await waitFor(() => expect(api.listProducts.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Vòng cổ');
  });

  test('Đóng closes the form', async () => {
    render(<ProductManagementPage api={fakeApi()} />);
    await screen.findByText('Dây dắt chó');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm sản phẩm' }));
    fireEvent.click(within(form('Thêm sản phẩm')).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('complementary', { name: 'Thêm sản phẩm' })).toBeNull();
  });
});
