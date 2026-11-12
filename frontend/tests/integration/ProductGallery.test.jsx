import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProductGallery } from '../../src/components/product/ProductGallery.jsx';

const URLS = ['/assets/products/a.webp', '/assets/products/b.webp', '/assets/products/c.webp'];
const product = (photos, over = {}) => ({ id: 'p1', name: 'Bát inox cho chó', photos, ...over });
const thumbs = () => screen.getByRole('list', { name: 'Ảnh sản phẩm' });
const big = () => screen.getByAltText('Bát inox cho chó');

describe('Product Details gallery (D-249)', () => {
  test('with no photo it shows the brand placeholder and no thumbnail row', () => {
    const { container } = render(<ProductGallery product={product([])} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('with one photo it shows the large photo and no thumbnail row', () => {
    render(<ProductGallery product={product([URLS[0]])} />);
    expect(big()).toHaveAttribute('src', URLS[0]);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('with several photos it shows the first one large and marks its thumbnail as chosen', () => {
    render(<ProductGallery product={product(URLS)} />);
    expect(big()).toHaveAttribute('src', URLS[0]);
    const buttons = within(thumbs()).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName('Xem ảnh 1 của 3');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[2]).toHaveAccessibleName('Xem ảnh 3 của 3');
  });

  test('pressing a thumbnail changes the large photo and moves the chosen mark', () => {
    render(<ProductGallery product={product(URLS)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh 3 của 3' }));
    expect(big()).toHaveAttribute('src', URLS[2]);
    expect(screen.getByRole('button', { name: 'Xem ảnh 3 của 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Xem ảnh 1 của 3' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  test('a chosen photo that is gone from the list falls back to the first photo', () => {
    const { rerender } = render(<ProductGallery product={product(URLS)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh 2 của 3' }));
    expect(big()).toHaveAttribute('src', URLS[1]);
    rerender(<ProductGallery product={product([URLS[0], URLS[2]])} />);
    expect(big()).toHaveAttribute('src', URLS[0]);
    expect(screen.getByRole('button', { name: 'Xem ảnh 1 của 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a thumbnail that fails to load shows the placeholder and stays pressable', () => {
    render(<ProductGallery product={product(URLS)} />);
    const second = screen.getByRole('button', { name: 'Xem ảnh 2 của 3' });
    fireEvent.error(second.querySelector('img'));
    expect(second.querySelector('img')).toBeNull();
    expect(second.querySelector('svg')).not.toBeNull();
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });

  test('a large photo that fails to load shows the placeholder while the thumbnails stay', () => {
    render(<ProductGallery product={product(URLS)} />);
    fireEvent.error(big());
    expect(screen.queryByAltText('Bát inox cho chó')).toBeNull();
    expect(within(thumbs()).getAllByRole('button')).toHaveLength(3);
  });
});
