import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ProductCartProvider } from '../../src/contexts/ProductCartContext.jsx';
import { ProductListPage } from '../../src/pages/public/ProductListPage.jsx';
import { ProductDetailsPage } from '../../src/pages/public/ProductDetailsPage.jsx';
import { ShoppingCartPage } from '../../src/pages/customer/ShoppingCartPage.jsx';
import { ProductCheckoutPage } from '../../src/pages/customer/ProductCheckoutPage.jsx';
import { MyProductOrdersPage } from '../../src/pages/customer/MyProductOrdersPage.jsx';

const product = (over = {}) => ({ id: 'p1', code: 'SP-0012', name: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', category: 'FOOD', petType: 'DOG',
  sellingPrice: 250000, available: 15, inStock: true, photos: [], description: 'Hạt khô dành cho chó trưởng thành.', ...over });
const line = (over = {}) => ({ productId: 'p1', code: 'SP-0012', name: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', photos: [], unitPrice: 250000,
  quantity: 2, lineTotal: 500000, available: 15, purchasable: true, exceedsAvailable: false, ...over });
const cartOf = (lines) => { const subtotal = lines.reduce((sum, row) => sum + row.lineTotal, 0);
  return { lines, lineCount: lines.length, subtotal, total: subtotal, deliveryFee: 25000, hasUnavailable: lines.some((row) => row.exceedsAvailable || !row.purchasable) }; };
const order = (over = {}) => ({ id: 'o1', code: 'DH-0031', createdAt: '2026-10-28T03:00:00.000Z', receiveMethod: 'DELIVERY', paymentMethod: 'COD', paid: false,
  status: 'HANDED_TO_CARRIER', trackingCode: 'VN7284915603', deliveryAddress: { label: 'Nhà', location: '12 Nguyễn Trãi, Thanh Xuân, Hà Nội', areaCode: 'DISTRICT_THANH_XUAN' },
  lines: [{ productId: 'p1', productCode: 'SP-0012', productName: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', quantity: 2, unitPrice: 250000, lineTotal: 500000 }],
  subtotal: 500000, shippingFee: 25000, total: 525000, ...over });

function fakeApi(over = {}) {
  return { listProducts: jest.fn().mockResolvedValue({ data: [product()] }), getProduct: jest.fn().mockResolvedValue({ data: product() }),
    getCart: jest.fn().mockResolvedValue({ data: cartOf([]) }), addToCart: jest.fn(), setCartLine: jest.fn(), removeCartLine: jest.fn(),
    addresses: jest.fn().mockResolvedValue({ data: [{ id: 'a1', label: 'Nhà' }] }), placeOrder: jest.fn(), listOrders: jest.fn().mockResolvedValue({ data: [] }), ...over };
}
const customer = { id: 'customer-1', roles: ['CUSTOMER'] };
function Where() { const location = useLocation(); return <p data-testid="where">{location.pathname}|{location.state?.from ?? ''}|{location.state?.placed ?? ''}</p>; }
function show(api, path, user = customer) {
  const adapter = { resolve: async () => (user ? { status: 'authenticated', user } : { status: 'guest' }), getCsrfToken: () => 'csrf' };
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={adapter}><ProductCartProvider api={api}>
    <Routes>
      <Route path="/products" element={<ProductListPage />} />
      <Route path="/products/:productId" element={<ProductDetailsPage />} />
      <Route path="/customer/cart" element={<ShoppingCartPage />} />
      <Route path="/customer/product-checkout" element={<ProductCheckoutPage />} />
      <Route path="/customer/product-orders" element={<><MyProductOrdersPage /><Where /></>} />
      <Route path="/sign-in" element={<Where />} />
    </Routes></ProductCartProvider></SessionProvider></MemoryRouter>);
}

describe('Product List', () => {
  test('shows each product with price and availability and links to its details', async () => {
    const api = fakeApi({ listProducts: jest.fn().mockResolvedValue({ data: [product(), product({ id: 'p2', code: 'SP-0035', name: 'Vòng cổ có chuông, cỡ M',
      category: 'ACCESSORY', sellingPrice: 60000, available: 0, inStock: false })] }) });
    show(api, '/products', null);
    expect(await screen.findByText('Hiển thị 2 sản phẩm')).toBeVisible();
    expect(screen.getByText('250.000 đ')).toBeVisible();
    expect(screen.getByText('Còn hàng')).toBeVisible();
    expect(screen.getByText('Hết hàng')).toBeVisible();
    expect(screen.getByRole('link', { name: /Xem chi tiết Thức ăn hạt cho chó/ })).toHaveAttribute('href', '/products/p1');
  });

  test('filters by pet type and searches by name', async () => {
    const api = fakeApi();
    show(api, '/products', null);
    await screen.findByText('Hiển thị 1 sản phẩm');
    fireEvent.click(screen.getByRole('button', { name: 'Chó' }));
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith({ search: '', category: '', petType: 'DOG' }, expect.any(Object)));
    expect(screen.getByRole('button', { name: 'Chó' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm sản phẩm theo tên' }), { target: { value: 'pate' } });
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith({ search: 'pate', category: '', petType: 'DOG' }, expect.any(Object)));
  });

  test('says so when nothing matches and offers a retry on failure', async () => {
    show(fakeApi({ listProducts: jest.fn().mockResolvedValue({ data: [] }) }), '/products', null);
    expect(await screen.findByText('Không tìm thấy sản phẩm nào.')).toBeVisible();
  });

  test('does not present a failed load as an empty shop', async () => {
    const listProducts = jest.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'NETWORK_ERROR' })).mockResolvedValueOnce({ data: [product()] });
    show(fakeApi({ listProducts }), '/products', null);
    expect(await screen.findByText('Chưa tải được sản phẩm')).toBeVisible();
    expect(screen.queryByText('Không tìm thấy sản phẩm nào.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Hiển thị 1 sản phẩm')).toBeVisible();
  });
});

