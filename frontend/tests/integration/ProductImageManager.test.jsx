import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductImageManager } from '../../src/components/product/ProductImageManager.jsx';

const product = { id: 'a'.repeat(24), version: 3, photos: ['/assets/products/steel-bowl.webp'] };
const file = () => new globalThis.File(['synthetic image bytes'], 'bowl.png', { type: 'image/png' });
let api, onSaved, onReload, onBusy;
beforeEach(() => {
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-preview');
  URL.revokeObjectURL = jest.fn();
  api = { uploadPhoto: jest.fn(), removePhoto: jest.fn() };
  onSaved = jest.fn(); onReload = jest.fn(); onBusy = jest.fn();
});
function show(props = {}) { return render(<ProductImageManager product={product} api={api} onSaved={onSaved} onReload={onReload} onBusy={onBusy} {...props} />); }
test('previews a file locally, uploads only on save and revokes the preview on unmount', async () => {
  const saved = { ...product, version: 4 }, selected = file(); api.uploadPhoto.mockResolvedValue(saved);
  const view = show();
  fireEvent.change(screen.getByLabelText('Thêm ảnh sản phẩm'), { target: { files: [selected] } });
  expect(await screen.findByAltText('Xem trước ảnh sản phẩm')).toHaveAttribute('src', 'blob:synthetic-preview');
  expect(api.uploadPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh', exact: true }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, { created: false }));
  expect(api.uploadPhoto).toHaveBeenCalledWith(product.id, selected, { version: 3, index: undefined });
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-preview');
});
test('replaces the selected index and requires confirmation before removal', async () => {
  api.uploadPhoto.mockResolvedValue({ ...product, version: 4 }); api.removePhoto.mockResolvedValue({ ...product, photos: [], version: 4 }); show();
  fireEvent.change(screen.getByLabelText('Thay ảnh 1'), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh', exact: true }));
  await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(product.id, expect.any(globalThis.File), { version: 3, index: 0 }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Xóa ảnh 1' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh 1' })); expect(api.removePhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa ảnh' }));
  await waitFor(() => expect(api.removePhoto).toHaveBeenCalledWith(product.id, 0, 3));
});
test('rejects oversized and SVG inputs without uploading', () => {
  show();
  for (const bad of [new globalThis.File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }), new globalThis.File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })]) {
    fireEvent.change(screen.getByLabelText('Thêm ảnh sản phẩm'), { target: { files: [bad] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/tối đa 5 MB/);
  }
  expect(api.uploadPhoto).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test('freezes writes after an uncertain result until the product is reloaded', async () => {
  api.uploadPhoto.mockRejectedValue({ code: 'NETWORK_ERROR' }); show();
  fireEvent.change(screen.getByLabelText('Thêm ảnh sản phẩm'), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa xác định ảnh đã được lưu hay chưa');
  expect(screen.getByLabelText('Thêm ảnh sản phẩm')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Lưu ảnh', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại sản phẩm' })); expect(onReload).toHaveBeenCalledTimes(1);
});
test('does not reopen an old product after an upload finishes after closing', async () => {
  let finish; api.uploadPhoto.mockReturnValue(new Promise(resolve => { finish = resolve; })); const view = show();
  fireEvent.change(screen.getByLabelText('Thêm ảnh sản phẩm'), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh', exact: true })); view.unmount();
  finish({ ...product, version: 4 }); await Promise.resolve(); expect(onSaved).not.toHaveBeenCalled();
});
test('protects unsaved text drafts and reads hidden uploads through the Admin path', () => {
  const url = `/api/v1/products/${product.id}/photos/${'b'.repeat(64)}`;
  show({ disabled: true, product: { ...product, photos: [url] } });
  expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute('src', url.replace('/products/', '/admin/products/'));
  expect(screen.getByLabelText('Thêm ảnh sản phẩm')).toBeDisabled();
  expect(screen.getByLabelText('Thay ảnh 1')).toBeDisabled();
});
