import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProductImageManager } from '../../src/components/product/ProductImageManager.jsx';

// Layout of the photo row (D-249). The upload rules and the API calls are covered by ProductImageManager.test.jsx.
const photos = (count) => Array.from({ length: count }, (_, index) => `/assets/products/photo-${index + 1}.webp`);
const product = (count) => ({ id: 'a'.repeat(24), version: 3, photos: photos(count) });
const file = () => new globalThis.File(['synthetic image bytes'], 'bowl.png', { type: 'image/png' });
let api, onSaved;
beforeEach(() => {
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-preview');
  URL.revokeObjectURL = jest.fn();
  api = { uploadPhoto: jest.fn(), removePhoto: jest.fn() };
  onSaved = jest.fn();
});
function show(count, props = {}) {
  return render(<ProductImageManager product={product(count)} api={api} onSaved={onSaved} onReload={jest.fn()} onBusy={jest.fn()} {...props} />);
}
const row = () => screen.getByRole('list', { name: 'Ảnh hiện có' });

describe('Product photo row', () => {
  test('lists one tile per photo with its own replace and delete controls, then the add tile', () => {
    show(3);
    expect(within(row()).getAllByRole('listitem')).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      expect(screen.getByAltText(`Ảnh sản phẩm ${n}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Thay ảnh ${n}`)).toBeEnabled();
      expect(screen.getByRole('button', { name: `Xóa ảnh ${n}` })).toBeEnabled();
    }
    expect(screen.getByLabelText('Thêm ảnh sản phẩm')).toBeEnabled();
  });

  test('only the first photo is the cover', () => {
    show(3);
    const cover = screen.getAllByRole('listitem', { name: 'Ảnh đại diện' });
    expect(cover).toHaveLength(1);
    expect(within(cover[0]).getByAltText('Ảnh sản phẩm 1')).toBeInTheDocument();
    expect(cover[0]).toHaveAttribute('title', 'Ảnh đại diện');
  });

  test('with no photo there is no cover and the add tile is the only control', () => {
    show(0);
    expect(within(row()).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('listitem', { name: 'Ảnh đại diện' })).toBeNull();
    expect(screen.getByLabelText('Thêm ảnh sản phẩm')).toBeEnabled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('the add tile is gone at five photos, and four photos still have it', () => {
    const { unmount } = show(4);
    expect(screen.getByLabelText('Thêm ảnh sản phẩm')).toBeInTheDocument();
    unmount();
    show(5);
    expect(screen.queryByLabelText('Thêm ảnh sản phẩm')).toBeNull();
    expect(screen.getAllByLabelText(/^Thay ảnh \d$/)).toHaveLength(5);
  });

  test('delete on the second tile asks about the second photo only', async () => {
    api.removePhoto.mockResolvedValue({ ...product(2), photos: photos(3).slice(0, 2), version: 4 });
    show(3);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh 2' }));
    expect(screen.getByText('Xóa ảnh 2 khỏi sản phẩm?')).toBeVisible();
    expect(api.removePhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa ảnh' }));
    await waitFor(() => expect(api.removePhoto).toHaveBeenCalledWith(product(3).id, 1, 3));
  });

  test('replace on the third tile previews the file and saves it at that position', async () => {
    api.uploadPhoto.mockResolvedValue({ ...product(3), version: 4 });
    show(3);
    fireEvent.change(screen.getByLabelText('Thay ảnh 3'), { target: { files: [file()] } });
    expect(await screen.findByText(/Thay ảnh 3 — bowl\.png/)).toBeVisible();
    expect(screen.getByAltText('Xem trước ảnh sản phẩm')).toHaveAttribute('src', 'blob:synthetic-preview');
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh', exact: true }));
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(product(3).id, expect.any(globalThis.File), { version: 3, index: 2 }));
  });

  test('the add tile saves a new photo at the end of the row', async () => {
    api.uploadPhoto.mockResolvedValue({ ...product(4), version: 4 });
    show(3);
    fireEvent.change(screen.getByLabelText('Thêm ảnh sản phẩm'), { target: { files: [file()] } });
    expect(await screen.findByText(/Ảnh mới — bowl\.png/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh', exact: true }));
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(product(3).id, expect.any(globalThis.File), { version: 3, index: undefined }));
  });

  test('while text changes are unsaved every tile control is locked', () => {
    show(2, { disabled: true });
    expect(screen.getByText('Lưu thay đổi thông tin trước khi sửa ảnh.')).toBeVisible();
    expect(screen.getByLabelText('Thêm ảnh sản phẩm')).toBeDisabled();
    for (const n of [1, 2]) {
      expect(screen.getByLabelText(`Thay ảnh ${n}`)).toBeDisabled();
      expect(screen.getByRole('button', { name: `Xóa ảnh ${n}` })).toBeDisabled();
    }
  });
});