describe('Product Details', () => {
  test('locks the add button with the out-of-stock message', async () => {
    show(fakeApi({ getProduct: jest.fn().mockResolvedValue({ data: product({ available: 0, inStock: false }) }) }), '/products/p1');
    expect(await screen.findByText('Sản phẩm này đã hết hàng.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' })).toBeDisabled();
  });

  test('adds the chosen quantity and confirms with the cart link', async () => {
    const api = fakeApi({ addToCart: jest.fn().mockResolvedValue(cartOf([line({ quantity: 2 })])) });
    show(api, '/products/p1');
    await screen.findByRole('heading', { name: /Thức ăn hạt cho chó/ });
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));
    expect(await screen.findByText(/Đã thêm sản phẩm vào giỏ hàng/)).toBeVisible();
    expect(api.addToCart).toHaveBeenCalledWith('p1', 2);
    expect(screen.getByRole('link', { name: 'Xem giỏ hàng' })).toHaveAttribute('href', '/customer/cart');
  });

  test('AC-13 pressing + at the sellable quantity shows MSG58 and the number does not go up (D-219)', async () => {
    const api = fakeApi({ getProduct: jest.fn().mockResolvedValue({ data: product({ available: 2 }) }) });
    show(api, '/products/p1');
    await screen.findByRole('heading', { name: /Thức ăn hạt cho chó/ });
    const quantity = () => screen.getByRole('status', { name: 'Số lượng' });
    const increase = screen.getByRole('button', { name: 'Tăng số lượng' });
    fireEvent.click(increase);
    expect(quantity()).toHaveTextContent('2');
    expect(screen.queryByText(/Chỉ còn/)).not.toBeInTheDocument();
    fireEvent.click(increase);
    expect(screen.getByText('Chỉ còn 2 sản phẩm. Vui lòng giảm số lượng.')).toBeVisible();
    expect(quantity()).toHaveTextContent('2');
    expect(increase).toHaveAttribute('aria-disabled', 'true');
    expect(api.addToCart).not.toHaveBeenCalled();
    // The warning is about the old number, so it goes once the customer lowers it.
    fireEvent.click(screen.getByRole('button', { name: 'Giảm số lượng' }));
    expect(screen.queryByText(/Chỉ còn/)).not.toBeInTheDocument();
    expect(quantity()).toHaveTextContent('1');
  });

  test('AC-13 shows MSG58 for the only sellable item instead of silently locking +', async () => {
    show(fakeApi({ getProduct: jest.fn().mockResolvedValue({ data: product({ available: 1 }) }) }), '/products/p1');
    await screen.findByRole('heading', { name: /Thức ăn hạt cho chó/ });
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
    expect(screen.getByText('Chỉ còn 1 sản phẩm. Vui lòng giảm số lượng.')).toBeVisible();
  });

  test('AC-13 out of stock still locks the stepper and shows only MSG98', async () => {
    show(fakeApi({ getProduct: jest.fn().mockResolvedValue({ data: product({ available: 0, inStock: false }) }) }), '/products/p1');
    expect(await screen.findByText('Sản phẩm này đã hết hàng.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
    expect(screen.queryByText(/Chỉ còn/)).not.toBeInTheDocument();
  });

  test('re-reads the stock and shows how many are left when the quantity is too high', async () => {
    const error = Object.assign(new Error('x'), { code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', status: 409 });
    const api = fakeApi({ addToCart: jest.fn().mockRejectedValue(error) });
    show(api, '/products/p1');
    await screen.findByRole('heading', { name: /Thức ăn hạt cho chó/ });
    api.getProduct.mockResolvedValue({ data: product({ available: 1 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));
    expect(await screen.findByText('Chỉ còn 1 sản phẩm. Vui lòng giảm số lượng.')).toBeVisible();
  });

  test('sends a guest to sign in and remembers the product page', async () => {
    const api = fakeApi();
    show(api, '/products/p1', null);
    await screen.findByRole('heading', { name: /Thức ăn hạt cho chó/ });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/sign-in|/products/p1');
    expect(api.addToCart).not.toHaveBeenCalled();
  });
});

describe('Shopping Cart', () => {
  test('explains an empty cart', async () => {
    show(fakeApi(), '/customer/cart');
    expect(await screen.findByText('Giỏ hàng của bạn đang trống. Vui lòng chọn sản phẩm trước.')).toBeVisible();
  });

  test('lists lines with totals, changes quantity and removes a line', async () => {
    const api = fakeApi({ getCart: jest.fn().mockResolvedValue({ data: cartOf([line(), line({ productId: 'p3', code: 'SP-0031', name: 'Dây dắt chó, dài 1,2 m',
      unitPrice: 100000, quantity: 1, lineTotal: 100000, available: 9 })]) }),
    setCartLine: jest.fn().mockResolvedValue(cartOf([line({ quantity: 3, lineTotal: 750000 })])),
    removeCartLine: jest.fn().mockResolvedValue(cartOf([])) });
    show(api, '/customer/cart');
    expect(await screen.findByText('2 sản phẩm')).toBeVisible();
    const summary = screen.getByRole('complementary', { name: 'Tóm tắt giỏ hàng' });
    expect(within(summary).getAllByText('600.000 đ')).toHaveLength(2);
    expect(within(summary).getByRole('link', { name: 'Thanh toán' })).toHaveAttribute('href', '/customer/product-checkout');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tăng số lượng' })[0]);
    await waitFor(() => expect(api.setCartLine).toHaveBeenCalledWith('p1', 3));    fireEvent.click(await screen.findByRole('button', { name: /Xoá .* khỏi giỏ hàng/ }));
    await waitFor(() => expect(api.removeCartLine).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Giỏ hàng của bạn đang trống. Vui lòng chọn sản phẩm trước.')).toBeVisible();
  });

  test('AC-14 keeps + locked at the sellable quantity in the cart, unlike Product Details', async () => {
    show(fakeApi({ getCart: jest.fn().mockResolvedValue({ data: cartOf([line({ quantity: 15, available: 15, lineTotal: 3750000 })]) }) }), '/customer/cart');
    expect(await screen.findByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
  });

  test('blocks checkout while a line exceeds what can be sold', async () => {
    const api = fakeApi({ getCart: jest.fn().mockResolvedValue({ data: cartOf([line({ quantity: 5, available: 2, exceedsAvailable: true })]) }) });
    show(api, '/customer/cart');
    expect(await screen.findByText('Chỉ còn 2 sản phẩm. Vui lòng giảm số lượng.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeDisabled();
  });
});

describe('Product Checkout', () => {
  const withCart = (over = {}) => fakeApi({ getCart: jest.fn().mockResolvedValue({ data: cartOf([line()]) }), ...over });

  test('asks for an address before a delivery order when there are several and does not call the API', async () => {
    const api = withCart({ addresses: jest.fn().mockResolvedValue({ data: [{ id: 'a1', label: 'Nhà' }, { id: 'a2', label: 'Văn phòng' }] }) });
    show(api, '/customer/product-checkout');
    await screen.findByRole('option', { name: 'Văn phòng' });
    expect(screen.getByLabelText('Địa chỉ nhận hàng')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect(await screen.findByText('Vui lòng chọn địa chỉ nhận hàng.')).toBeVisible();
    expect(api.placeOrder).not.toHaveBeenCalled();
  });

  test('preselects the only saved address so the order can be placed without choosing', async () => {
    const api = withCart({ placeOrder: jest.fn().mockResolvedValue(order()) });
    show(api, '/customer/product-checkout');
    await waitFor(() => expect(screen.getByLabelText('Địa chỉ nhận hàng')).toHaveValue('a1'));
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/customer/product-orders||DH-0031');
    expect(api.placeOrder).toHaveBeenCalledWith({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: 'a1' }, expect.stringMatching(/^product-order:/));
  });

  test('previews the delivery fee from the cart and places a COD delivery order', async () => {
    const api = withCart({ placeOrder: jest.fn().mockResolvedValue(order()) });
    show(api, '/customer/product-checkout');
    const summary = await screen.findByRole('complementary', { name: 'Đơn hàng của bạn' });
    expect(within(summary).getByText('25.000 đ')).toBeVisible();
    expect(within(summary).getByText('525.000 đ')).toBeVisible();
    fireEvent.change(await screen.findByLabelText('Địa chỉ nhận hàng'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/customer/product-orders||DH-0031');
    expect(api.placeOrder).toHaveBeenCalledWith({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: 'a1' }, expect.stringMatching(/^product-order:/));
  });

  test('pickup needs no address, has no delivery fee and is paid at the shop', async () => {
    const api = withCart({ placeOrder: jest.fn().mockResolvedValue(order({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', shippingFee: 0, total: 500000, deliveryAddress: null })) });
    show(api, '/customer/product-checkout');
    fireEvent.click(await screen.findByLabelText(/Nhận tại cửa hàng/));
    expect(screen.queryByLabelText('Địa chỉ nhận hàng')).not.toBeInTheDocument();
    expect(screen.getByText('Trả tại cửa hàng')).toBeVisible();
    expect(screen.queryByText('Phí giao hàng')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    await waitFor(() => expect(api.placeOrder).toHaveBeenCalledWith({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, expect.any(String)));
  });

  test('reports a stock conflict with the refreshed quantity and creates no order', async () => {
    const error = Object.assign(new Error('x'), { code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', status: 409 });
    const api = withCart({ placeOrder: jest.fn().mockRejectedValue(error) });
    show(api, '/customer/product-checkout');
    fireEvent.click(await screen.findByLabelText(/Nhận tại cửa hàng/));
    api.getCart.mockResolvedValue({ data: cartOf([line({ quantity: 2, available: 1, exceedsAvailable: true })]) });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect(await screen.findByText('Chỉ còn 1 sản phẩm. Vui lòng giảm số lượng.')).toBeVisible();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  test('says a service-area failure plainly', async () => {
    const error = Object.assign(new Error('x'), { code: 'ADDRESS_OUT_OF_SERVICE_AREA', status: 422 });
    show(withCart({ placeOrder: jest.fn().mockRejectedValue(error) }), '/customer/product-checkout');
    fireEvent.change(await screen.findByLabelText('Địa chỉ nhận hàng'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect(await screen.findByText('Rất tiếc, chúng tôi chưa phục vụ địa chỉ này.')).toBeVisible();
  });

  test('reuses the same operation key when the outcome was uncertain', async () => {
    const timeout = Object.assign(new Error('x'), { code: 'TIMEOUT' });
    const api = withCart({ placeOrder: jest.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(order()) });
    show(api, '/customer/product-checkout');
    fireEvent.change(await screen.findByLabelText('Địa chỉ nhận hàng'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect(await screen.findByText(/Chưa nhận được xác nhận đơn hàng/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    await waitFor(() => expect(api.placeOrder).toHaveBeenCalledTimes(2));
    expect(api.placeOrder.mock.calls[1][1]).toBe(api.placeOrder.mock.calls[0][1]);
  });
});

describe('My Orders', () => {
  test('explains that there are no orders yet', async () => {
    show(fakeApi(), '/customer/product-orders');
    expect(await screen.findByText('Bạn chưa có đơn hàng nào.')).toBeVisible();
  });

  test('lists orders, shows the selected order with its tracking code and confirms a fresh order', async () => {
    const delivered = order({ id: 'o2', code: 'DH-0024', status: 'DELIVERED', paid: true, trackingCode: 'VN0000000001' });
    show(fakeApi({ listOrders: jest.fn().mockResolvedValue({ data: [order(), delivered] }) }), '/customer/product-orders');
    expect(await screen.findByRole('complementary', { name: 'Chi tiết đơn DH-0031' })).toHaveTextContent('VN7284915603');
    fireEvent.click(screen.getByRole('button', { name: 'Xem đơn DH-0024' }));
    const detail = await screen.findByRole('complementary', { name: 'Chi tiết đơn DH-0024' });
    expect(detail).toHaveTextContent('Đã giao hàng');
    expect(detail).toHaveTextContent('Đã thanh toán');
    expect(within(detail).getByText('12 Nguyễn Trãi, Thanh Xuân, Hà Nội')).toBeVisible();
  });
});
